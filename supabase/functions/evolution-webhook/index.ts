import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import * as evo from "../_shared/evolution.ts";
import { chat, describeImage, transcribe, type ChatMessage } from "../_shared/openai.ts";
import { chatCostUsd, transcriptionCostUsd } from "../_shared/pricing.ts";
import { HUMANIZE_RULES, splitBubbles, typingDelay } from "../_shared/humanize.ts";
import {
  base64ToBytes,
  bytesToDataUrl,
  extFromMime,
  extractPdfText,
  uploadMedia,
} from "../_shared/media.ts";
import {
  buildAgendaPrompt,
  createAppointment,
  freeSlots,
  MEDICAL_PROMPT,
  resolveService,
  utcToZonedParts,
  zonedToUtc,
  type AgendaHours,
  type AgentService,
} from "../_shared/agenda.ts";

const DEBOUNCE_MS = 15000; // fallback quando o agente não tem response_delay_seconds
const HISTORY = 20;
// Chance de cada mensagem da IA sair como "resposta/citar" à mensagem do cliente.
const REPLY_QUOTE_PROBABILITY = 0.2;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// deno-lint-ignore no-explicit-any
type DB = any;

const MARK_TOOL = {
  type: "function",
  function: {
    name: "marcar_conversao",
    description:
      "Marque a conversa como convertida quando o objetivo do atendimento for atingido (ex.: agendou, fechou compra, pediu orçamento — conforme o objetivo do agente).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const TOPIC_VALUES = ["Agendamento", "Preço/Orçamento", "Dúvida", "Suporte", "Reclamação", "Outro"];

const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classificar_assunto",
    description:
      "Classifique o ASSUNTO PRINCIPAL desta conversa em uma categoria. Chame sempre a cada resposta, atualizando se o assunto mudar.",
    parameters: {
      type: "object",
      properties: {
        assunto: { type: "string", enum: TOPIC_VALUES },
      },
      required: ["assunto"],
    },
  },
};

// Tools de agenda — só incluídas quando o agente tem agenda_enabled.
const AGENDA_VERIFICAR_TOOL = {
  type: "function",
  function: {
    name: "verificar_disponibilidade",
    description:
      "Retorna os horários livres para uma data e tipo de atendimento. Use SEMPRE antes de oferecer horários; ofereça apenas os horários retornados.",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato AAAA-MM-DD" },
        servico: { type: "string", description: "Tipo de atendimento (ex.: Consulta)" },
      },
      required: ["data"],
    },
  },
};

