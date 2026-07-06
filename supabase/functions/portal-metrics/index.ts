import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requirePortalClient } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const ctx = await requirePortalClient(db, req);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const { data: metrics, error } = await db.rpc("portal_metrics", {
    p_client_id: ctx.clientId,
  });
  if (error) return json({ error: error.message }, 500);

  const { data: client } = await db
    .from("clients")
    .select("name, company")
    .eq("id", ctx.clientId)
    .maybeSingle();

  return json({ client, metrics });
});
