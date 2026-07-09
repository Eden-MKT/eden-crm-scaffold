import type { Database } from "@/integrations/supabase/types";

type EventRow = Database["public"]["Tables"]["agenda_events"]["Row"];

export type AgendaEventType = "reuniao" | "onboarding" | "call" | "compromisso";

export interface AgendaEvent {
  id: string;
  title: string;
  type: AgendaEventType;
  startsAt: string;
  endsAt: string;
  clientId: string | null;
  notes: string | null;
  assignees: string[];
  createdAt: string;
}

export const EVENT_TYPES: { value: AgendaEventType; label: string }[] = [
  { value: "reuniao", label: "Reunião" },
  { value: "onboarding", label: "Onboarding" },
  { value: "call", label: "Call" },
  { value: "compromisso", label: "Compromisso" },
];

// Cores por tipo (usa tokens de marca via classes utilitárias inline).
export const EVENT_COLORS: Record<AgendaEventType, string> = {
  reuniao: "#1F4FD6",
  onboarding: "#0EA5E9",
  call: "#8B5CF6",
  compromisso: "#F59E0B",
};

export function mapEvent(row: EventRow): AgendaEvent {
  return {
    id: row.id,
    title: row.title,
    type: (row.type as AgendaEventType) ?? "compromisso",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    clientId: row.client_id,
    notes: row.notes,
    assignees: row.assignees ?? [],
    createdAt: row.created_at,
  };
}