const AGENDA_MARCAR_TOOL = {
  type: "function",
  function: {
    name: "agendar",
    description:
      "Cria o agendamento após confirmar data, hora, tipo e nome com o paciente. Só chame depois de verificar_disponibilidade e da confirmação do paciente.",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato AAAA-MM-DD" },
        hora: { type: "string", description: "Hora no formato HH:MM (24h)" },
        servico: { type: "string", description: "Tipo de atendimento" },
        nome_paciente: { type: "string", description: "Nome do paciente" },
      },
      required: ["data", "hora"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const provided = req.headers.get("x-webhook-token") ?? "";
  const expected = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: { event?: string; instance?: string; data?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const db = admin();
  const event = (payload.event ?? "").toLowerCase();
  const instance = payload.instance ?? "";
  const data = payload.data ?? {};

  try {
    if (event === "connection.update") {
      await handleConnection(db, instance, data);
      return json({ ok: true });
    }
    if (event === "messages.upsert") {
      await handleMessage(db, instance, data);
      return json({ ok: true });
    }
    // qrcode.updated e outros: ignorados (QR é buscado sob demanda pelo painel).
    return json({ ok: true, ignored: event });
  } catch (e) {
    console.error("webhook error:", e);
    return json({ error: String(e) }, 200); // 200 p/ Evolution não re-enfileirar
  }
});

async function handleConnection(db: DB, instance: string, data: Record<string, unknown>) {
  const state = String(data.state ?? "");
  const status =
    state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
  const patch: Record<string, unknown> = { status };
  if (state === "open") {
    try {
      const info = (await evo.fetchInstances(instance)) as Array<{
        ownerJid?: string;
        owner?: string;
      }>;
      const jid = info?.[0]?.ownerJid ?? info?.[0]?.owner;
      if (jid) patch.phone_number = String(jid).split("@")[0];
    } catch {
      /* best-effort */
    }
  }
  await db.from("whatsapp_agents").update(patch).eq("instance_name", instance);
}

interface Extracted {
  type: string;
  content: string;
  mediaBytes: Uint8Array | null;
  mime: string | null;
}

async function extractMessage(
  db: DB,
  instance: string,
  agentId: string,
  conversationId: string,
  data: Record<string, unknown>,
): Promise<Extracted> {
  // deno-lint-ignore no-explicit-any
  const msg: any = data.message ?? {};
  const key = data.key;

  if (typeof msg.conversation === "string")
    return { type: "text", content: msg.conversation, mediaBytes: null, mime: null };
  if (msg.extendedTextMessage?.text)
    return {
      type: "text",
      content: msg.extendedTextMessage.text,
      mediaBytes: null,
      mime: null,
    };

  // Descobre a mídia base64 (webhook.base64:true entrega em msg.base64) ou fallback.
  async function mediaBytes(): Promise<Uint8Array | null> {
    if (typeof msg.base64 === "string") return base64ToBytes(msg.base64);
    try {
      const r = (await evo.getBase64FromMedia(instance, key, msg)) as {
        base64?: string;
      };
      return r.base64 ? base64ToBytes(r.base64) : null;
    } catch {
      return null;
    }
  }

  if (msg.imageMessage) {
    const mime = msg.imageMessage.mimetype ?? "image/jpeg";
    const caption = msg.imageMessage.caption ?? "";
    const bytes = await mediaBytes();
    let desc = "";
    if (bytes) {
      try {
        const v = await describeImage(bytesToDataUrl(bytes, mime));
        desc = v.text;
        await logUsage(
          db,
          agentId,
          conversationId,
          "vision",
          "gpt-4o-mini",
          v.promptTokens,
          v.completionTokens,
          chatCostUsd("gpt-4o-mini", v.promptTokens, v.completionTokens),
        );
      } catch (e) {
        console.error("vision error", e);
      }
    }
    const content = [caption, desc ? `[imagem: ${desc}]` : "[imagem]"].filter(Boolean).join("\n");
    return { type: "image", content, mediaBytes: bytes, mime };
  }

  if (msg.audioMessage) {
    const mime = msg.audioMessage.mimetype ?? "audio/ogg";
    const bytes = await mediaBytes();
    let text = "";
    if (bytes) {
      try {
        const t = await transcribe(bytes, mime);
        text = t.text;
        await logUsage(
          db,
          agentId,
          conversationId,
          "transcription",
          "whisper-1",
          0,
          0,
          transcriptionCostUsd(t.seconds),
        );
      } catch (e) {
        console.error("whisper error", e);
      }
    }
    return { type: "audio", content: text || "[áudio]", mediaBytes: bytes, mime };
  }

  if (msg.videoMessage) {
    const mime = msg.videoMessage.mimetype ?? "video/mp4";
    const caption = msg.videoMessage.caption ?? "";
    const bytes = await mediaBytes();
    return {
      type: "video",
      content: caption || "[vídeo]",
      mediaBytes: bytes,
      mime,
    };
  }

  if (msg.documentMessage) {
    const mime = msg.documentMessage.mimetype ?? "application/octet-stream";
    const fileName = msg.documentMessage.fileName ?? "documento";
    const bytes = await mediaBytes();
    let extra = "";
    if (bytes && mime.includes("pdf")) {
      const text = await extractPdfText(bytes);
      if (text) extra = `\n[conteúdo do PDF: ${text}]`;
    }
    return {
      type: "document",
      content: `[documento: ${fileName}]${extra}`,
      mediaBytes: bytes,
      mime,
    };
  }

  if (msg.stickerMessage)
    return { type: "sticker", content: "[figurinha]", mediaBytes: null, mime: null };

  return { type: "other", content: "[mensagem não suportada]", mediaBytes: null, mime: null };
}

async function handleMessage(db: DB, instance: string, data: Record<string, unknown>) {
  // deno-lint-ignore no-explicit-any
  const key: any = data.key ?? {};
  const remoteJid = String(key.remoteJid ?? "");
  const fromMe = Boolean(key.fromMe);
  const evolutionId = key.id ? String(key.id) : null;

  // Filtra grupos, status, newsletter — só conversas 1:1.
  if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) return;

  const { data: agent } = await db
    .from("whatsapp_agents")
    .select("*")
    .eq("instance_name", instance)
    .maybeSingle();
  if (!agent) return;

  const conv = await getOrCreateConversation(db, instance, agent.id, remoteJid, data);

  const extracted = await extractMessage(db, instance, agent.id, conv.id, data);

  // Salva mídia no storage (quando houver).
  let mediaPath: string | null = null;
  if (extracted.mediaBytes && extracted.mime) {
    mediaPath = `${agent.id}/${conv.id}/${Date.now()}-${evolutionId ?? "m"}.${extFromMime(extracted.mime)}`;
    try {
      await uploadMedia(db, mediaPath, extracted.mediaBytes, extracted.mime);
    } catch (e) {
      console.error("upload error", e);
      mediaPath = null;
    }
  }

  const tsSec = Number(data.messageTimestamp ?? 0);
  const sentAt = tsSec > 0 ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();

  // Insere a mensagem (dedupe por unique (conversation_id, evolution_id)).
  const { data: inserted, error: insErr } = await db
    .from("whatsapp_messages")
    .insert({
      conversation_id: conv.id,
      direction: fromMe ? "out" : "in",
      sender: fromMe ? "human" : "contact",
      message_type: extracted.type,
      content: extracted.content,
      media_path: mediaPath,
      media_mime: extracted.mime,
      evolution_id: evolutionId,
      sent_at: sentAt,
    })
    .select("id")
    .single();

  if (insErr) {
    // 23505 = duplicata (eco da própria API) → ignora silenciosamente.
    if (insErr.code === "23505") return;
    throw insErr;
  }

  const preview = extracted.content.slice(0, 120);

  if (fromMe) {
    // Dono respondeu pelo próprio celular — não roda IA.
    await db
      .from("whatsapp_conversations")
      .update({ last_message_at: sentAt, last_message_preview: preview })
      .eq("id", conv.id);
    return;
  }

  // Mantém o nome do contato atualizado com o pushName do WhatsApp.
  const pushName = String((data as { pushName?: string }).pushName ?? "").trim();
  const convUpdate: Record<string, unknown> = {
    last_message_at: sentAt,
    last_message_preview: preview,
    last_inbound_message_id: inserted.id,
    unread_count: (conv.unread_count ?? 0) + 1,
  };
  if (pushName) convUpdate.contact_name = pushName;
  await db.from("whatsapp_conversations").update(convUpdate).eq("id", conv.id);

  if (agent.ai_enabled && !conv.ai_paused) {
    // Responde 200 já; pipeline roda em background com debounce.
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(
      runPipeline(db, agent, conv.id, remoteJid, inserted.id),
    );
  }
}

