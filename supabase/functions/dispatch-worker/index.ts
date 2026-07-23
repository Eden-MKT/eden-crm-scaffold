// Disparador WhatsApp — FASE 2: worker de fila.
//
// Chamado a cada 1 min pelo pg_cron (job 'dispatch-worker-1min' →
// invoke_edge_function) ou manualmente pelo painel (staff). Consome a
// dispatch_queue em lotes com FOR UPDATE SKIP LOCKED (claim_dispatch_batch),
// aplica todos os checks de compliance ANTES de enviar (suppression, opt-in,
// cooldown, janela horária, cap diário, limite 24h da Meta) e envia via
// Evolution API (número não-oficial) ou WhatsApp Cloud API (oficial).
//
// Env necessário:
// - CRON_SECRET             (auth do cron — já usado pelas outras functions)
// - EVOLUTION_API_URL/KEY   (provider 'evolution' — já configurados)
// - WA_CLOUD_TOKEN          (provider 'cloud': token permanente da Meta para a
//   Graph API. Sem ele, envios cloud marcam 'falha' com last_error claro —
//   nunca crasham o worker.)
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireCron, requireStaff } from "../_shared/portal.ts";
import { sendText } from "../_shared/evolution.ts";

const TZ = "America/Sao_Paulo";
const BATCH_SIZE = 20;
// Backpressure: se o lote passar de 40s, devolve o resto para o próximo ciclo
// (o cron roda a cada 1 min; estourar o tempo da function derrubaria envios).
const BATCH_BUDGET_MS = 40_000;
const MAX_TENTATIVAS = 3;

// Limite deslizante de 24h da Meta por tier de messaging (só provider cloud).
const MESSAGING_LIMITS: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  UNLIMITED: Number.POSITIVE_INFINITY,
};

// Códigos de erro permanentes da Cloud API: número não-whatsapp / fora da
// janela de reengajamento / experimento — reenviar nunca vai funcionar.
const PERMANENT_WA_CODES = new Set(["131026", "131047", "470"]);

// ---------------------------------------------------------------------------
// Fuso horário (mesma técnica Intl de _shared/agenda.ts, restrita a SP).
// ---------------------------------------------------------------------------
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

// Partes de parede (data/hora) do instante `date` em SP.
function spParts(date: Date): { y: number; m: number; d: number; hour: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hour: Number(map.hour) % 24,
  };
}

// Converte horário de parede SP → instante UTC (com correção de offset em
// viradas de DST, como zonedToUtc de _shared/agenda.ts).
function spWallToUtc(y: number, m: number, d: number, hour: number): Date {
  const naive = Date.UTC(y, m - 1, d, hour, 0, 0); // Date.UTC normaliza overflow de dia
  const off1 = tzOffsetMs(new Date(naive));
  let utc = new Date(naive - off1);
  const off2 = tzOffsetMs(utc);
  if (off2 !== off1) utc = new Date(naive - off2);
  return utc;
}

// Próxima abertura da janela da campanha: hoje (dayOffset 0) ou amanhã (1)
// no horário de início, em UTC.
function nextWindowOpenUtc(startHour: number, dayOffset: number): Date {
  const p = spParts(new Date());
  return spWallToUtc(p.y, p.m, p.d + dayOffset, startHour);
}

// Meia-noite de hoje em SP, como instante UTC (base do cap diário).
function spMidnightUtc(): Date {
  const p = spParts(new Date());
  return spWallToUtc(p.y, p.m, p.d, 0);
}

// ---------------------------------------------------------------------------
// Renderização de texto e parâmetros de template
// ---------------------------------------------------------------------------
function renderText(corpo: string, vars: Record<string, string>): string {
  return corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (full, key) => vars[key] ?? full);
}

