import { supabase } from "@/integrations/supabase/client";

export interface PortalAppointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  serviceLabel: string | null;
  durationMin: number;
  startsAt: string;
  endsAt: string;
  status: string;
  source: string;
  notes: string | null;
}

interface RawAppt {
  id: string;
  patient_name: string | null;
  patient_phone: string | null;
  service_label: string | null;
  duration_min: number;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
  notes: string | null;
}

export interface PortalService {
  label: string;
  durationMin: number;
}

export const portalAgendaKeys = {
  all: ["portal", "agenda"] as const,
  list: (fromISO?: string, toISO?: string) =>
    ["portal", "agenda", "list", fromISO ?? "", toISO ?? ""] as const,
};

export interface PortalAgendaResult {
  appointments: PortalAppointment[];
  agendaEnabled: boolean;
  services: PortalService[];
}

export async function fetchPortalAgenda(
  fromISO?: string,
  toISO?: string,
): Promise<PortalAgendaResult> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: {
      action: "list",
      ...(fromISO ? { from: fromISO } : {}),
      ...(toISO ? { to: toISO } : {}),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const appointments: PortalAppointment[] = (data.appointments ?? []).map((a: RawAppt) => ({
    id: a.id,
    patientName: a.patient_name,
    patientPhone: a.patient_phone,
    serviceLabel: a.service_label,
    durationMin: a.duration_min,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    status: a.status,
    source: a.source,
    notes: a.notes,
  }));
  const services: PortalService[] = (data.services ?? []).map((s: PortalService) => ({
    label: String(s.label ?? ""),
    durationMin: Number(s.durationMin) || 60,
  }));
  return { appointments, agendaEnabled: data.agendaEnabled === true, services };
}

export interface PortalCreateApptInput {
  patientName: string;
  patientPhone?: string;
  serviceLabel?: string;
  startsAt: string; // ISO
  durationMin?: number;
}

export async function createPortalAppointment(input: PortalCreateApptInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: { action: "create", ...input },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export interface PortalUpdateApptInput {
  appointmentId: string;
  patientName?: string;
  patientPhone?: string;
  serviceLabel?: string;
  startsAt?: string; // ISO
  durationMin?: number;
}

// Edita um agendamento (portal). A edge checa dono e conflito de horário (409).
export async function updatePortalAppointment(input: PortalUpdateApptInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: { action: "update", ...input },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function cancelPortalAppointment(appointmentId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: { action: "cancel", appointmentId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function setPortalAppointmentStatus(
  appointmentId: string,
  status: "completed" | "no_show" | "scheduled",
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: { action: "set_status", appointmentId, status },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