async function getOrCreateConversation(
  db: DB,
  instance: string,
  agentId: string,
  remoteJid: string,
  data: Record<string, unknown>,
) {
  const { data: existing } = await db
    .from("whatsapp_conversations")
    .select("id, ai_paused, unread_count")
    .eq("agent_id", agentId)
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (existing) return existing;

  let profilePic: string | null = null;
  try {
    const p = (await evo.fetchProfilePicture(instance, remoteJid)) as {
      profilePictureUrl?: string;
    };
    profilePic = p.profilePictureUrl ?? null;
  } catch {
    /* ignore */
  }

  const pushName = String((data as { pushName?: string }).pushName ?? "");
  const { data: created, error } = await db
    .from("whatsapp_conversations")
    .insert({
      agent_id: agentId,
      remote_jid: remoteJid,
      contact_name: pushName || null,
      profile_pic_url: profilePic,
    })
    .select("id, ai_paused, unread_count")
    .single();
  if (error) {
    // Corrida: outra invocação criou — re-seleciona.
    const { data: again } = await db
      .from("whatsapp_conversations")
      .select("id, ai_paused, unread_count")
      .eq("agent_id", agentId)
      .eq("remote_jid", remoteJid)
      .single();
    return again;
  }
  return created;
}

function buildSystemPrompt(
  agent: Record<string, unknown>,
  contact: { name: string | null; phone: string | null },
): string {
  const contactBlock =
    `Dados do contato (vindos do WhatsApp): nome = ${
      contact.name && contact.name.trim() ? contact.name.trim() : "desconhecido"
    }; telefone = ${contact.phone ?? "desconhecido"}.` +
    ` Só use o nome se for um nome real de pessoa; se estiver "desconhecido", não invente nem use placeholder.`;

  const agendaBlock =
    agent.agenda_enabled === true
      ? buildAgendaPrompt(
          (agent.agenda_services as AgentService[]) ?? [],
          agent.agenda_hours as AgendaHours,
          String(agent.agenda_timezone ?? "America/Sao_Paulo"),
        )
      : "";

  const parts = [
    agent.system_prompt ? String(agent.system_prompt) : "",
    agent.niche ? `Nicho do cliente: ${agent.niche}` : "",
    agent.is_medical === true ? MEDICAL_PROMPT : "",
    agent.business_info ? `Informações do negócio: ${agent.business_info}` : "",
    buildClientDataBlock(agent),
    agendaBlock,
    agent.conversion_goal ? `Objetivo do atendimento (conversão): ${agent.conversion_goal}` : "",
    agent.greeting ? `Saudação de referência: ${agent.greeting}` : "",
    contactBlock,
    HUMANIZE_RULES,
  ];
  return parts.filter(Boolean).join("\n\n");
}

