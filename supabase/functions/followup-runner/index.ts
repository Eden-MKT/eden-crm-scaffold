// Runner de follow-ups e confirmações (cron a cada 1 min):
//   Fase A — follow-ups MANUAIS agendados (tabela follow_ups).
//   Fase B — cadência AUTOMÁTICA 12h/24h/48h após o fim da conversa, com bom
//            senso: a IA avalia a conversa e NÃO insiste quando o lead
//            demonstrou que não quer mais contato (marca followup_exhausted).
//   Fase C — CONFIRMAÇÃO de consulta na véspera (~9h no fuso do agente).
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireCron, requireStaff } from "../_shared/portal.ts";
import { chat } from "../_shared/openai.ts";
import { chatCostUsd } from "../_shared/pricing.ts";
import { splitBubbles, typingDelay } from "../_shared/humanize.ts";
import { utcToZonedParts } from "../_shared/agenda.ts";
import * as evo from "../_shared/evolution.ts";
import { followupConfig } from "../_shared/capabilities.ts";

const BATCH = 20;

// deno-lint-ignore no-explicit-any
type DB = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  if (!requireCron(req)) {
    const staff = await requireStaff(db, req);
    if (!staff) return json({ error: "Unauthorized" }, 401);
  }

  try {
    const manual = await runManual(db);
    const auto = await runAuto(db);
    const confirm = await runConfirmations(db);
    return json({ ok: true, manual, auto, confirm });
  } catch (e) {
    console.error("followup-runner error:", e);
    return json({ error: String(e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Fase A — manuais
// ---------------------------------------------------------------------------
async function runManual(db: DB) {
  const { data: due } = await db
    .from("follow_ups")
    .select("id, conversation_id, agent_id, message")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);

  let sent = 0;
  let failed = 0;
  for (const fu of due ?? []) {
    // Claim atômico por linha (crons sobrepostos não enviam duplicado).
    const { data: claimed } = await db
      .from("follow_ups")
      .update({ status: "sending" })
      .eq("id", fu.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const { data: conv } = await db
        .from("whatsapp_conversations")
        .select("id, remote_jid")
        .eq("id", fu.conversation_id)
        .single();
      const { data: agent } = await db
        .from("whatsapp_agents")
        .select("id, instance_name")
        .eq("id", fu.agent_id)
        .single();
      if (!conv || !agent?.instance_name) throw new Error("conversa ou instância indisponível");

      await sendBubbles(db, agent.instance_name, conv.remote_jid, fu.conversation_id, fu.message);
      await db
        .from("follow_ups")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", fu.id);
      sent++;
    } catch (e) {
      await db
        .from("follow_ups")
        .update({ status: "failed", error: String(e).slice(0, 500) })
        .eq("id", fu.id);
      failed++;
    }
  }
  return { due: (due ?? []).length, sent, failed };
}

// ---------------------------------------------------------------------------
// Fase B — cadência automática (12h/24h/48h) com bom senso
// ---------------------------------------------------------------------------
async function runAuto(db: DB) {
  const { data: agents } = await db
    .from("whatsapp_agents")
    .select("id, instance_name, followup_config, business_info, responsible_name, greeting")
    .eq("ai_enabled", true)
    .eq("status", "connected");

  const eligible = (agents ?? []).filter(
    (a: Record<string, unknown>) => followupConfig(a).enabled && a.instance_name,
  );
  if (!eligible.length) return { agents: 0, sent: 0, skipped: 0, exhausted: 0 };

  const now = Date.now();
  let sent = 0;
  let skipped = 0;
  let exhausted = 0;

  for (const agent of eligible) {
    const cfg = followupConfig(agent);

    const { data: convs } = await db
      .from("whatsapp_conversations")
      .select(
        "id, remote_jid, contact_name, lead_interest, context_summary, followup_stage, last_followup_at, last_message_at",
      )
      .eq("agent_id", agent.id)
      .eq("converted", false)
      .eq("human_takeover", false)
      .eq("followup_exhausted", false)
      .eq("ai_paused", false)
      .lte("followup_stage", 3)
      .not("last_message_at", "is", null)
      .limit(BATCH);

    for (const conv of convs ?? []) {
      const stage = Number(conv.followup_stage ?? 0);
      const refIso = conv.last_followup_at ?? conv.last_message_at;
      if (!refIso) continue;
      const elapsedMin = (now - new Date(refIso).getTime()) / 60000;

      if (stage >= 3) {
        // 3 FUPs enviados — passado o prazo final sem resposta, esgota.
        if (elapsedMin >= cfg.esgotarAposMinutos) {
          await db
            .from("whatsapp_conversations")
            .update({ followup_exhausted: true })
            .eq("id", conv.id);
          exhausted++;
        }
        continue;
      }

      const stageCfg = cfg.estagios[stage];
      if (!stageCfg || elapsedMin < stageCfg.aposMinutos) continue;

      // Quem já tem consulta futura marcada não recebe follow-up de venda —
      // o objetivo foi atingido (esses recebem a confirmação de véspera).
      const { data: futureAppt } = await db
        .from("appointments")
        .select("id")
        .eq("conversation_id", conv.id)
        .eq("status", "scheduled")
        .gte("starts_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
      if (futureAppt) continue;

      // Claim anti-duplo-envio: só quem conseguir avançar o estágio processa.
      const { data: claimed } = await db
        .from("whatsapp_conversations")
        .update({ followup_stage: stage + 1, last_followup_at: new Date().toISOString() })
        .eq("id", conv.id)
        .eq("followup_stage", stage)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      try {
        const decision = await decideAndGenerate(db, agent, conv, stage + 1, stageCfg.tom);
        if (!decision.enviar) {
          // Bom senso: lead não quer mais contato → não perturbe nunca mais.
          await db
            .from("whatsapp_conversations")
            .update({ followup_exhausted: true })
            .eq("id", conv.id);
          console.log("followup skip", conv.id, decision.motivo);
          skipped++;
          continue;
        }
        if (decision.mensagem) {
          await sendBubbles(
            db,
            String(agent.instance_name),
            conv.remote_jid,
            conv.id,
            decision.mensagem,
          );
          sent++;
        }
      } catch (e) {
        console.error("followup send error", conv.id, e);
      }
    }
  }
  return { agents: eligible.length, sent, skipped, exhausted };
}

// A mesma chamada decide SE deve insistir e, em caso positivo, gera a mensagem.
async function decideAndGenerate(
  db: DB,
  agent: Record<string, unknown>,
  conv: Record<string, unknown>,
  numero: number,
  tom: string,
): Promise<{ enviar: boolean; motivo: string; mensagem: string | null }> {
  // Últimas mensagens reais dão o sinal de interesse/desinteresse.
  const { data: history } = await db
    .from("whatsapp_messages")
    .select("sender, content")
    .eq("conversation_id", conv.id)
    .order("sent_at", { ascending: false })
    .limit(10);
  const transcript = (history ?? [])
    .reverse()
    .map(
      (m: { sender: string; content: string | null }) =>
        `${m.sender === "contact" ? "Lead" : "Atendente"}: ${m.content ?? ""}`,
    )
    .join("\n");

  const r = await chat({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Você decide se vale a pena enviar o follow-up nº ${numero} (de 3) para um lead que parou de responder, e escreve a mensagem se valer.
Responda APENAS com JSON: { "enviar": boolean, "motivo": "curto", "mensagem": "texto ou null" }.

REGRAS DE BOM SENSO:
- enviar=false se o lead demonstrou desinteresse claro, pediu para parar, disse que já resolveu em outro lugar, ou foi rude — insistir queima a marca.
- enviar=true quando a conversa morreu sem recusa (distração, "vou ver e te falo", dúvida sem resposta) — aí vale retomar.
- Mensagem: curta (1-2 frases, estilo WhatsApp), tom: ${tom}. Termine com pergunta aberta leve. Proibido: "Você sumiu", "Estou aguardando sua resposta", parecer cobrança, revelar que é IA, markdown. Pode quebrar em 2 bolhas com |||.`.trim(),
      },
      {
        role: "user",
        content:
          `Lead: ${conv.contact_name ?? "sem nome"}\n` +
          (conv.lead_interest ? `Interesse: ${conv.lead_interest}\n` : "") +
          (conv.context_summary ? `Resumo da conversa: ${conv.context_summary}\n` : "") +
          `\nÚltimas mensagens:\n${transcript}`,
      },
    ],
    temperature: 0.4,
    maxTokens: 220,
    responseFormat: { type: "json_object" },
  });

  try {
    await db.from("whatsapp_usage").insert({
      agent_id: agent.id,
      conversation_id: conv.id,
      kind: "followup",
      model: "gpt-4o-mini",
      prompt_tokens: r.promptTokens,
      completion_tokens: r.completionTokens,
      cost_usd: chatCostUsd("gpt-4o-mini", r.promptTokens, r.completionTokens),
    });
  } catch {
    /* best-effort */
  }

  try {
    const parsed = JSON.parse(r.content ?? "{}");
    return {
      enviar: parsed.enviar === true,
      motivo: String(parsed.motivo ?? ""),
      mensagem: parsed.mensagem ? String(parsed.mensagem) : null,
    };
  } catch {
    return { enviar: false, motivo: "resposta inválida do modelo", mensagem: null };
  }
}

// ---------------------------------------------------------------------------
// Fase C — confirmação de consulta na véspera (~9h locais)
// ---------------------------------------------------------------------------
async function runConfirmations(db: DB) {
  const nowIso = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  // Candidatos: consultas de amanhã ainda não confirmadas nem avisadas.
  const { data: appts } = await db
    .from("appointments")
    .select(
      "id, agent_id, conversation_id, patient_name, service_label, starts_at, confirmed, confirmation_sent_at",
    )
    .eq("status", "scheduled")
    .eq("confirmed", false)
    .is("confirmation_sent_at", null)
    .gte("starts_at", nowIso)
    .lte("starts_at", in48h)
    .not("conversation_id", "is", null)
    .limit(BATCH);

  let sent = 0;
  for (const ap of appts ?? []) {
    try {
      const { data: agent } = await db
        .from("whatsapp_agents")
        .select(
          "id, instance_name, status, ai_enabled, agenda_timezone, followup_config, responsible_name",
        )
        .eq("id", ap.agent_id)
        .single();
      if (!agent?.instance_name || agent.status !== "connected" || !agent.ai_enabled) continue;
      if (!followupConfig(agent).confirmEnabled) continue;

      const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
      const nowLocal = utcToZonedParts(new Date(), tz);
      const apptLocal = utcToZonedParts(new Date(ap.starts_at), tz);

      // Véspera: a consulta é AMANHÃ no fuso local e já passou das 9h de hoje.
      const tomorrow = utcToZonedParts(new Date(Date.now() + 24 * 60 * 60 * 1000), tz);
      if (apptLocal.dateISO !== tomorrow.dateISO) continue;
      if (Number(nowLocal.time.slice(0, 2)) < 9) continue;

      // Claim: marca antes de enviar (crons sobrepostos não duplicam).
      const { data: claimed } = await db
        .from("appointments")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", ap.id)
        .is("confirmation_sent_at", null)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      const { data: conv } = await db
        .from("whatsapp_conversations")
        .select("id, remote_jid, contact_name")
        .eq("id", ap.conversation_id)
        .single();
      if (!conv) continue;

      const nome = (ap.patient_name ?? conv.contact_name ?? "").trim();
      const r = await chat({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Escreva uma mensagem curta e calorosa de CONFIRMAÇÃO de consulta pelo WhatsApp (1-2 frases + pergunta de confirmação). Sem markdown, sem revelar que é IA. Responda só com a mensagem.",
          },
          {
            role: "user",
            content: `Paciente: ${nome || "(sem nome)"}\nConsulta: ${ap.service_label ?? "atendimento"} amanhã, ${apptLocal.dateISO.split("-").reverse().join("/")} às ${apptLocal.time}. Pergunte se está confirmado.`,
          },
        ],
        temperature: 0.5,
        maxTokens: 120,
      });
      const msg =
        r.content?.trim() ||
        `Oi${nome ? `, ${nome}` : ""}! Passando para confirmar seu horário de amanhã às ${apptLocal.time}. Está confirmado? 😊`;

      await sendBubbles(db, String(agent.instance_name), conv.remote_jid, conv.id, msg);
      try {
        await db.from("whatsapp_usage").insert({
          agent_id: agent.id,
          conversation_id: conv.id,
          kind: "confirmation",
          model: "gpt-4o-mini",
          prompt_tokens: r.promptTokens,
          completion_tokens: r.completionTokens,
          cost_usd: chatCostUsd("gpt-4o-mini", r.promptTokens, r.completionTokens),
        });
      } catch {
        /* best-effort */
      }
      sent++;
    } catch (e) {
      console.error("confirmation error", ap.id, e);
    }
  }
  return { candidates: (appts ?? []).length, sent };
}

async function sendBubbles(
  db: DB,
  instanceName: string,
  remoteJid: string,
  conversationId: string,
  text: string,
) {
  // "digitando…" antes da primeira bolha (follow-ups/confirmações também digitam).
  // Fire-and-forget: a Evolution segura a request pelo tempo do delay.
  evo.sendPresence(instanceName, remoteJid, 3000).catch(() => {
    /* presença é cosmética */
  });
  for (const bubble of splitBubbles(text)) {
    const r = (await evo.sendText(instanceName, remoteJid, bubble, typingDelay(bubble))) as {
      key?: { id?: string };
    };
    const now = new Date().toISOString();
    await db.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "out",
      sender: "ai",
      message_type: "text",
      content: bubble,
      evolution_id: r.key?.id ?? null,
      sent_at: now,
    });
    await db
      .from("whatsapp_conversations")
      .update({ last_message_at: now, last_message_preview: bubble.slice(0, 120) })
      .eq("id", conversationId);
  }
}
