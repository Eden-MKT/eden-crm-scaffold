import { supabase } from "@/integrations/supabase/client";
import { mapEvent, type AgendaEvent, type AgendaEventType } from "./types";

export const agendaKeys = {
  all: ["agenda"] as const,
  range: (from: string, to: string) => [...agendaKeys.all, "range", from, to] as const,
  upcoming: () => [...agendaKeys.all, "upcoming"] as const,
};

const EVENT_COLS =
  "id, title, type, starts_at, ends_at, client_id, notes, assignees, created_by, created_at";

// Eventos que tocam o intervalo [from, to] (ISO).
export async function fetchEventsInRange(from: string, to: string): Promise<AgendaEvent[]> {
  const { data, error } = await supabase
    .from("agenda_events")
    .select(EVENT_COLS)
    .lt("starts_at", to)
    .gt("ends_at", from)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export async function fetchUpcomingEvents(limit = 6): Promise<AgendaEvent[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("agenda_events")
    .select(EVENT_COLS)
    .gte("ends_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export interface EventInput {
  title: string;
  type: AgendaEventType;
  startsAt: string;
  endsAt: string;
  clientId: string | null;
  notes: string | null;
  assignees: string[];
}

export async function createEvent(input: EventInput): Promise<void> {
  const { error } = await supabase.from("agenda_events").insert({
    title: input.title,
    type: input.type,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    client_id: input.clientId,
    notes: input.notes,
    assignees: input.assignees,
  });
  if (error) throw error;
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  const { error } = await supabase
    .from("agenda_events")
    .update({
      title: input.title,
      type: input.type,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      client_id: input.clientId,
      notes: input.notes,
      assignees: input.assignees,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("agenda_events").delete().eq("id", id);
  if (error) throw error;
}