// Monta o bloco de dados estruturados do cliente (campos fixos + extra_fields).
// Só entram os campos preenchidos; se nada estiver preenchido, retorna "".
function buildClientDataBlock(agent: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    const val = s(v);
    if (val) lines.push(`- ${label}: ${val}`);
  };
  push("Responsável pelo atendimento", agent.responsible_name);
  push("Telefone do responsável", agent.responsible_phone);
  push("Profissão/Especialidade", agent.profession);
  push("Registro (CRM/OAB/…)", agent.registration_number);
  push("Endereço", agent.business_address);

  const extra = agent.extra_fields;
  if (Array.isArray(extra)) {
    for (const f of extra) {
      if (f && typeof f === "object") {
        const label = s((f as Record<string, unknown>).label);
        const value = s((f as Record<string, unknown>).value);
        if (label && value) lines.push(`- ${label}: ${value}`);
        else if (value) lines.push(`- ${value}`);
      }
    }
  }

  if (!lines.length) return "";
  return (
    "Dados do responsável e do negócio (use quando fizer sentido, ex.: informar quem entrará em contato). " +
    "Use só o que estiver aqui — nunca invente valores, nomes ou endereços:\n" +
    lines.join("\n")
  );
}

// Tool verificar_disponibilidade: devolve horários livres reais para o modelo.
async function handleVerificar(db: DB, agent: Record<string, unknown>, argsJson: string) {
  let args: { data?: string; servico?: string } = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    /* ignora */
  }
  const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
  const services = (agent.agenda_services as AgentService[]) ?? [];
  const hours = agent.agenda_hours as AgendaHours;
  const service = resolveService(services, args.servico);
  if (!args.data) return { erro: "Informe a data no formato AAAA-MM-DD." };
  const slots = await freeSlots(db, {
    clientId: String(agent.client_id),
    dateISO: args.data,
    durationMin: service.durationMin,
    hours,
    tz,
  });
  return {
    data: args.data,
    servico: service.label,
    duracao_min: service.durationMin,
    horarios_livres: slots,
    ...(slots.length ? {} : { aviso: "Sem horários livres nesse dia; sugira outra data." }),
  };
}

