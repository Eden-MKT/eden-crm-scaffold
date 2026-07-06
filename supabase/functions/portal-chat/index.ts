import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requirePortalClient } from "../_shared/portal.ts";

const MEDIA_BUCKET = "whatsapp-media";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const ctx = await requirePortalClient(db, req);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  // Agente do cliente (ponte cliente -> métricas/chat).
  const { data: agent } = await db
    .from("whatsapp_agents")
    .select("id")
    .eq("client_id", ctx.clientId)
    .maybeSingle();
  const agentId: string | null = agent?.id ?? null;

  let body: { action?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    if (body.action === "list_conversations") {
      if (!agentId) return json({ conversations: [] });
      const { data, error } = await db
        .from("whatsapp_conversations")
        .select("*")
        .eq("agent_id", agentId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      // zera unread (é do staff, não do cliente)
      const conversations = (data ?? []).map((c) => ({
        ...c,
        unread_count: 0,
      }));
      return json({ conversations });
    }

    if (body.action === "messages") {
      const conversationId = String(body.conversationId ?? "");
      if (!agentId || !conversationId)
        return json({ error: "Conversa inválida" }, 400);

      // Ownership: a conversa tem que ser do agente do cliente.
      const { data: conv } = await db
        .from("whatsapp_conversations")
        .select("id, agent_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!conv || conv.agent_id !== agentId)
        return json({ error: "Forbidden" }, 403);

      const { data: msgs, error } = await db
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true });
      if (error) throw error;

      // URLs assinadas para mídia (service role).
      const rows = msgs ?? [];
      const paths = rows
        .filter((m) => m.media_path)
        .map((m) => m.media_path as string);
      const urlByPath = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await db.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, 3600);
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
        }
      }

      const messages = rows.map((m) => ({
        ...m,
        media_url: m.media_path ? (urlByPath.get(m.media_path) ?? null) : null,
      }));
      return json({ messages });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (e) {
    console.error("portal-chat error:", e);
    return json({ error: String(e) }, 500);
  }
});
