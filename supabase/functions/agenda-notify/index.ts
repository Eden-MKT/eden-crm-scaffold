// Edge mínima: notifica o grupo WhatsApp após agendamento staff (CRM).
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireStaffOrMarkei } from "../_shared/portal.ts";
import { notifyAppointmentById } from "../_shared/agenda-notify.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const user = await requireStaffOrMarkei(db, req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { appointmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const appointmentId = String(body.appointmentId ?? "").trim();
  if (!appointmentId) return json({ error: "appointmentId obrigatório" }, 400);

  await notifyAppointmentById(db, appointmentId);
  return json({ ok: true });
});
