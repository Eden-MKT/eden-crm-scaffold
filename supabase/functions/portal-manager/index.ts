import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { generatePassword, requireStaff } from "../_shared/portal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const staff = await requireStaff(db, req);
  if (!staff) return json({ error: "Unauthorized" }, 401);

  let payload: { action?: string; [k: string]: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    switch (payload.action) {
      case "status": {
        const clientId = String(payload.clientId);
        const { data: mapping } = await db
          .from("client_portal_users")
          .select("user_id")
          .eq("client_id", clientId)
          .maybeSingle();
        if (!mapping) return json({ exists: false });
        const { data: u } = await db.auth.admin.getUserById(mapping.user_id);
        return json({ exists: true, email: u?.user?.email ?? null });
      }

      case "create_portal": {
        const clientId = String(payload.clientId);
        const email = String(payload.email ?? "").trim().toLowerCase();
        if (!email || !email.includes("@"))
          return json({ error: "Email inválido" }, 400);

        const { data: existing } = await db
          .from("client_portal_users")
          .select("user_id")
          .eq("client_id", clientId)
          .maybeSingle();
        if (existing) {
          const { data: u } = await db.auth.admin.getUserById(existing.user_id);
          return json({
            exists: true,
            email: u?.user?.email ?? email,
            message: "Painel já existe. Use 'redefinir senha' se necessário.",
          });
        }

        const password = generatePassword();
        const { data: created, error: createErr } =
          await db.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            app_metadata: { role: "client", client_id: clientId },
          });
        if (createErr || !created?.user)
          return json(
            { error: `Falha ao criar usuário: ${createErr?.message ?? "?"}` },
            400,
          );

        const { error: mapErr } = await db
          .from("client_portal_users")
          .insert({ user_id: created.user.id, client_id: clientId });
        if (mapErr) {
          // desfaz o usuário se o mapping falhar
          await db.auth.admin.deleteUser(created.user.id);
          return json({ error: `Falha no vínculo: ${mapErr.message}` }, 400);
        }

        return json({ ok: true, email, password });
      }

      case "reset_password": {
        const clientId = String(payload.clientId);
        const { data: mapping } = await db
          .from("client_portal_users")
          .select("user_id")
          .eq("client_id", clientId)
          .maybeSingle();
        if (!mapping) return json({ error: "Painel não existe" }, 404);
        const password = generatePassword();
        const { error } = await db.auth.admin.updateUserById(mapping.user_id, {
          password,
        });
        if (error) return json({ error: error.message }, 400);
        const { data: u } = await db.auth.admin.getUserById(mapping.user_id);
        return json({ ok: true, email: u?.user?.email ?? null, password });
      }

      default:
        return json({ error: `Unknown action: ${payload.action}` }, 400);
    }
  } catch (e) {
    console.error("portal-manager error:", e);
    return json({ error: String(e) }, 500);
  }
});
