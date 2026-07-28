/** Tipos e helpers de viagens de agenda (ex.: Guaçuí) — espelho leve do edge. */

export interface AgendaTripDay {
  date: string; // YYYY-MM-DD
  slots: string[]; // HH:MM
}

export interface AgendaTrip {
  id: string;
  label: string;
  address: string;
  days: AgendaTripDay[];
}

export const DEFAULT_LEBLON_LABEL = "Leblon (RB Clinique)";
export const DEFAULT_LEBLON_ADDRESS = "RB Clinique - Av Ataulfo de Paiva 135 - Sala 218";
export const DEFAULT_GUACUI_LABEL = "Guaçuí";
export const DEFAULT_GUACUI_ADDRESS =
  "Instituto Unique — Rua Senador Atílio Vivacqua, 169 — Guaçuí, ES";

/** "9:00h" / "9:00" / "09:00" → "09:00" */
export function normalizeSlotTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*h?$/i);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Aceita um horário por linha (ou separados por vírgula/espaço). */
export function parseSlotLines(text: string): string[] {
  const parts = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const n = normalizeSlotTime(p);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.sort();
}

export function parseAgendaTrips(raw: unknown): AgendaTrip[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t))
    .map((t) => ({
      id: String(t.id ?? "").trim() || `trip-${Math.random().toString(36).slice(2, 10)}`,
      label: String(t.label ?? DEFAULT_GUACUI_LABEL).trim() || DEFAULT_GUACUI_LABEL,
      address: String(t.address ?? DEFAULT_GUACUI_ADDRESS).trim() || DEFAULT_GUACUI_ADDRESS,
      days: (Array.isArray(t.days) ? t.days : [])
        .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
        .map((d) => ({
          date: String(d.date ?? "").slice(0, 10),
          slots: (Array.isArray(d.slots) ? d.slots : [])
            .map((s) => normalizeSlotTime(String(s)))
            .filter((s): s is string => !!s),
        }))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)),
    }));
}

export function findTripDay(
  trips: AgendaTrip[],
  dateISO: string,
): { trip: AgendaTrip; day: AgendaTripDay } | null {
  for (const trip of trips) {
    const day = trip.days.find((d) => d.date === dateISO);
    if (day) return { trip, day };
  }
  return null;
}

export function resolveLocationForDate(
  trips: AgendaTrip[],
  dateISO: string,
): { label: string; address: string; isTrip: boolean } {
  const hit = findTripDay(trips, dateISO);
  if (hit) return { label: hit.trip.label, address: hit.trip.address, isTrip: true };
  return { label: DEFAULT_LEBLON_LABEL, address: DEFAULT_LEBLON_ADDRESS, isTrip: false };
}

export function newTripId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
