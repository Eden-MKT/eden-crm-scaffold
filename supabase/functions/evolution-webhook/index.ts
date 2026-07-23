import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import * as evo from "../_shared/evolution.ts";
import { chat, describeImage, transcribe, type ChatMessage } from "../_shared/openai.ts";
import { chatCostUsd, transcriptionCostUsd } from "../_shared/pricing.ts";
import { NO_REPLY, splitBubbles, typingDelay } from "../_shared/humanize.ts";
import {
  base64ToBytes,
  bytesToDataUrl,
  extFromMime,
  extractPdfText,
  uploadMedia,
} from "../_shared/media.ts";
import {
  createAppointment,
  freeSlots,
  FUTURE_ACTIVE_STATUSES,
  resolveService,
  utcToZonedParts,
  weekdayLabelPtBr,
  zonedToUtc,
  type AgendaHours,
  type AgentService,
} from "../_shared/agenda.ts";
import { buildSystemPrompt, handleVerificar, toolsForAgent } from "../_shared/ai-core.ts";
import {
  buildHandoffNotification,
  buildPatientBlock,
  handoffPhones,
  type PatientRecord,
} from "../_shared/capabilities.ts";
import { registrarObjecao, registrarTentativaVideo } from "../_shared/objection.ts";
import { processDispatchInbound } from "../_shared/dispatch-optout.ts";
import { resolveLeadPhone } from "../_shared/phone.ts";
import { syncMonday } from "../_shared/monday.ts";

