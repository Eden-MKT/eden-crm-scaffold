// Análise de lead sob demanda (botão "Analisar IA" nos painéis Imperius e Markei).
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireStaffOrMarkei } from "../_shared/portal.ts";
import { analyzeConversation } from "../_shared/analysis.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const ctx = await requireStaffOrMarkei(db, req);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  let body: { conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.conversationId) return json({ error: "conversationId obrigatório" }, 400);

  try {
    const result = await analyzeConversation(db, String(body.conversationId));
    if (!result) return json({ error: "Conversa não encontrada ou sem mensagens" }, 404);
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("analyze-conversation error:", e);
    return json({ error: String(e) }, 500);
  }
});