// Tool agendar: cria o appointment após rechecar disponibilidade.
async function handleAgendar(
  db: DB,
  agent: Record<string, unknown>,
  conversationId: string,
  remoteJid: string,
  argsJson: string,
) {
  let args: { data?: string; hora?: string; servico?: string; nome_paciente?: string } = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    /* ignora */
  }
  if (!args.data || !args.hora)
    return { ok: false, erro: "Informe data (AAAA-MM-DD) e hora (HH:MM)." };
  const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
  const services = (agent.agenda_services as AgentService[]) ?? [];
  const hours = agent.agenda_hours as AgendaHours;
  const service = resolveService(services, args.servico);
  const startsAt = zonedToUtc(args.data, args.hora, tz);

  const res = await createAppointment(db, {
    clientId: String(agent.client_id),
    agentId: String(agent.id),
    conversationId,
    startsAt,
    durationMin: service.durationMin,
    serviceLabel: service.label,
    patientName: args.nome_paciente ?? null,
    patientPhone: remoteJid.split("@")[0] || null,
    source: "ai",
  });

  if (!res.ok) {
    if (res.reason === "conflict") {
      const slots = await freeSlots(db, {
        clientId: String(agent.client_id),
        dateISO: args.data,
        durationMin: service.durationMin,
        hours,
        tz,
      });
      return { ok: false, motivo: "Horário indisponível.", horarios_livres: slots };
    }
    return { ok: false, motivo: "Não foi possível agendar agora." };
  }
  const local = utcToZonedParts(startsAt, tz);
  return {
    ok: true,
    confirmado: { data: local.dateISO, hora: local.time, servico: service.label },
  };
}

