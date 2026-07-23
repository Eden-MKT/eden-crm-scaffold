import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requirePortalClient } from "../_shared/portal.ts";
import {
  BOARD_STATUSES,
  SLOT_BLOCKING_STATUSES,
  createAppointment,
  type AgentService,
} from "../_shared/agenda.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const ctx = await requirePortalClient(db, req);
  if (!ctx) return json({ error: "Unauthorized" }, 401);
  const clientId = ctx.clientId;

  // Agente do cliente (para agenda_enabled + serviços/duração).
  const { data: agent } = await db
    .from("whatsapp_agents")
    .select("id, agenda_enabled, agenda_services")
    .eq("client_id", clientId)
    .maybeSingle();

  let body: {
    action?: string;
    from?: string;
    to?: string;
    appointmentId?: string;
    status?: string;
    patientName?: string;
    patientPhone?: string;
    serviceLabel?: string;
    startsAt?: string;
    durationMin?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    if (body.action === "list") {
      let q = db
        .from("appointments")
        .select(
          "id, patient_name, patient_phone, service_label, duration_min, starts_at, ends_at, status, source, notes",
        )
        .eq("client_id", clientId)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (body.from) q = q.gte("ends_at", body.from);
      if (body.to) q = q.lte("starts_at", body.to);
      const { data, error } = await q;
      if (error) throw error;
      return json({
        appointments: data ?? [],
        agendaEnabled: agent?.agenda_enabled === true,
        services: (agent?.agenda_services as AgentService[]) ?? [],
      });
    }

    if (body.action === "create") {
      if (!body.startsAt) return json({ error: "Informe a data/hora." }, 400);
      const services = (agent?.agenda_services as AgentService[]) ?? [];
      const label = body.serviceLabel?.trim() || services[0]?.label || "Atendimento";
      const svc = services.find((s) => s.label === label);
      const durationMin = Number(body.durationMin) || svc?.durationMin || 60;
      const startsAt = new Date(body.startsAt);
      const res = await createAppointment(db, {
        clientId,
        agentId: agent?.id ?? null,
        startsAt,
        durationMin,
        serviceLabel: label,
        patientName: body.patientName?.trim() || null,
        patientPhone: body.patientPhone?.trim() || null,
        source: "client",
      });
      if (!res.ok) {
        return json(
          { error: res.reason === "conflict" ? "Horário indisponível." : "Falha ao agendar." },
          409,
        );
      }
      return json({ ok: true, id: res.id });
    }

    if (body.action === "cancel") {
      const id = String(body.appointmentId ?? "");
      if (!id) return json({ error: "Agendamento inválido." }, 400);
      // Ownership: o agendamento tem que ser do cliente.
      const { data: appt } = await db
        .from("appointments")
        .select("id, client_id")
        .eq("id", id)
        .maybeSingle();
      if (!appt || appt.client_id !== clientId) return json({ error: "Forbidden" }, 403);
      const { error } = await db.from("appointments").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "update") {
      const id = String(body.appointmentId ?? "");
      if (!id) return json({ error: "Agendamento inválido." }, 400);
      // Ownership: o agendamento tem que ser do cliente.
      const { data: appt } = await db
        .from("appointments")
        .select(
          "id, client_id, starts_at, duration_min, service_label, patient_name, patient_phone",
        )
        .eq("id", id)
        .maybeSingle();
      if (!appt || appt.client_id !== clientId) return json({ error: "Forbidden" }, 403);

      const services = (agent?.agenda_services as AgentService[]) ?? [];
      const label = body.serviceLabel?.trim() || appt.service_label || "Atendimento";
      const svc = services.find((s) => s.label === label);
      const durationMin = Number(body.durationMin) || svc?.durationMin || appt.duration_min || 60;
      const startsAt = body.startsAt ? new Date(body.startsAt) : new Date(appt.starts_at);
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

      // Conflito: outro agendamento ativo sobrepondo (excluindo o próprio).
      const { data: busy } = await db
        .from("appointments")
        .select("id")
        .eq("client_id", clientId)
        .in("status", [...SLOT_BLOCKING_STATUSES])
        .neq("id", id)
        .lt("starts_at", endsAt.toISOString())
        .gt("ends_at", startsAt.toISOString());
      if ((busy ?? []).length > 0) return json({ error: "Horário indisponível." }, 409);

      const patientName =
        body.patientName !== undefined ? body.patientName.trim() || null : appt.patient_name;
      const patientPhone =
        body.patientPhone !== undefined ? body.patientPhone.trim() || null : appt.patient_phone;
      const { error } = await db
        .from("appointments")
        .update({
          patient_name: patientName,
          patient_phone: patientPhone,
          service_label: label,
          duration_min: durationMin,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "list_followups") {
      if (!agent?.id) return json({ manual: [], auto: [] });
      // Manuais agendados + fila automática (conversas em cadência), só do agente do cliente.
      const { data: manual } = await db
        .from("follow_ups")
        .select("id, conversation_id, message, scheduled_at, status, sent_at")
        .eq("agent_id", agent.id)
        .order("scheduled_at", { ascending: false })
        .limit(50);
      const { data: auto } = await db
        .from("whatsapp_conversations")
        .select(
          "id, contact_name, remote_jid, followup_stage, last_followup_at, followup_exhausted, last_message_at",
        )
        .eq("agent_id", agent.id)
        .eq("converted", false)
        .eq("human_takeover", false)
        .gt("followup_stage", 0)
        .order("last_followup_at", { ascending: false })
        .limit(50);
      return json({ manual: manual ?? [], auto: auto ?? [] });
    }

    if (body.action === "set_status") {
      const id = String(body.appointmentId ?? "");
      const status = String(body.status ?? "");
      if (!id || !(BOARD_STATUSES as readonly string[]).includes(status)) {
        return json({ error: "Dados inválidos." }, 400);
      }
      const { data: appt } = await db
        .from("appointments")
        .select("id, client_id")
        .eq("id", id)
        .maybeSingle();
      if (!appt || appt.client_id !== clientId) return json({ error: "Forbidden" }, 403);
      const { error } = await db.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (e) {
    console.error("portal-agenda error:", e);
    return json({ error: String(e) }, 500);
  }
});