const DEBOUNCE_MS = 15000; // fallback quando o agente não tem response_delay_seconds
const HISTORY = 40;
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
    if (event === "messages.update") {
      // Ack de entrega/leitura chegou PELO socket da sessão = prova de vida
      // (sessão surda não recebe ack nenhum). Confirma o canário do
      // connection-health e zera o contador de falhas.
      await db
        .from("whatsapp_agents")
        .update({ last_canary_ok_at: new Date().toISOString(), canary_fails: 0 })
        .eq("instance_name", instance);
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
  // Motivo do fechamento (Baileys/lastDisconnect). 403 = forbidden: o número
  // foi recusado pelo WhatsApp — sinal forte de banimento/bloqueio.
  // deno-lint-ignore no-explicit-any
  const reason = Number(
    (data.statusReason as number) ?? (data as any)?.lastDisconnect?.error?.output?.statusCode ?? 0,
  );
  if (state === "open") {
    patch.connection_error = null; // conectou: limpa qualquer aviso anterior
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
  } else if (state === "close" && reason === 403) {
    // Conservador: só o 403 vira "banido"; logout normal é 401/440 e não deve
    // gerar falso alarme.
    patch.connection_error =
      "Número bloqueado/banido pelo WhatsApp — a conexão foi recusada (403).";
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
  const leadPhone = resolveLeadPhone(data, remoteJid);

  // Filtra grupos, status, newsletter — só conversas 1:1.
  if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) return;

  const { data: agent } = await db
    .from("whatsapp_agents")
    .select("*")
    .eq("instance_name", instance)
    .maybeSingle();
  if (!agent) return;

  // Self-chat (mensagem da instância para o próprio número) nunca é lead.
  // O canário do connection-health ecoa aqui, provando que a sessão RECEBE
  // eventos (connectionState "open" não garante isso — sessão surda).
  const ownPhone = String(agent.phone_number ?? "");
  if (ownPhone && remoteJid === `${ownPhone}@s.whatsapp.net`) {
    // deno-lint-ignore no-explicit-any
    const selfText = String((data.message as any)?.conversation ?? "");
    if (fromMe && selfText.startsWith("[canary")) {
      await db
        .from("whatsapp_agents")
        .update({ last_canary_ok_at: new Date().toISOString(), canary_fails: 0 })
        .eq("id", agent.id);
      if (evolutionId) {
        try {
          await evo.deleteMessageForEveryone(instance, {
            id: evolutionId,
            remoteJid,
            fromMe: true,
          });
        } catch {
          /* melhor esforço — só limpeza visual do self-chat */
        }
      }
    }
    return;
  }

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

  // Disparador (FASE 3): inbound de contato rastreado abre janela de 24h,
  // marca 'contatado' e detecta opt-out. Opt-out → confirma e encerra AQUI
  // (a IA nunca responde a um pedido de descadastro).
  if (!fromMe) {
    let disp: Awaited<ReturnType<typeof processDispatchInbound>> = {
      tracked: false,
      optedOut: false,
    };
    try {
      disp = await processDispatchInbound(
        db,
        remoteJid.split("@")[0],
        extracted.content,
        "evolution",
      );
    } catch (e) {
      console.error("processDispatchInbound error", e);
    }
    if (disp.tracked && disp.optedOut) {
      try {
        await evo.sendText(instance, remoteJid, disp.confirmMsg ?? "", 0);
      } catch (e) {
        console.error("opt-out confirm error", e);
      }
      return;
    }
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
  // Lead respondeu → cadência de follow-up recomeça do zero.
  const pushName = String((data as { pushName?: string }).pushName ?? "").trim();
  const convUpdate: Record<string, unknown> = {
    last_message_at: sentAt,
    last_message_preview: preview,
    last_inbound_message_id: inserted.id,
    unread_count: (conv.unread_count ?? 0) + 1,
    followup_stage: 0,
    last_followup_at: null,
    followup_exhausted: false,
  };
  if (pushName && !conv.contact_name) convUpdate.contact_name = pushName;
  await db.from("whatsapp_conversations").update(convUpdate).eq("id", conv.id);

  // Confirmação de leitura humanizada: check azul após 2–8s aleatórios (o
  // readMessages automático da instância fica OFF — visto instantâneo em
  // qualquer horário denuncia robô).
  if (evolutionId) {
    const readDelay = 2000 + Math.random() * 6000;
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(
      (async () => {
        await new Promise((r) => setTimeout(r, readDelay));
        await evo.markMessageAsRead(instance, [{ id: evolutionId, fromMe: false, remoteJid }]);
      })().catch((e: unknown) => console.error("markAsRead error", e)),
    );
  }

  // Agente sem instrução configurada responderia como um assistente genérico —
  // sem persona, sem preços, sem funil — e queimaria o primeiro contato do
  // cliente. Melhor ficar em silêncio até alguém preencher o prompt.
  const temPrompt = String(agent.system_prompt ?? "").trim().length > 0;
  if (agent.ai_enabled && !temPrompt) {
    console.warn(
      `IA ligada sem system_prompt — nenhuma resposta enviada (agent=${agent.id}, instance=${instance})`,
    );
  }

  if (agent.ai_enabled && temPrompt && !conv.ai_paused && !conv.human_takeover) {
    // Responde 200 já; pipeline roda em background com debounce.
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(
      runPipeline(db, agent, conv.id, remoteJid, inserted.id, leadPhone),
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
    .select("id, ai_paused, unread_count, contact_name, human_takeover")
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
    .select("id, ai_paused, unread_count, contact_name, human_takeover")
    .single();
  if (error) {
    // Corrida: outra invocação criou — re-seleciona.
    const { data: again } = await db
      .from("whatsapp_conversations")
      .select("id, ai_paused, unread_count, contact_name, human_takeover")
      .eq("agent_id", agentId)
      .eq("remote_jid", remoteJid)
      .single();
    return again;
  }
  return created;
}

// Tool agendar: cria o appointment após rechecar disponibilidade.
async function handleAgendar(
  db: DB,
  agent: Record<string, unknown>,
  conversationId: string,
  remoteJid: string,
  argsJson: string,
  /** Telefone real do lead; null quando não foi possível resolver (@lid). */
  leadPhone: string | null,
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

  // Remarcação automática: se o contato já tem agendamento futuro nesta conversa,
  // o novo substitui o antigo (evita duplicata quando o cliente muda o horário).
  const { data: existing } = await db
    .from("appointments")
    .select("id, starts_at")
    .eq("conversation_id", conversationId)
    .in("status", [...FUTURE_ACTIVE_STATUSES])
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const res = await createAppointment(db, {
    clientId: String(agent.client_id),
    agentId: String(agent.id),
    conversationId,
    startsAt,
    durationMin: service.durationMin,
    serviceLabel: service.label,
    patientName: args.nome_paciente ?? null,
    patientPhone: leadPhone,
    source: "ai",
    ignoreAppointmentId: existing?.id ?? null,
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

  // Novo criado com sucesso: cancela o anterior (remarcação concluída).
  let remarcadoDe: string | null = null;
  if (existing?.id) {
    await db.from("appointments").update({ status: "cancelled" }).eq("id", existing.id);
    const prev = utcToZonedParts(new Date(existing.starts_at), tz);
    remarcadoDe = `${prev.dateISO} ${prev.time}`;
  }

  const local = utcToZonedParts(startsAt, tz);
  return {
    ok: true,
    confirmado: {
      data: local.dateISO,
      // Vai pronto para a IA não errar o dia ao confirmar com o paciente.
      dia_semana: weekdayLabelPtBr(local.dateISO, tz),
      hora: local.time,
      servico: service.label,
    },
    ...(remarcadoDe
      ? {
          remarcado: true,
          horario_anterior: remarcadoDe,
          observacao: "O agendamento anterior foi cancelado; informe ao cliente que foi remarcado.",
        }
      : {}),
  };
}

async function runPipeline(
  db: DB,
  agent: Record<string, unknown>,
  conversationId: string,
  remoteJid: string,
  triggerMessageId: string,
  /** Telefone real do lead (null quando o JID é @lid e não há alternativa). */
  leadPhone: string | null,
) {
  // Buffer configurável por agente (padrão 15s) — tempo de silêncio antes de responder.
  const delaySec = Number(agent.response_delay_seconds);
  const delayMs = Number.isFinite(delaySec) && delaySec >= 3 ? delaySec * 1000 : DEBOUNCE_MS;
  await new Promise((r) => setTimeout(r, delayMs));

  // Claim atômico: só a invocação dona da última mensagem inbound responde.
  const { data: claimed, error: claimErr } = await db.rpc("claim_ai_run", {
    p_conversation_id: conversationId,
    p_message_id: triggerMessageId,
  });
  if (claimErr) console.error("claim_ai_run error:", claimErr.message);
  if (!claimed) return;

  // "digitando…" durante toda a geração (buffer + OpenAI + tools) — sem isso o
  // lead vê silêncio na parte mais longa. Fire-and-forget: a Evolution segura a
  // request pelo tempo do delay, então NÃO aguardamos (não atrasa a resposta).
  evo.sendPresence(String(agent.instance_name), remoteJid, 15000).catch(() => {
    /* presença é cosmética */
  });

  try {
    // Dados do contato + ficha do paciente (novo vs antigo).
    const { data: conv } = await db
      .from("whatsapp_conversations")
      .select(
        "contact_name, context_summary, patient_id, human_takeover, objections_handled, lead_temperature, conversion_probability",
      )
      .eq("id", conversationId)
      .maybeSingle();
    const contact = {
      name: conv?.contact_name ?? null,
      phone: leadPhone,
    };

    // Ficha: pelo vínculo da conversa ou pelo telefone (auto-vincula se achar).
    let patient: PatientRecord | null = null;
    if (conv?.patient_id) {
      const { data: p } = await db
        .from("patients")
        .select("id, name, phone, email, notes")
        .eq("id", conv.patient_id)
        .maybeSingle();
      patient = p ?? null;
    }
    if (!patient && contact.phone) {
      const { data: p } = await db
        .from("patients")
        .select("id, name, phone, email, notes")
        .eq("client_id", String(agent.client_id))
        .eq("phone", contact.phone)
        .maybeSingle();
      if (p) {
        patient = p;
        await db
          .from("whatsapp_conversations")
          .update({ patient_id: p.id })
          .eq("id", conversationId);
      }
    }
    const patientBlock = buildPatientBlock(patient);

    // Agendamentos deste contato (últimos 30 dias + futuros) — a IA precisa saber
    // deles para não tratar o horário do próprio cliente como conflito/duplicar.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const phone = leadPhone ?? "";
    let apptQuery = db
      .from("appointments")
      .select("starts_at, service_label, status, conversation_id, patient_phone")
      .eq("client_id", String(agent.client_id))
      .in("status", ["scheduled", "confirmed", "waiting", "late", "in_service", "completed"])
      .gte("starts_at", since);
    apptQuery = phone
      ? apptQuery.or(`conversation_id.eq.${conversationId},patient_phone.eq.${phone}`)
      : apptQuery.eq("conversation_id", conversationId);
    const { data: ownAppts } = await apptQuery.order("starts_at", { ascending: true }).limit(5);
    const contactAppointments = (ownAppts ?? []).map(
      (a: { starts_at: string; service_label: string | null; status: string }) => ({
        startsAt: a.starts_at,
        serviceLabel: a.service_label,
        status: a.status,
      }),
    );

    const { data: history } = await db
      .from("whatsapp_messages")
      .select("sender, content")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(HISTORY);
    const ordered = (history ?? []).reverse();

    const model = String(agent.model ?? "gpt-4o-mini");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(agent, contact, contactAppointments, patientBlock, conv),
      },
      ...ordered.map((m: { sender: string; content: string | null }) => ({
        role: (m.sender === "contact" ? "user" : "assistant") as "user" | "assistant",
        content: m.content ?? "",
      })),
    ];

    const agendaOn = agent.agenda_enabled === true;
    const tools = toolsForAgent(agent);

    // Vídeo de objeção a intercalar entre as bolhas nesta rodada (se houver).
    let objecaoVideo: { url: string; tipo: string } | null = null;
    const objsHandled = (conv?.objections_handled ?? {}) as Record<
      string,
      {
        detectada?: boolean;
        video_enviado?: boolean;
        at?: string;
      }
    >;

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
            result = await handleVerificar(db, agent, tc.arguments, conversationId);
          } else if (tc.name === "agendar" && agendaOn) {
            result = await handleAgendar(
              db,
              agent,
              conversationId,
              remoteJid,
              tc.arguments,
              leadPhone,
            );
          } else if (tc.name === "cadastrar_paciente") {
            let args: { nome?: string; email?: string; observacoes?: string } = {};
            try {
              args = JSON.parse(tc.arguments || "{}");
            } catch {
              /* ignora */
            }
            const nome = (args.nome ?? "").trim();
            if (!nome) {
              result = { ok: false, erro: "Informe o nome do paciente." };
            } else if (patient) {
              result = { ok: true, ja_cadastrado: true, ficha: { nome: patient.name } };
            } else {
              const { data: created, error } = await db
                .from("patients")
                .upsert(
                  {
                    client_id: String(agent.client_id),
                    name: nome,
                    phone: contact.phone ?? "",
                    email: (args.email ?? "").trim() || null,
                    notes: (args.observacoes ?? "").trim() || null,
                  },
                  { onConflict: "client_id,phone" },
                )
                .select("id, name, phone, email, notes")
                .single();
              if (error || !created) {
                result = { ok: false, erro: "Não foi possível cadastrar agora." };
              } else {
                patient = created;
                await db
                  .from("whatsapp_conversations")
                  .update({ patient_id: created.id, contact_name: contact.name ?? nome })
                  .eq("id", conversationId);
                result = { ok: true, cadastrado: true };
              }
            }
          } else if (tc.name === "atualizar_paciente") {
            let args: { nome?: string; email?: string; observacoes?: string } = {};
            try {
              args = JSON.parse(tc.arguments || "{}");
            } catch {
              /* ignora */
            }
            if (!patient) {
              result = {
                ok: false,
                erro: "Paciente ainda não cadastrado — use cadastrar_paciente.",
              };
            } else {
              const patch: Record<string, unknown> = {};
              if ((args.nome ?? "").trim()) patch.name = String(args.nome).trim();
              if ((args.email ?? "").trim()) patch.email = String(args.email).trim();
              if ((args.observacoes ?? "").trim()) {
                const stamp = new Date().toLocaleDateString("pt-BR");
                patch.notes = [patient.notes, `[${stamp}] ${String(args.observacoes).trim()}`]
                  .filter(Boolean)
                  .join("\n");
              }
              if (Object.keys(patch).length) {
                await db.from("patients").update(patch).eq("id", patient.id);
                patient = { ...patient, ...(patch as Partial<PatientRecord>) };
              }
              result = { ok: true, atualizado: true };
            }
          } else if (tc.name === "encaminhar_humano") {
            let args: { motivo?: string } = {};
            try {
              args = JSON.parse(tc.arguments || "{}");
            } catch {
              /* ignora */
            }
            await db
              .from("whatsapp_conversations")
              .update({
                human_takeover: true,
                human_takeover_at: new Date().toISOString(),
                ai_paused: true,
              })
              .eq("id", conversationId);
            const notice = buildHandoffNotification(
              agent,
              { contact_name: contact.name, remote_jid: remoteJid },
              conv?.context_summary ?? null,
              args.motivo,
            );
            for (const tel of handoffPhones(agent)) {
              const digits = tel.replace(/\D/g, "");
              if (!digits) continue;
              try {
                await evo.sendText(
                  String(agent.instance_name),
                  `${digits}@s.whatsapp.net`,
                  notice,
                  0,
                );
              } catch (e) {
                console.error("handoff notify error", e);
              }
            }
            result = {
              ok: true,
              instrucao:
                "Avise ao lead, com simpatia e em uma frase, que a pessoa responsável vai assumir a conversa por aqui. Esta é sua última mensagem — o humano assume a partir daqui.",
            };
          } else if (tc.name === "confirmar_presenca" && agendaOn) {
            const { data: next } = await db
              .from("appointments")
              .select("id, starts_at")
              .eq("conversation_id", conversationId)
              .in("status", [...FUTURE_ACTIVE_STATUSES])
              .gte("ends_at", new Date().toISOString())
              .order("starts_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!next) {
              result = { ok: false, erro: "Nenhum agendamento futuro para confirmar." };
            } else {
              await db
                .from("appointments")
                .update({ confirmed: true, status: "confirmed" })
                .eq("id", next.id);
              result = { ok: true, confirmado: true };
            }
          } else if (tc.name === "cancelar_consulta" && agendaOn) {
            const { data: next } = await db
              .from("appointments")
              .select("id, starts_at")
              .eq("conversation_id", conversationId)
              .in("status", [...FUTURE_ACTIVE_STATUSES])
              .gte("ends_at", new Date().toISOString())
              .order("starts_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!next) {
              result = { ok: false, erro: "Nenhum agendamento futuro para cancelar." };
            } else {
              await db.from("appointments").update({ status: "cancelled" }).eq("id", next.id);
              result = {
                ok: true,
                cancelado: true,
                instrucao:
                  "Confirme o cancelamento com empatia e ofereça remarcar quando fizer sentido.",
              };
            }
          } else if (tc.name === "detectar_objecao") {
            try {
              const { tipo } = JSON.parse(tc.arguments || "{}");
              const dec = await registrarObjecao(db, {
                conversationId,
                agent,
                objectionsHandled: objsHandled,
                tipo: String(tipo),
              });
              if (dec.enviar_video && dec.video_url) {
                objecaoVideo = { url: dec.video_url, tipo: String(tipo) };
              }
              result = dec;
            } catch {
              result = { ok: false, reason: "erro" };
            }
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

    // Encerramento: se a IA emitiu o marcador de "sem resposta", não envia nada.
    if (finalText.includes(NO_REPLY)) {
      const cleaned = finalText.split(NO_REPLY).join("").trim();
      if (!cleaned) return; // conversa já encerrada — silêncio
      finalText = cleaned; // sobrou texto real: envia sem o marcador
    }

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
    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
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

      // Vídeo de objeção: enviar após a 1ª bolha (acolhimento), antes do fechamento.
      if (objecaoVideo && i === 0) {
        let enviado = false;
        let erroVideo: string | undefined;
        try {
          const vr = (await evo.sendMedia(String(agent.instance_name), remoteJid, {
            mediatype: "video",
            media: objecaoVideo.url,
            fileName: `objecao_${objecaoVideo.tipo}.mp4`,
            delay: 1200,
          })) as { key?: { id?: string } };
          await db.from("whatsapp_messages").insert({
            conversation_id: conversationId,
            direction: "out",
            sender: "ai",
            message_type: "video",
            content: objecaoVideo.url,
            evolution_id: vr.key?.id ?? null,
            sent_at: new Date().toISOString(),
          });
          enviado = true;
        } catch (e) {
          erroVideo = String(e);
          // Falha aqui é silenciosa para o lead — por isso precisa gritar no log
          // com a URL, que costuma ser a causa (arquivo removido do host).
          console.error(
            `sendMedia objecao FALHOU tipo=${objecaoVideo.tipo} url=${objecaoVideo.url} conv=${conversationId}`,
            e,
          );
        }
        // Registra a tentativa nos dois casos: sem isso, uma falha deixaria a
        // trava desarmada e a IA reagiria à mesma objeção indefinidamente.
        await registrarTentativaVideo(db, conversationId, objsHandled, objecaoVideo.tipo, {
          enviado,
          erro: erroVideo,
        });
        objecaoVideo = null; // envia só 1x nesta rodada
      }
    }

    // ShortMemory: atualiza o resumo da conversa (barato, todo agente) —
    // alimenta análise, follow-ups e o painel Markei.
    {
      try {
        const recent = ordered.slice(-12) as { sender: string; content: string | null }[];
        const transcript = recent
          .map((m) => `${m.sender === "contact" ? "Lead" : "Atendente"}: ${m.content ?? ""}`)
          .join("\n");
        const s = await chat({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Atualize o resumo curto (máx. 4 frases, PT-BR) do estado desta conversa de atendimento: quem é o lead, interesse, objeções, o que falta para converter. Responda SÓ com o resumo.",
            },
            {
              role: "user",
              content: `Resumo anterior: ${conv?.context_summary ?? "(nenhum)"}\n\nÚltimas mensagens:\n${transcript}\n\nResposta enviada agora: ${finalText}`,
            },
          ],
          temperature: 0.2,
          maxTokens: 160,
        });
        if (s.content?.trim()) {
          await db
            .from("whatsapp_conversations")
            .update({ context_summary: s.content.trim() })
            .eq("id", conversationId);
        }
        await logUsage(
          db,
          String(agent.id),
          conversationId,
          "summary",
          "gpt-4o-mini",
          s.promptTokens,
          s.completionTokens,
          chatCostUsd("gpt-4o-mini", s.promptTokens, s.completionTokens),
        );
      } catch (e) {
        console.error("summary error", e);
      }
    }

    // Monday: sincroniza o card do lead (pós-resposta, atrás de monday_enabled).
    // Roda após o resumo para o Contexto do card já refletir o estado atual.
    // Falha isolada dentro de syncMonday — nunca quebra o atendimento.
    await syncMonday(db, agent, conversationId, leadPhone);
  } catch (e) {
    // Sem catch, um erro aqui virava rejeição silenciosa no waitUntil e a IA
    // ficava muda sem rastro (foi assim que a ambiguidade do claim_ai_run passou
    // despercebida). Registrar o erro é essencial para diagnóstico.
    // deno-lint-ignore no-explicit-any
    console.error("runPipeline error:", (e as any)?.stack ?? String(e));
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
