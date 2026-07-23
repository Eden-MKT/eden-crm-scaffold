// Disparador WhatsApp — FASE 3: webhook da WhatsApp Cloud API (Meta).
//
// GET  → verificação do endpoint (hub.verify_token / hub.challenge).
// POST → eventos assinados com X-Hub-Signature-256 (HMAC-SHA256 do body cru
//        com WA_APP_SECRET). Assinatura inválida = 401 sem processar.
//
// Idempotência: cada entry/change gera um event_key determinístico gravado em
// webhook_events (unique). Reentrega da Meta → conflito → evento pulado.
//
// Eventos tratados:
// - statuses (outbound): atualiza wa_message_log por wamid (sent/delivered/
//   read/failed + error_code/title).
// - qualidade da conta: atualiza quality_tier/messaging_limit; YELLOW/RED
//   pausa a conta e as campanhas 'rodando' dela (reversão só manual).
// - messages (inbound): abre janela de 24h, marca contatado e detecta opt-out
//   (confirmação enviada via Graph API quando WA_CLOUD_TOKEN existir).
//
// Env: WA_VERIFY_TOKEN, WA_APP_SECRET, WA_CLOUD_TOKEN (opcional).
import { admin } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { processDispatchInbound } from "../_shared/dispatch-optout.ts";

// deno-lint-ignore no-explicit-any
type DB = any;

const enc = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Reserva o evento em webhook_events. false = já processado (reentrega) → pular.
async function claimEvent(db: DB, eventKey: string, payload: unknown): Promise<boolean> {
  const { error } = await db
    .from("webhook_events")
    .insert({ provider: "cloud", event_key: eventKey, payload });
  if (!error) return true;
  if (error.code === "23505") return false; // conflito no unique — idempotência
  throw error;
}

async function markProcessed(db: DB, eventKey: string) {
  await db
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_key", eventKey);
}

// ---------------------------------------------------------------------------
// statuses (mensagens outbound): sent / delivered / read / failed
// ---------------------------------------------------------------------------
const STATUS_TS_FIELD: Record<string, string> = {
  sent: "sent_at",
  delivered: "delivered_at",
  read: "read_at",
  failed: "failed_at",
};

// deno-lint-ignore no-explicit-any
async function handleStatus(db: DB, st: any) {
  const wamid = String(st?.id ?? "");
  const status = String(st?.status ?? "");
  if (!wamid || !status) return;
  const eventKey = `${wamid}:status:${status}`;
  if (!(await claimEvent(db, eventKey, st))) return;

  const ts =
    Number(st.timestamp) > 0
      ? new Date(Number(st.timestamp) * 1000).toISOString()
      : new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  const tsField = STATUS_TS_FIELD[status];
  if (tsField) patch[tsField] = ts;
  const err = st.errors?.[0];
  if (err) {
    patch.error_code = err.code != null ? String(err.code) : null;
    patch.error_title = String(err.title ?? err.message ?? "").slice(0, 300) || null;
  }
  await db.from("wa_message_log").update(patch).eq("wamid", wamid);
  await markProcessed(db, eventKey);
}

// ---------------------------------------------------------------------------
// qualidade / limite de messaging da conta
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
function isQualityChange(change: any, value: any): boolean {
  return (
    String(change?.field ?? "") === "phone_number_quality_update" ||
    String(value?.event ?? "").toUpperCase() === "PHONE_NUMBER_QUALITY_UPDATE" ||
    value?.current_limit !== undefined ||
    value?.quality !== undefined ||
    value?.quality_tier !== undefined
  );
}

