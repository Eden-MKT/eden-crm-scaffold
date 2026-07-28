import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AppointmentStatus, BoardAppointmentStatus } from "@/lib/agenda/appointment-status";
import { parseAgendaTrips, resolveLocationForDate } from "@/lib/agenda/trip-slots";

export type { AppointmentStatus, BoardAppointmentStatus } from "@/lib/agenda/appointment-status";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

export type AppointmentSource = "ai" | "staff" | "client";

export interface Appointment {
  id: string;
  clientId: string;
  patientName: string | null;
  patientPhone: string | null;
  serviceLabel: string | null;
  durationMin: number;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
}

const APPT_COLS =
  "id, client_id, agent_id, conversation_id, patient_name, patient_phone, service_label, duration_min, starts_at, ends_at, status, source, notes, created_at";

export function mapAppointment(
  row: Omit<AppointmentRow, "confirmed" | "confirmation_sent_at">,
): Appointment {
  return {
    id: row.id,
    clientId: row.client_id,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    serviceLabel: row.service_label,
    durationMin: row.duration_min,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as AppointmentStatus,
    source: row.source as AppointmentSource,
    notes: row.notes,
  };
}

export const appointmentKeys = {
  all: ["appointments"] as const,
  byClient: (clientId: string, fromISO?: string, toISO?: string) =>
    [...appointmentKeys.all, clientId, fromISO ?? "", toISO ?? ""] as const,
  allClients: (fromISO: string, toISO: string) =>
    [...appointmentKeys.all, "all-clients", fromISO, toISO] as const,
};

// Agendamentos de um cliente no período (staff, RLS is_staff).
// Um item entra se TOCA o intervalo (ends_at >= from && starts_at <= to).
export async function fetchClientAppointments(
  clientId: string,
  fromISO: string,
  toISO: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPT_COLS)
    .eq("client_id", clientId)
    .neq("status", "cancelled")
    .gte("ends_at", fromISO)
    .lte("starts_at", toISO)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapAppointment);
}

// Agendamentos de TODOS os clientes no período (staff, RLS is_staff) — visão
// de gestão. O client_id volta mapeado (clientId) para filtro por IA/cliente.
export async function fetchAllAppointments(fromISO: string, toISO: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPT_COLS)
    .neq("status", "cancelled")
    .gte("ends_at", fromISO)
    .lte("starts_at", toISO)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapAppointment);
}

export interface StaffApptInput {
  clientId: string;
  agentId: string;
  patientName: string;
  patientPhone: string | null;
  serviceLabel: string;
  startsAt: string; // ISO
  durationMin: number;
  notes: string | null;
}

// Cria manualmente (staff). Rechecagem de conflito no banco não é atômica aqui,
// mas a IA usa createAppointment no edge com recheck; para staff é aceitável.
export async function createStaffAppointment(input: StaffApptInput): Promise<void> {
  const starts = new Date(input.startsAt);
  const ends = new Date(starts.getTime() + input.durationMin * 60_000);

  let locationLabel: string | null = null;
  let locationAddress: string | null = null;
  if (input.agentId) {
    const { data: agent } = await supabase
      .from("whatsapp_agents")
      .select("agenda_trips, agenda_timezone")
      .eq("id", input.agentId)
      .maybeSingle();
    if (agent) {
      const tz = agent.agenda_timezone || "America/Sao_Paulo";
      const trips = parseAgendaTrips(agent.agenda_trips);
      // Data civil no fuso do agente (evita virada UTC).
      const dateISO = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(starts);
      const loc = resolveLocationForDate(trips, dateISO);
      locationLabel = loc.label;
      locationAddress = loc.address;
    }
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      client_id: input.clientId,
      agent_id: input.agentId,
      patient_name: input.patientName || null,
      patient_phone: input.patientPhone,
      service_label: input.serviceLabel,
      duration_min: input.durationMin,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: "scheduled",
      source: "staff",
      notes: input.notes,
      location_label: locationLabel,
      location_address: locationAddress,
    })
    .select("id")
    .single();
  if (error) throw error;
  // Aviso no grupo WhatsApp (se o agente tiver agenda_notify_group_jid).
  if (data?.id) {
    void supabase.functions.invoke("agenda-notify", {
      body: { appointmentId: data.id },
    });
  }
}

export interface StaffApptUpdate {
  patientName: string;
  patientPhone: string | null;
  serviceLabel: string;
  startsAt: string; // ISO
  durationMin: number;
}

// Edita um agendamento (staff). Sem checagem de conflito — override consciente da equipe.
export async function updateStaffAppointment(id: string, patch: StaffApptUpdate): Promise<void> {
  const starts = new Date(patch.startsAt);
  const ends = new Date(starts.getTime() + patch.durationMin * 60_000);
  const { error } = await supabase
    .from("appointments")
    .update({
      patient_name: patch.patientName || null,
      patient_phone: patch.patientPhone,
      service_label: patch.serviceLabel,
      duration_min: patch.durationMin,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelAppointment(id: string): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}

// Atualiza status operacional (board Clinicorp). Cancelamento usa cancelAppointment.
export async function setAppointmentStatus(
  id: string,
  status: BoardAppointmentStatus,
): Promise<void> {
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  if (error) throw error;
}