// Parâmetros do body do template cloud, na ordem posicional.
// var_map ex.: {"1": "nome", "2": "empresa"} — posição → campo das variables.
function templateBodyParams(varMap: unknown, vars: Record<string, string>): string[] {
  if (varMap && typeof varMap === "object" && !Array.isArray(varMap)) {
    const keys = Object.keys(varMap as Record<string, string>).sort(
      (a, b) => Number(a) - Number(b),
    );
    if (keys.length) {
      return keys.map((k) => vars[(varMap as Record<string, string>)[k]] ?? "");
    }
  }
  if (Array.isArray(varMap)) return varMap.map((k) => vars[String(k)] ?? "");
  // Fallback: variables com chaves numéricas ("1", "2", ...).
  return Object.keys(vars)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => vars[k]);
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
class SendError extends Error {
  httpStatus: number;
  waCode: string | null;
  invalidNumber: boolean;
  constructor(msg: string, httpStatus: number, waCode: string | null, invalidNumber = false) {
    super(msg);
    this.httpStatus = httpStatus;
    this.waCode = waCode;
    this.invalidNumber = invalidNumber;
  }
}

function isPermanent(e: SendError): boolean {
  return (
    e.invalidNumber ||
    (e.httpStatus === 400 && e.waCode !== null && PERMANENT_WA_CODES.has(e.waCode))
  );
}

// deno-lint-ignore no-explicit-any
async function sendCloud(account: any, to: string, payload: unknown): Promise<string | null> {
  const token = Deno.env.get("WA_CLOUD_TOKEN");
  if (!token) {
    throw new SendError(
      "WA_CLOUD_TOKEN não configurado (Settings → Edge Functions → Secrets)",
      400,
      null,
    );
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...(payload as object) }),
  });
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = data?.error?.code != null ? String(data.error.code) : null;
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    throw new SendError(`cloud: ${msg}`, res.status, code, code === "131030");
  }
  return data?.messages?.[0]?.id ?? null;
}

