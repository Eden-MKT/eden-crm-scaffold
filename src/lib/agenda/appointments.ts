import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

export type AppointmentStatus = "scheduled" | "cancelled" | "completed" | "no_show";
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
  const { error } = await supabase.from("appointments").insert({
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
  });
  if (error) throw error;
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

// Marca presença: compareceu (completed) / não compareceu (no_show) / desfazer (scheduled).
export async function setAppointmentStatus(
  id: string,
  status: "completed" | "no_show" | "scheduled",
): Promise<void> {
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  if (error) throw error;
}
