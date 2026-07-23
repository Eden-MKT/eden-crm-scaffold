// Disparador WhatsApp — FASE 4: painel de administração (staff).
//
// Endpoint único acionado pelo front (supabase.functions.invoke). Todas as
// ações exigem staff logado (requireStaff). Usa service role (bypassa RLS) —
// por isso o front NUNCA fala direto com as tabelas de disparo em operações
// sensíveis, só com esta function.
//
// Ações (POST JSON {action, ...}):
//   sync_templates   {wa_account_id}         — puxa templates da Graph API
//   dry_run          {campaign_id}           — simula a fila SEM enviar
//   launch_campaign  {campaign_id, confirm_name}
//   pause_campaign   {campaign_id}
//   resume_campaign  {campaign_id}
//   panic            {}                       — pausa TUDO
//   resume_account   {wa_account_id}
//
// Env: WA_CLOUD_TOKEN (opcional; sync_templates degrada com msg clara se ausente).
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/portal.ts";

const TZ = "America/Sao_Paulo";

// Limite deslizante de 24h da Meta por tier (espelha o worker).
const MESSAGING_LIMITS: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  UNLIMITED: Number.POSITIVE_INFINITY,
};

// Hora de parede (0-23) do instante em SP (mesma técnica do worker).
function spHour(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return Number(map.hour) % 24;
}

function renderText(corpo: string, vars: Record<string, string>): string {
  return corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (full, key) => vars[key] ?? full);
}

// Detecta se o texto/botões do template pedem opt-out.
const OPTOUT_RE = /sair|parar|descadastr|opt.?out|remover/i;