// deno-lint-ignore no-explicit-any
async function handleQuality(db: DB, value: any) {
  const phoneNumberId = String(value?.phone_number_id ?? value?.metadata?.phone_number_id ?? "");
  if (!phoneNumberId) return;
  let quality = String(value?.quality ?? value?.quality_tier ?? "").toUpperCase();
  // Evento FLAGGED da Meta = qualidade degradada ao nível crítico.
  if (!quality && String(value?.event ?? "").toUpperCase() === "FLAGGED") quality = "RED";
  const limit = value?.current_limit ?? value?.messaging_limit ?? null;

  const eventKey = `${phoneNumberId}:quality:${quality || ""}:${limit ?? ""}`;
  if (!(await claimEvent(db, eventKey, value))) return;

  const patch: Record<string, unknown> = {};
  if (quality) patch.quality_tier = quality;
  if (limit) patch.messaging_limit = String(limit);
  if (Object.keys(patch).length) {
    await db.from("wa_accounts").update(patch).eq("phone_number_id", phoneNumberId);
  }

  if (quality === "YELLOW" || quality === "RED") {
    const { data: accs } = await db
      .from("wa_accounts")
      .select("id")
      .eq("phone_number_id", phoneNumberId);
    const ids = (accs ?? []).map((a: { id: string }) => a.id);
    if (ids.length) {
      await db
        .from("wa_accounts")
        .update({
          status: "pausada",
          pausado_em: new Date().toISOString(),
          pausado_motivo: "queda de qualidade (webhook)",
        })
        .in("id", ids);
      await db
        .from("campaigns")
        .update({ status: "pausada" })
        .in("wa_account_id", ids)
        .eq("status", "rodando");
    }
  }
  await markProcessed(db, eventKey);
}

// ---------------------------------------------------------------------------
// messages (inbound): janela de 24h + contatado + opt-out
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function sendCloudConfirm(phoneNumberId: string, to: string, text: string) {
  const token = Deno.env.get("WA_CLOUD_TOKEN");
  if (!token || !phoneNumberId) {
    console.warn("WA_CLOUD_TOKEN/phone_number_id ausente — confirmação de opt-out não enviada");
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    console.error(`confirmação de opt-out falhou: HTTP ${res.status}`, await res.text());
  }
}

// deno-lint-ignore no-explicit-any
async function handleInbound(db: DB, value: any, m: any) {
  const wamid = String(m?.id ?? "");
  if (!wamid) return;
  const eventKey = `${wamid}:message:`;
  if (!(await claimEvent(db, eventKey, m))) return;

  const from = String(m?.from ?? "");
  const text = String(
    m?.text?.body ?? m?.button?.text ?? m?.interactive?.button_reply?.title ?? "",
  );
  const disp = await processDispatchInbound(db, from, text, "cloud");
  if (disp.tracked && disp.optedOut && disp.confirmMsg) {
    const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
    try {
      await sendCloudConfirm(phoneNumberId, from, disp.confirmMsg);
    } catch (e) {
      console.error("sendCloudConfirm error", e);
    }
  }
  await markProcessed(db, eventKey);
}

// ---------------------------------------------------------------------------
// Processamento (em background, após responder 200)
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function processBody(db: DB, body: any) {
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      try {
        if (Array.isArray(value.statuses)) {
          for (const st of value.statuses) await handleStatus(db, st);
        } else if (Array.isArray(value.messages)) {
          for (const m of value.messages) await handleInbound(db, value, m);
        } else if (isQualityChange(change, value)) {
          await handleQuality(db, value);
        }
      } catch (e) {
        console.error("wa-cloud-webhook change error:", e);
      }
    }
  }
}

Deno.serve(async (req) => {
  // GET: verificação do endpoint pela Meta (echo do hub.challenge).
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = Deno.env.get("WA_VERIFY_TOKEN") ?? "";
    if (expected && timingSafeEqual(token, expected)) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // POST: body CRU antes de qualquer parse — a assinatura é sobre os bytes.
  const raw = await req.text();
  const secret = Deno.env.get("WA_APP_SECRET") ?? "";
  const provided = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !provided.startsWith("sha256=")) {
    return new Response("unauthorized", { status: 401 });
  }
  const expected = `sha256=${await hmacSha256Hex(secret, raw)}`;
  if (!timingSafeEqual(provided, expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // 200 imediato; processamento em background (Meta re-entrega em timeout).
  const db = admin();
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(
    processBody(db, body).catch((e: unknown) => console.error("wa-cloud-webhook error:", e)),
  );
  return json({ ok: true });
});