async function sendEvolution(
  instance: string,
  telefone: string,
  text: string,
): Promise<string | null> {
  try {
    // deno-lint-ignore no-explicit-any
    const res = (await sendText(instance, telefone.replace(/^\+/, ""), text, 0)) as any;
    return res?.key?.id ?? null;
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const status = Number(msg.match(/->\s*(\d{3})/)?.[1] ?? 0);
    const invalid = /exists"?\s*:\s*false|not.*whatsapp|invalid.*number/i.test(msg);
    throw new SendError(msg.slice(0, 400), status, null, invalid);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  const db = admin();

  // Cron (x-cron-token) OU staff logado (disparo manual do painel).
  if (!requireCron(req) && !(await requireStaff(db, req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const t0 = Date.now();
  const summary = { claimed: 0, enviados: 0, suprimidos: 0, reagendados: 0, falhas: 0 };

  // (0) Recupera locks órfãos (worker que morreu no meio de um lote).
  await db.rpc("reap_dispatch_locks");

  // (1) Reivindica o lote (FOR UPDATE SKIP LOCKED — seguro p/ concorrência).
  const { data: claimed, error: claimErr } = await db.rpc("claim_dispatch_batch", {
    p_batch: BATCH_SIZE,
  });
  if (claimErr) return json({ error: claimErr.message }, 500);
  // deno-lint-ignore no-explicit-any
  const items: any[] = claimed ?? [];
  summary.claimed = items.length;
  if (!items.length) return json(summary);

  // Prefetch em lote: campanhas (+conta), templates, contatos, suppression,
  // janelas de sessão de 24h.
  const campaignIds = [...new Set(items.map((i) => i.campaign_id))];
  const contactIds = [...new Set(items.map((i) => i.contact_id))];
  const [{ data: camps }, { data: contacts }] = await Promise.all([
    db.from("campaigns").select("*, wa_accounts(*)").in("id", campaignIds),
    db.from("dispatch_contacts").select("*").in("id", contactIds),
  ]);
  // deno-lint-ignore no-explicit-any
  const campById = new Map<string, any>((camps ?? []).map((c: any) => [c.id, c]));
  // deno-lint-ignore no-explicit-any
  const contactById = new Map<string, any>((contacts ?? []).map((c: any) => [c.id, c]));

  const templateIds = [
    ...new Set(
      (camps ?? []).map((c: { template_id: string | null }) => c.template_id).filter(Boolean),
    ),
  ];
  const phones = [...new Set((contacts ?? []).map((c: { telefone: string }) => c.telefone))];
  const [tplRes, supRes, sessRes] = await Promise.all([
    templateIds.length
      ? db.from("wa_templates").select("*").in("id", templateIds)
      : Promise.resolve({ data: [] }),
    phones.length
      ? db.from("suppression_list").select("telefone").in("telefone", phones)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? db.from("session_windows").select("contact_id, expira_em").in("contact_id", contactIds)
      : Promise.resolve({ data: [] }),
  ]);
  // deno-lint-ignore no-explicit-any
  const tplById = new Map<string, any>((tplRes.data ?? []).map((t: any) => [t.id, t]));
  const suppressed = new Set((supRes.data ?? []).map((s: { telefone: string }) => s.telefone));
  const sessionByContact = new Map<string, string>(
    (sessRes.data ?? []).map((s: { contact_id: string; expira_em: string }) => [
      s.contact_id,
      s.expira_em,
    ]),
  );

  // Caches de contagem (evita repetir count por item do mesmo alvo).
  const capCountByCampaign = new Map<string, number>();
  const dayCountByAccount = new Map<string, number>();
  // Estatísticas do lote p/ circuit breaker: tentativas reais de envio × falhas.
  const breakerStats = new Map<string, { attempts: number; falhas: number }>();

  // deno-lint-ignore no-explicit-any
  async function updateItem(id: string, patch: Record<string, any>) {
    await db.from("dispatch_queue").update(patch).eq("id", id);
  }

  // deno-lint-ignore no-explicit-any
  async function suprimir(item: any, motivo: string) {
    await updateItem(item.id, { status: "suprimido", motivo_supressao: motivo, locked_at: null });
    summary.suprimidos++;
  }

  // deno-lint-ignore no-explicit-any
  async function reagendar(item: any, quando: Date) {
    await updateItem(item.id, {
      status: "pendente",
      scheduled_at: quando.toISOString(),
      locked_at: null,
    });
    summary.reagendados++;
  }

  let idx = 0;
  for (; idx < items.length; idx++) {
    // Backpressure: estourou o orçamento do ciclo → devolve o resto.
    if (Date.now() - t0 > BATCH_BUDGET_MS) break;

    const item = items[idx];
    const camp = campById.get(item.campaign_id);
    const contato = contactById.get(item.contact_id);
    const conta = camp?.wa_accounts;

    if (!camp || !contato || !conta) {
      await updateItem(item.id, {
        status: "falha",
        last_error: "campanha/contato/conta não encontrado",
        locked_at: null,
      });
      summary.falhas++;
      continue;
    }

    // (b) Checks de compliance — qualquer falha suprime, NUNCA envia.
    if (suppressed.has(contato.telefone)) {
      await suprimir(item, "suppression_list");
      continue;
    }
    if (!contato.opt_in) {
      await suprimir(item, "sem_opt_in");
      continue;
    }
    const cooldownMs = (camp.cooldown_dias ?? 0) * 86_400_000;
    if (
      contato.ultimo_disparo_em &&
      Date.now() - new Date(contato.ultimo_disparo_em).getTime() < cooldownMs
    ) {
      await suprimir(item, "cooldown");
      continue;
    }
    if (camp.status !== "rodando") {
      await suprimir(item, "campanha_nao_rodando");
      continue;
    }
    if (conta.status !== "ativa") {
      await suprimir(item, "conta_pausada");
      continue;
    }

    // (c) Janela horária [inicio, fim) em SP → fora, reagenda p/ próxima abertura.
    const horaSp = spParts(new Date()).hour;
    if (horaSp < camp.janela_hora_inicio || horaSp >= camp.janela_hora_fim) {
      const dayOffset = horaSp < camp.janela_hora_inicio ? 0 : 1;
      await reagendar(item, nextWindowOpenUtc(camp.janela_hora_inicio, dayOffset));
      continue;
    }

    // (d) Cap diário da campanha (outbound desde a meia-noite SP).
    let capCount = capCountByCampaign.get(camp.id);
    if (capCount === undefined) {
      const { count } = await db
        .from("wa_message_log")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", camp.id)
        .eq("direcao", "outbound")
        .gte("sent_at", spMidnightUtc().toISOString());
      capCount = count ?? 0;
      capCountByCampaign.set(camp.id, capCount);
    }
    if (capCount >= camp.cap_diario) {
      await reagendar(item, nextWindowOpenUtc(camp.janela_hora_inicio, 1));
      continue;
    }

    // (e) Limite 24h deslizante da Meta (só cloud; evolution não tem tier).
    if (conta.provider === "cloud") {
      const limit =
        MESSAGING_LIMITS[conta.messaging_limit ?? "UNLIMITED"] ?? Number.POSITIVE_INFINITY;
      if (Number.isFinite(limit)) {
        let dayCount = dayCountByAccount.get(conta.id);
        if (dayCount === undefined) {
          const { count } = await db
            .from("wa_message_log")
            .select("id", { count: "exact", head: true })
            .eq("wa_account_id", conta.id)
            .eq("direcao", "outbound")
            .gte("sent_at", new Date(Date.now() - 86_400_000).toISOString());
          dayCount = count ?? 0;
          dayCountByAccount.set(conta.id, dayCount);
        }
        if (dayCount >= limit) {
          await reagendar(item, new Date(Date.now() + 3_600_000));
          continue;
        }
      }
    }

    // (f) Envio.
    const vars: Record<string, string> = {
      nome: contato.nome ?? "",
      empresa: contato.empresa ?? "",
      ...(item.variables ?? {}),
    };
    const stats = breakerStats.get(conta.id) ?? { attempts: 0, falhas: 0 };
    breakerStats.set(conta.id, stats);

    let wamid: string | null = null;
    let sendOk = false;
    let sendErr: SendError | null = null;
    const tpl = camp.template_id ? tplById.get(camp.template_id) : null;

    try {
      if (conta.provider === "evolution") {
        const texto = renderText(camp.corpo_livre ?? tpl?.corpo ?? "", vars);
        stats.attempts++;
        wamid = await sendEvolution(conta.evolution_instance, contato.telefone, texto);
        sendOk = true;
      } else {
        // cloud: texto livre só dentro da janela de sessão de 24h; fora dela a
        // Meta exige template APROVADO.
        const sessExp = sessionByContact.get(contato.id);
        const to = contato.telefone.replace(/^\+/, "");
        if (sessExp && new Date(sessExp).getTime() > Date.now()) {
          const texto = renderText(camp.corpo_livre ?? tpl?.corpo ?? "", vars);
          stats.attempts++;
          wamid = await sendCloud(conta, to, { type: "text", text: { body: texto } });
          sendOk = true;
        } else {
          if (!tpl || tpl.status_meta !== "APPROVED") {
            await updateItem(item.id, {
              status: "falha",
              last_error: "template não aprovado",
              locked_at: null,
            });
            summary.falhas++;
            stats.falhas++;
            continue;
          }
          const params = templateBodyParams(tpl.var_map, vars);
          stats.attempts++;
          wamid = await sendCloud(conta, to, {
            type: "template",
            template: {
              name: tpl.nome,
              language: { code: tpl.idioma ?? "pt_BR" },
              components: params.length
                ? [
                    {
                      type: "body",
                      parameters: params.map((p) => ({ type: "text", text: p })),
                    },
                  ]
                : [],
            },
          });
          sendOk = true;
        }
      }
    } catch (e) {
      sendErr = e instanceof SendError ? e : new SendError(String(e).slice(0, 400), 0, null);
    }

    if (sendOk) {
      // (g) Sucesso: marca enviado + log + ultimo_disparo_em. NÃO marca
      // 'contatado' — só resposta inbound marca (fase 3).
      await updateItem(item.id, { status: "enviado", locked_at: null, last_error: null });
      await db.from("wa_message_log").insert({
        wamid,
        campaign_id: camp.id,
        contact_id: contato.id,
        wa_account_id: conta.id,
        direcao: "outbound",
        status: conta.provider === "cloud" ? "accepted" : "sent",
        sent_at: new Date().toISOString(),
      });
      await db
        .from("dispatch_contacts")
        .update({ ultimo_disparo_em: new Date().toISOString() })
        .eq("id", contato.id);
      capCountByCampaign.set(camp.id, capCount + 1);
      dayCountByAccount.set(conta.id, (dayCountByAccount.get(conta.id) ?? 0) + 1);
      summary.enviados++;
    } else if (sendErr) {
      // (h) Erro: permanente suprime o número; transitório faz backoff 2^n min.
      if (isPermanent(sendErr)) {
        await updateItem(item.id, {
          status: "falha",
          last_error: sendErr.message.slice(0, 500),
          locked_at: null,
        });
        const { data: already } = await db
          .from("suppression_list")
          .select("id")
          .eq("telefone", contato.telefone)
          .limit(1);
        if (!already?.length) {
          await db.from("suppression_list").insert({
            telefone: contato.telefone,
            motivo: "erro_permanente",
            origem: "dispatch-worker",
          });
        }
        suppressed.add(contato.telefone);
        summary.falhas++;
        stats.falhas++;
      } else {
        // Transitório (429/5xx/rede) e desconhecido (ex.: 404 de instância):
        // retry com backoff exponencial (2^tentativas min), até MAX_TENTATIVAS.
        const tentativas = (item.tentativas ?? 0) + 1;
        if (tentativas < MAX_TENTATIVAS) {
          await updateItem(item.id, {
            status: "pendente",
            tentativas,
            last_error: sendErr.message.slice(0, 500),
            scheduled_at: new Date(Date.now() + 2 ** tentativas * 60_000).toISOString(),
            locked_at: null,
          });
          summary.reagendados++;
        } else {
          await updateItem(item.id, {
            status: "falha",
            tentativas,
            last_error: sendErr.message.slice(0, 500),
            locked_at: null,
          });
          summary.falhas++;
          stats.falhas++;
        }
      }
    }

    // Throughput da conta: espaça envios (mín. 500ms) p/ não tomar rate limit
    // nem parecer robô. Só espera se ainda há itens no lote.
    if (idx < items.length - 1 && (sendOk || sendErr)) {
      const tput = Number(conta.throughput_msg_por_segundo) || 0.2;
      await sleep(Math.max(500, 1000 / tput));
    }
  }

  // Backpressure: devolve itens não processados para o próximo ciclo.
  if (idx < items.length) {
    const restIds = items.slice(idx).map((i) => i.id);
    await db
      .from("dispatch_queue")
      .update({ status: "pendente", locked_at: null })
      .in("id", restIds);
    summary.reagendados += restIds.length;
  }

  // Circuit breaker: conta com >50% de falha (>=5 tentativas no lote) ou
  // quality_tier degradado (YELLOW/RED) é pausada junto com as campanhas
  // 'rodando' dela. Reversão SÓ manual pelo painel — sem auto-resume.
  const accountsSeen = new Map<string, unknown>();
  for (const it of items) {
    const acc = campById.get(it.campaign_id)?.wa_accounts;
    if (acc) accountsSeen.set(acc.id, acc);
  }
  for (const [accId, accRaw] of accountsSeen) {
    // deno-lint-ignore no-explicit-any
    const acc = accRaw as any;
    const s = breakerStats.get(accId);
    const failRate = s && s.attempts >= 5 ? s.falhas / s.attempts : 0;
    const degraded = acc.quality_tier === "YELLOW" || acc.quality_tier === "RED";
    if (acc.status === "ativa" && (failRate > 0.5 || degraded)) {
      const motivo = degraded
        ? `quality_tier ${acc.quality_tier}`
        : `taxa de falha ${Math.round(failRate * 100)}% no lote`;
      await db
        .from("wa_accounts")
        .update({ status: "pausada", pausado_em: new Date().toISOString(), pausado_motivo: motivo })
        .eq("id", accId);
      await db
        .from("campaigns")
        .update({ status: "pausada" })
        .eq("wa_account_id", accId)
        .eq("status", "rodando");
    }
  }

  return json(summary);
});
