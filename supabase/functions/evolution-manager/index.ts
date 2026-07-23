import { admin } from "../_shared/db.ts";
import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { requireStaff, requireStaffOrMarkei } from "../_shared/portal.ts";
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

  let payload: { action?: string; [k: string]: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = payload.action;

  // Guard por ação: gerenciar instâncias é exclusivo do staff (Imperius);
  // enviar mensagem manual também é permitido ao papel markei (donos).
  if (action === "send_manual") {
    const ctx = await requireStaffOrMarkei(db, req);
    if (!ctx) return json({ error: "Unauthorized" }, 401);
  } else {
    const staff = await requireStaff(db, req);
    if (!staff) return json({ error: "Unauthorized" }, 401);
  }

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

        // ensureCleanInstance faz delete + ESPERA a propagação + retry no 403
        // "name already in use" (o delete da Evolution é assíncrono). O caminho
        // ingênuo delete→create imediato estourava a função nesse 403.
        await evo.ensureCleanInstance({
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
        const number = payload.number ? String(payload.number).replace(/\D/g, "") : undefined;
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name")
          .eq("id", agentId)
          .single();
        if (!agent?.instance_name) return json({ error: "No instance" }, 400);
        // Auto-recuperação: instância com sessão zumbi (credenciais antigas +
        // socket morto) faz o celular recusar o QR. Recria limpa quando preciso.
        const recreated = await evo.ensureCleanInstance({
          instanceName: agent.instance_name,
          webhookUrl: WEBHOOK_URL,
          webhookToken: WEBHOOK_TOKEN(),
        });
        if (recreated) {
          await db
            .from("whatsapp_agents")
            .update({ status: "connecting", phone_number: null })
            .eq("id", agentId);
        }
        const r = (await evo.connectInstance(agent.instance_name, number)) as {
          base64?: string;
          code?: string;
          pairingCode?: string;
        };
        return json({
          base64: r.base64 ?? null,
          code: r.code ?? null,
          pairingCode: r.pairingCode ?? null,
        });
      }

      case "status": {
        const agentId = String(payload.agentId);
        const { data: agent } = await db
          .from("whatsapp_agents")
          .select("instance_name, connection_error")
          .eq("id", agentId)
          .single();
        if (!agent?.instance_name) return json({ status: "disconnected" });
        const r = (await evo.connectionState(agent.instance_name)) as {
          instance?: { state?: string };
        };
        const status = mapState(r.instance?.state ?? "close");
        await db.from("whatsapp_agents").update({ status }).eq("id", agentId);
        // blockReason: motivo do último bloqueio/banimento (setado pelo webhook);
        // some sozinho quando a conta conecta (state open limpa a coluna).
        return json({ status, blockReason: agent.connection_error ?? null });
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

        const r = (await evo.sendText(agent.instance_name, conv.remote_jid, text, 0)) as {
          key?: { id?: string };
        };
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
    return json({ error: friendlyError(e) }, 502);
  }
});

// Traduz erros técnicos do Evolution para mensagens acionáveis em pt-BR — o
// front mostra isso direto no toast. O texto cru fica no console.error acima.
function friendlyError(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e);
  if (/(already\s+in\s+use|already\s+exists|in[-\s]?use)/i.test(raw)) {
    return "A conexão anterior ainda está sendo liberada. Aguarde alguns segundos e tente de novo.";
  }
  if (/Evolution API não configurada/i.test(raw)) return raw; // já é claro
  if (/ainda está sendo liberada/i.test(raw)) return raw; // já amigável (ensureCleanInstance)
  if (/-> 4\d\d:|-> 5\d\d:|Evolution (GET|POST|DELETE)/i.test(raw)) {
    return "Não foi possível preparar a conexão agora. Tente novamente em alguns segundos.";
  }
  return raw;
}

export { corsHeaders };