// deno-lint-ignore no-explicit-any
async function audit(
  db: any,
  actorId: string,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  payload: unknown,
) {
  await db.from("dispatch_audit_log").insert({
    actor_id: actorId,
    acao,
    entidade,
    entidade_id: entidadeId,
    payload: payload ?? {},
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  const db = admin();

  const user = await requireStaff(db, req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corpo JSON inválido" }, 400);
  }
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "sync_templates":
        return await syncTemplates(db, String(body.wa_account_id ?? ""));
      case "dry_run":
        return await dryRun(db, user.id, String(body.campaign_id ?? ""));
      case "launch_campaign":
        return await launchCampaign(
          db,
          user.id,
          String(body.campaign_id ?? ""),
          String(body.confirm_name ?? ""),
        );
      case "pause_campaign":
        return await setCampaignRunning(db, user.id, String(body.campaign_id ?? ""), false);
      case "resume_campaign":
        return await setCampaignRunning(db, user.id, String(body.campaign_id ?? ""), true);
      case "panic":
        return await panic(db, user.id);
      case "resume_account":
        return await resumeAccount(db, user.id, String(body.wa_account_id ?? ""));
      default:
        return json({ error: `ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e).slice(0, 500) }, 500);
  }
});

// ---------------------------------------------------------------------------
// sync_templates
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function syncTemplates(db: any, waAccountId: string) {
  if (!waAccountId) return json({ error: "wa_account_id obrigatório" }, 400);
  const { data: conta } = await db
    .from("wa_accounts")
    .select("*")
    .eq("id", waAccountId)
    .maybeSingle();
  if (!conta) return json({ error: "conta não encontrada" }, 404);
  if (conta.provider === "evolution") {
    return json({ error: "templates só se aplicam à Cloud API" }, 400);
  }
  const token = Deno.env.get("WA_CLOUD_TOKEN");
  if (!token) {
    return json({ error: "WA_CLOUD_TOKEN não configurado — conecte a conta Meta primeiro" }, 400);
  }
  if (!conta.waba_id) {
    return json({ error: "conta sem waba_id — configure o WABA antes de sincronizar" }, 400);
  }

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${conta.waba_id}/message_templates?limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    return json({ error: `Graph API: ${msg}` }, 400);
  }

  // deno-lint-ignore no-explicit-any
  const templates: any[] = data?.data ?? [];
  const rows = templates.map((t) => {
    // deno-lint-ignore no-explicit-any
    const comps: any[] = t.components ?? [];
    const bodyComp = comps.find((c) => String(c.type).toUpperCase() === "BODY");
    const corpo = bodyComp?.text ?? "";
    // deno-lint-ignore no-explicit-any
    const buttons: any[] =
      comps.find((c) => String(c.type).toUpperCase() === "BUTTONS")?.buttons ?? [];
    const hasOptoutButton = buttons.some(
      (b) => String(b.type).toUpperCase() === "QUICK_REPLY" && OPTOUT_RE.test(String(b.text ?? "")),
    );
    return {
      wa_account_id: waAccountId,
      nome: t.name,
      categoria: String(t.category ?? "MARKETING").toUpperCase(),
      idioma: t.language ?? "pt_BR",
      status_meta: String(t.status ?? "PENDING").toUpperCase(),
      corpo,
      tem_botao_optout: hasOptoutButton || OPTOUT_RE.test(corpo),
    };
  });

  if (rows.length) {
    const { error } = await db
      .from("wa_templates")
      .upsert(rows, { onConflict: "wa_account_id,nome,idioma" });
    if (error) return json({ error: error.message }, 500);
  }
  await audit(db, "sync", "wa_templates", waAccountId, { total: rows.length });
  return json({ ok: true, sincronizados: rows.length });
}

// ---------------------------------------------------------------------------
// dry_run — avalia as linhas já em dispatch_queue SEM enviar nem mudar status.
// Espelha a ordem de checks do worker: suppression → sem_opt_in → cooldown
// (supressões); janela/cap não suprimem (reagendam), então são informativos.
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function dryRun(db: any, actorId: string, campaignId: string) {
  if (!campaignId) return json({ error: "campaign_id obrigatório" }, 400);
  const { data: camp } = await db
    .from("campaigns")
    .select("*, wa_accounts(*), wa_templates(*)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) return json({ error: "campanha não encontrada" }, 404);

  const { data: queue } = await db
    .from("dispatch_queue")
    .select("id, contact_id, variables")
    .eq("campaign_id", campaignId);
  // deno-lint-ignore no-explicit-any
  const items: any[] = queue ?? [];
  const total = items.length;

  const contactIds = [...new Set(items.map((i) => i.contact_id))];
  // deno-lint-ignore no-explicit-any
  let contacts: any[] = [];
  if (contactIds.length) {
    const { data } = await db.from("dispatch_contacts").select("*").in("id", contactIds);
    contacts = data ?? [];
  }
  // deno-lint-ignore no-explicit-any
  const contactById = new Map<string, any>(contacts.map((c) => [c.id, c]));

  const phones = [...new Set(contacts.map((c) => c.telefone))];
  const suppressed = new Set<string>();
  if (phones.length) {
    const { data } = await db.from("suppression_list").select("telefone").in("telefone", phones);
    for (const s of data ?? []) suppressed.add(s.telefone);
  }

  const suprimidos = { suppression: 0, sem_opt_in: 0, cooldown: 0 };
  const cooldownMs = (camp.cooldown_dias ?? 0) * 86_400_000;
  const now = Date.now();
  const horaSp = spHour(new Date());
  const dentroJanela = horaSp >= camp.janela_hora_inicio && horaSp < camp.janela_hora_fim;

  // deno-lint-ignore no-explicit-any
  const elegiveisItens: { contato: any; variables: Record<string, string> }[] = [];

  for (const item of items) {
    const contato = contactById.get(item.contact_id);
    if (!contato) {
      suprimidos.suppression += 0; // contato inexistente não conta como elegível
      continue;
    }
    if (suppressed.has(contato.telefone)) {
      suprimidos.suppression++;
      continue;
    }
    if (!contato.opt_in) {
      suprimidos.sem_opt_in++;
      continue;
    }
    if (
      contato.ultimo_disparo_em &&
      now - new Date(contato.ultimo_disparo_em).getTime() < cooldownMs
    ) {
      suprimidos.cooldown++;
      continue;
    }
    elegiveisItens.push({ contato, variables: (item.variables ?? {}) as Record<string, string> });
  }

  const elegiveis = elegiveisItens.length;
  const foraJanelaAgora = dentroJanela ? 0 : elegiveis;
  const capDiario = camp.cap_diario || 1;
  const previsaoDias = elegiveis ? Math.ceil(elegiveis / capDiario) : 0;

  const corpoBase = camp.wa_templates?.corpo ?? camp.corpo_livre ?? "";
  const amostra = elegiveisItens.slice(0, 5).map(({ contato, variables }) => {
    const vars: Record<string, string> = {
      nome: contato.nome ?? "",
      empresa: contato.empresa ?? "",
      ...variables,
    };
    return {
      telefone: contato.telefone,
      nome: contato.nome ?? null,
      empresa: contato.empresa ?? null,
      mensagem: renderText(corpoBase, vars),
    };
  });

  const resultado = {
    total,
    elegiveis,
    suprimidos,
    fora_janela_agora: foraJanelaAgora,
    previsao_dias: previsaoDias,
    amostra,
  };

  await audit(db, actorId, "dry_run", "campaign", campaignId, {
    total,
    elegiveis,
    suprimidos,
    fora_janela_agora: foraJanelaAgora,
    previsao_dias: previsaoDias,
  });

  return json(resultado);
}

// ---------------------------------------------------------------------------
// launch_campaign
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function launchCampaign(db: any, actorId: string, campaignId: string, confirmName: string) {
  if (!campaignId) return json({ error: "campaign_id obrigatório" }, 400);
  const { data: camp } = await db
    .from("campaigns")
    .select("*, wa_accounts(*), wa_templates(*)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) return json({ error: "campanha não encontrada" }, 404);

  if (confirmName !== camp.nome) {
    return json({ error: "nome de confirmação não confere" }, 400);
  }

  // Exige um dry_run prévio registrado na auditoria.
  const { count: dryCount } = await db
    .from("dispatch_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("acao", "dry_run")
    .eq("entidade", "campaign")
    .eq("entidade_id", campaignId);
  if (!dryCount) {
    return json({ error: "execute o dry-run primeiro" }, 400);
  }

  const conta = camp.wa_accounts;
  if (!conta || conta.status !== "ativa") {
    return json({ error: "conta de envio não está ativa" }, 400);
  }

  if (conta.provider === "cloud") {
    const tpl = camp.wa_templates;
    if (!tpl || tpl.status_meta !== "APPROVED") {
      return json({ error: "template não está APROVADO na Meta" }, 400);
    }
    if (tpl.categoria === "MARKETING" && !tpl.tem_botao_optout) {
      return json({ error: "template MARKETING precisa de instrução de opt-out" }, 400);
    }
  } else {
    // evolution
    if (!camp.corpo_livre || !String(camp.corpo_livre).trim()) {
      return json({ error: "campanha Evolution exige corpo livre" }, 400);
    }
  }

  if (camp.status !== "rascunho") {
    return json({ error: `campanha não está em rascunho (status ${camp.status})` }, 400);
  }

  const { error } = await db
    .from("campaigns")
    .update({
      status: "rodando",
      disparado_por: actorId,
      disparado_em: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("status", "rascunho");
  if (error) return json({ error: error.message }, 500);

  await audit(db, actorId, "launch", "campaign", campaignId, { nome: camp.nome });
  return json({ ok: true, status: "rodando" });
}

// ---------------------------------------------------------------------------
// pause_campaign / resume_campaign
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function setCampaignRunning(db: any, actorId: string, campaignId: string, resume: boolean) {
  if (!campaignId) return json({ error: "campaign_id obrigatório" }, 400);
  const { data: camp } = await db
    .from("campaigns")
    .select("*, wa_accounts(*)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) return json({ error: "campanha não encontrada" }, 404);

  if (resume) {
    if (camp.status !== "pausada") {
      return json({ error: `campanha não está pausada (status ${camp.status})` }, 400);
    }
    if (!camp.wa_accounts || camp.wa_accounts.status !== "ativa") {
      return json({ error: "reative a conta de envio antes de retomar a campanha" }, 400);
    }
    await db.from("campaigns").update({ status: "rodando" }).eq("id", campaignId);
    await audit(db, actorId, "resume_campaign", "campaign", campaignId, {});
    return json({ ok: true, status: "rodando" });
  }

  if (camp.status !== "rodando") {
    return json({ error: `campanha não está rodando (status ${camp.status})` }, 400);
  }
  await db.from("campaigns").update({ status: "pausada" }).eq("id", campaignId);
  await audit(db, actorId, "pause_campaign", "campaign", campaignId, {});
  return json({ ok: true, status: "pausada" });
}

// ---------------------------------------------------------------------------
// panic — pausa TODAS campanhas rodando/agendada e TODAS as contas ativas.
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function panic(db: any, actorId: string) {
  const { data: camps } = await db
    .from("campaigns")
    .update({ status: "pausada" })
    .in("status", ["rodando", "agendada"])
    .select("id");
  const { data: accs } = await db
    .from("wa_accounts")
    .update({
      status: "pausada",
      pausado_em: new Date().toISOString(),
      pausado_motivo: "pânico manual",
    })
    .eq("status", "ativa")
    .select("id");

  const campanhas_pausadas = (camps ?? []).length;
  const contas_pausadas = (accs ?? []).length;
  await audit(db, actorId, "panic", "global", null, { campanhas_pausadas, contas_pausadas });
  return json({ ok: true, campanhas_pausadas, contas_pausadas });
}

// ---------------------------------------------------------------------------
// resume_account
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function resumeAccount(db: any, actorId: string, waAccountId: string) {
  if (!waAccountId) return json({ error: "wa_account_id obrigatório" }, 400);
  const { data: conta } = await db
    .from("wa_accounts")
    .select("id, status")
    .eq("id", waAccountId)
    .maybeSingle();
  if (!conta) return json({ error: "conta não encontrada" }, 404);
  await db
    .from("wa_accounts")
    .update({ status: "ativa", pausado_em: null, pausado_motivo: null })
    .eq("id", waAccountId);
  await audit(db, actorId, "resume_account", "wa_account", waAccountId, {});
  return json({ ok: true, status: "ativa" });
}
