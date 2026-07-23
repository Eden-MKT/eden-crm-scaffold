import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import * as evo from "../_shared/evolution.ts";

const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;
const WEBHOOK_TOKEN = () => Deno.env.get("EVOLUTION_WEBHOOK_TOKEN")!;

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
    .select("id, instance_name, connection_error")
    .eq("id", row.agent_id)
    .single();

  try {
    if (!agent?.instance_name) {
      return json({ status: "disconnected" });
    }
    // Número banido/bloqueado: avisa na hora, sem nem tocar na Evolution nem
    // gerar QR (seria inútil). connection_error só fica setado enquanto não
    // conectou — um evento "open" no webhook zera a coluna.
    if (agent.connection_error) {
      return json({ status: "blocked", message: agent.connection_error });
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
      await db.from("whatsapp_agents").update({ status: "connected" }).eq("id", agent.id);
      return json({ status: "connected" });
    }

    // Não conectado → garante instância limpa (sessão zumbi faz o celular
    // recusar o QR) e gera QR fresco. ensureCleanInstance protege pareamento
    // em andamento (só recria instância morta e sem atividade recente).
    const recreated = await evo.ensureCleanInstance({
      instanceName: agent.instance_name,
      webhookUrl: WEBHOOK_URL,
      webhookToken: WEBHOOK_TOKEN(),
    });
    if (recreated) {
      await db
        .from("whatsapp_agents")
        .update({ status: "connecting", phone_number: null })
        .eq("id", agent.id);
    }
    const r = (await evo.connectInstance(agent.instance_name)) as {
      base64?: string;
    };
    return json({ status: "connecting", qrBase64: r.base64 ?? null });
  } catch (e) {
    console.error("whatsapp-connect error:", e);
    return json({ error: String(e), status: "error" }, 500);
  }
});
