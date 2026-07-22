// Orquestrador (cron a cada 3 min): reanalisa conversas ativas que receberam
// mensagens desde a última análise. Equivalente ao Orquestrador_CRM do n8n.
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireCron, requireStaff } from "../_shared/portal.ts";
import { analyzeConversation } from "../_shared/analysis.ts";

const BATCH = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  if (!requireCron(req)) {
    const staff = await requireStaff(db, req);
    if (!staff) return json({ error: "Unauthorized" }, 401);
  }

  try {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pending } = await db
      .from("whatsapp_conversations")
      .select("id, analyzed_at, last_message_at")
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      .limit(100);

    const candidates = (pending ?? [])
      .filter(
        (c: { analyzed_at: string | null; last_message_at: string | null }) =>
          !c.analyzed_at || (c.last_message_at && c.analyzed_at < c.last_message_at),
      )
      .slice(0, BATCH);

    let analyzed = 0;
    for (const c of candidates) {
      try {
        const r = await analyzeConversation(db, c.id);
        if (r) analyzed++;
      } catch (e) {
        console.error("orchestrator analyze error", c.id, e);
      }
    }

    return json({ ok: true, candidates: candidates.length, analyzed });
  } catch (e) {
    console.error("orchestrator-run error:", e);
    return json({ error: String(e) }, 500);
  }
});
