import { supabase } from "@/integrations/supabase/client";
import type { BoardAppointmentStatus } from "@/lib/agenda/appointment-status";

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
  followups: () => ["portal", "agenda", "followups"] as const,
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

// ---- Follow-ups (fila automática da IA + agendados manualmente) ----

export interface PortalManualFollowup {
  id: string;
  conversationId: string | null;
  message: string;
  scheduledAt: string;
  status: string;
  sentAt: string | null;
}

export interface PortalAutoFollowup {
  id: string;
  contactName: string | null;
  remoteJid: string;
  followupStage: number;
  lastFollowupAt: string | null;
  followupExhausted: boolean;
  lastMessageAt: string | null;
}

export interface PortalFollowupsResult {
  manual: PortalManualFollowup[];
  auto: PortalAutoFollowup[];
}

interface RawManualFollowup {
  id: string;
  conversation_id: string | null;
  message: string | null;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
}

interface RawAutoFollowup {
  id: string;
  contact_name: string | null;
  remote_jid: string;
  followup_stage: number | null;
  last_followup_at: string | null;
  followup_exhausted: boolean | null;
  last_message_at: string | null;
}

export async function fetchPortalFollowups(): Promise<PortalFollowupsResult> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: { action: "list_followups" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const manual: PortalManualFollowup[] = (data.manual ?? []).map((f: RawManualFollowup) => ({
    id: f.id,
    conversationId: f.conversation_id ?? null,
    message: f.message ?? "",
    scheduledAt: f.scheduled_at,
    status: f.status,
    sentAt: f.sent_at ?? null,
  }));
  const auto: PortalAutoFollowup[] = (data.auto ?? []).map((c: RawAutoFollowup) => ({
    id: c.id,
    contactName: c.contact_name ?? null,
    remoteJid: c.remote_jid,
    followupStage: c.followup_stage ?? 0,
    lastFollowupAt: c.last_followup_at ?? null,
    followupExhausted: c.followup_exhausted === true,
    lastMessageAt: c.last_message_at ?? null,
  }));
  return { manual, auto };
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
  status: BoardAppointmentStatus,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("portal-agenda", {
    body: { action: "set_status", appointmentId, status },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
