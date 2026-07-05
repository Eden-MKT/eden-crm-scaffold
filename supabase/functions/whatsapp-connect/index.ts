import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import * as evo from "../_shared/evolution.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const token = body.token;
  if (!token) return json({ error: "Missing token" }, 400);

  const { data: row } = await db
    .from("whatsapp_connect_tokens")
    .select("token, agent_id, expires_at")
    .eq("token", token)
    .single();
  if (!row) return json({ error: "Token inválido" }, 404);
  if (new Date(row.expires_at).getTime() < Date.now())
    return json({ error: "Token expirado", status: "expired" }, 410);

  const { data: agent } = await db
    .from("whatsapp_agents")
    .select("id, instance_name")
    .eq("id", row.agent_id)
    .single();

  try {
    if (!agent?.instance_name) {
      return json({ status: "disconnected" });
    }
    const st = (await evo.connectionState(agent.instance_name)) as {
      instance?: { state?: string };
    };
    const state = st.instance?.state ?? "close";

    if (state === "open") {
      await db
        .from("whatsapp_connect_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token);
      await db
        .from("whatsapp_agents")
        .update({ status: "connected" })
        .eq("id", agent.id);
      return json({ status: "connected" });
    }

    // Não conectado → QR fresco
    const r = (await evo.connectInstance(agent.instance_name)) as {
      base64?: string;
    };
    return json({ status: "connecting", qrBase64: r.base64 ?? null });
  } catch (e) {
    console.error("whatsapp-connect error:", e);
    return json({ error: String(e), status: "error" }, 500);
  }
});