async function runPipeline(
  db: DB,
  agent: Record<string, unknown>,
  conversationId: string,
  remoteJid: string,
  triggerMessageId: string,
) {
  // Buffer configurável por agente (padrão 15s) — tempo de silêncio antes de responder.
  const delaySec = Number(agent.response_delay_seconds);
  const delayMs = Number.isFinite(delaySec) && delaySec >= 3 ? delaySec * 1000 : DEBOUNCE_MS;
  await new Promise((r) => setTimeout(r, delayMs));

  // Claim atômico: só a invocação dona da última mensagem inbound responde.
  const { data: claimed } = await db.rpc("claim_ai_run", {
    p_conversation_id: conversationId,
    p_message_id: triggerMessageId,
  });
  if (!claimed) return;

  try {
    // Dados do contato (do WhatsApp) para personalizar sem inventar nome.
    const { data: conv } = await db
      .from("whatsapp_conversations")
      .select("contact_name")
      .eq("id", conversationId)
      .maybeSingle();
    const contact = {
      name: conv?.contact_name ?? null,
      phone: remoteJid.split("@")[0] || null,
    };

    const { data: history } = await db
      .from("whatsapp_messages")
      .select("sender, content")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(HISTORY);
    const ordered = (history ?? []).reverse();

    const model = String(agent.model ?? "gpt-4o-mini");
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(agent, contact) },
      ...ordered.map((m: { sender: string; content: string | null }) => ({
        role: (m.sender === "contact" ? "user" : "assistant") as "user" | "assistant",
        content: m.content ?? "",
      })),
    ];

    const agendaOn = agent.agenda_enabled === true;
    const tools = agendaOn
      ? [MARK_TOOL, CLASSIFY_TOOL, AGENDA_VERIFICAR_TOOL, AGENDA_MARCAR_TOOL]
      : [MARK_TOOL, CLASSIFY_TOOL];

    let finalText: string | null = null;
    // 4 iterações: permite verificar_disponibilidade -> agendar no mesmo turno.
    for (let i = 0; i < 4; i++) {
      const r = await chat({
        model,
        messages,
        temperature: Number(agent.temperature ?? 0.7),
        tools,
      });
      await logUsage(
        db,
        String(agent.id),
        conversationId,
        "chat",
        model,
        r.promptTokens,
        r.completionTokens,
        chatCostUsd(model, r.promptTokens, r.completionTokens),
      );

      if (r.toolCalls.length) {
        messages.push(r.assistant as ChatMessage);
        for (const tc of r.toolCalls) {
          let result: unknown = { ok: true };
          if (tc.name === "marcar_conversao") {
            await db
              .from("whatsapp_conversations")
              .update({ converted: true, converted_at: new Date().toISOString() })
              .eq("id", conversationId);
          } else if (tc.name === "classificar_assunto") {
            try {
              const assunto = JSON.parse(tc.arguments || "{}").assunto;
              if (assunto)
                await db
                  .from("whatsapp_conversations")
                  .update({ topic: String(assunto) })
                  .eq("id", conversationId);
            } catch {
              /* ignora argumentos inválidos */
            }
          } else if (tc.name === "verificar_disponibilidade" && agendaOn) {
            result = await handleVerificar(db, agent, tc.arguments);
          } else if (tc.name === "agendar" && agendaOn) {
            result = await handleAgendar(db, agent, conversationId, remoteJid, tc.arguments);
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }
      finalText = r.content;
      break;
    }

    if (!finalText) return;

    // Re-checa: chegou mensagem nova durante a geração? Descarta.
    const { data: fresh } = await db
      .from("whatsapp_conversations")
      .select("last_inbound_message_id")
      .eq("id", conversationId)
      .single();
    if (fresh?.last_inbound_message_id !== triggerMessageId) return;

    // Mensagem que está sendo respondida (para o recurso "responder/citar").
    const { data: inbound } = await db
      .from("whatsapp_messages")
      .select("evolution_id, content")
      .eq("id", triggerMessageId)
      .maybeSingle();
    const inboundEvoId: string | null = inbound?.evolution_id ?? null;
    const quoted = inboundEvoId
      ? {
          key: { id: inboundEvoId, remoteJid, fromMe: false },
          message: { conversation: inbound?.content ?? "" },
        }
      : null;

    const bubbles = splitBubbles(finalText);
    for (const bubble of bubbles) {
      // Abort-no-meio: se o cliente mandou algo novo enquanto a IA envia as
      // bolhas, para tudo — a invocação da mensagem nova responde com contexto
      // completo (evita terminar uma resposta já desatualizada).
      const { data: still } = await db
        .from("whatsapp_conversations")
        .select("last_inbound_message_id")
        .eq("id", conversationId)
        .single();
      if (still?.last_inbound_message_id !== triggerMessageId) break;

      const withQuote = quoted && Math.random() < REPLY_QUOTE_PROBABILITY;
      const r = (await evo.sendText(
        String(agent.instance_name),
        remoteJid,
        bubble,
        typingDelay(bubble),
        withQuote ? quoted : undefined,
      )) as { key?: { id?: string } };
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
  } finally {
    await db
      .from("whatsapp_conversations")
      .update({ ai_claimed_at: null })
      .eq("id", conversationId);
  }
}

async function logUsage(
  db: DB,
  agentId: string,
  conversationId: string,
  kind: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  costUsd: number,
) {
  try {
    await db.from("whatsapp_usage").insert({
      agent_id: agentId,
      conversation_id: conversationId,
      kind,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd,
    });
  } catch (e) {
    console.error("usage log error", e);
  }
}
