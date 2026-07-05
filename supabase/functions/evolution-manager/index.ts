import { admin } from "../_shared/db.ts";
import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import * as evo from "../_shared/evolution.ts";

const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;
const WEBHOOK_TOKEN = () => Deno.env.get("EVOLUTION_WEBHOOK_TOKEN")!;

function instanceNameFor(agentId: string): string {
  return `eden_${agentId.replace(/-/g, "").slice(0, 12)}`;
}

function mapState(state: string): "connected" | "connecting" | "disconnected" {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();

  // Validação de sessão in-function (verify_jwt do gateway não é confiável
  // com as novas publishable keys).
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(token ?? "");
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let payload: { action?: string; [k: string]: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = payload.action;

  try {
    switch (action) {
      case "create_instance": {
        const agentId = String(payload.agentId);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("id, instance_name")
          .eq("id", agentId)
          .single();
        if (!agent) return json({ error: "Agent not found" }, 404);
        const instanceName = agent.instance_name ?? instanceNameFor(agentId);

        // Se já existe, garante limpeza antes de recriar.
        try {
          await evo.deleteInstance(instanceName);
        } catch {
          /* pode não existir ainda */
        }
        await evo.createInstance({
          instanceName,
          webhookUrl: WEBHOOK_URL,
          webhookToken: WEBHOOK_TOKEN(),
        });
        await db
          .from("whatsapp_agents")
          .update({ instance_name: instanceName, status: "connecting" })
          .eq("id", agentId);
        return json({ ok: true, instanceName });
      }

      case "qr": {
        const agentId = String(payload.agentId);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name")
          .eq("id", agentId)
          .single();
        if (!agent?.instance_name) return json({ error: "No instance" }, 400);
        const r = (await evo.connectInstance(agent.instance_name)) as {
          base64?: string;
          code?: string;
        };
        return json({ base64: r.base64 ?? null, code: r.code ?? null });
      }

      case "status": {
        const agentId = String(payload.agentId);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name")
          .eq("id", agentId)
          .single();
        if (!agent?.instance_name)
          return json({ status: "disconnected" });
        const r = (await evo.connectionState(agent.instance_name)) as {
          instance?: { state?: string };
        };
        const status = mapState(r.instance?.state ?? "close");
        await db
          .from("whatsapp_agents")
          .update({ status })
          .eq("id", agentId);
        return json({ status });
      }

      case "logout": {
        const agentId = String(payload.agentId);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name")
          .eq("id", agentId)
          .single();
        if (agent?.instance_name) {
          try {
            await evo.logoutInstance(agent.instance_name);
          } catch {
            /* ignore */
          }
        }
        await db
          .from("whatsapp_agents")
          .update({ status: "disconnected", phone_number: null })
          .eq("id", agentId);
        return json({ ok: true });
      }

      case "delete_instance": {
        const agentId = String(payload.agentId);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name")
          .eq("id", agentId)
          .single();
        if (agent?.instance_name) {
          try {
            await evo.deleteInstance(agent.instance_name);
          } catch {
            /* ignore */
          }
        }
        await db
          .from("whatsapp_agents")
          .update({
            instance_name: null,
            status: "disconnected",
            phone_number: null,
          })
          .eq("id", agentId);
        return json({ ok: true });
      }

      case "send_manual": {
        const conversationId = String(payload.conversationId);
        const text = String(payload.text ?? "").trim();
        if (!text) return json({ error: "Empty text" }, 400);
        const { data: conv } = await db
          .from("whatsapp_conversations")
          .select("id, remote_jid, agent_id")
          .eq("id", conversationId)
          .single();
        if (!conv) return json({ error: "Conversation not found" }, 404);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name")
          .eq("id", conv.agent_id)
          .single();
        if (!agent?.instance_name) return json({ error: "No instance" }, 400);

        const r = (await evo.sendText(
          agent.instance_name,
          conv.remote_jid,
          text,
          0,
        )) as { key?: { id?: string } };
        const now = new Date().toISOString();
        await db.from("whatsapp_messages").insert({
          conversation_id: conversationId,
          direction: "out",
          sender: "human",
          message_type: "text",
          content: text,
          evolution_id: r.key?.id ?? null,
          sent_at: now,
        });
        await db
          .from("whatsapp_conversations")
          .update({ last_message_at: now, last_message_preview: text })
          .eq("id", conversationId);
        return json({ ok: true });
      }

      case "generate_connect_token": {
        const agentId = String(payload.agentId);
        const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { data, error } = await db
          .from("whatsapp_connect_tokens")
          .insert({ agent_id: agentId, expires_at: expires })
          .select("token")
          .single();
        if (error) throw error;
        return json({ token: data.token });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("evolution-manager error:", e);
    return json({ error: String(e) }, 500);
  }
});

export { corsHeaders };
