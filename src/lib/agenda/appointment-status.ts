// Status operacionais da agenda estilo Clinicorp (board + legend).
// `cancelled` existe no banco mas fica fora do board.

export const BOARD_STATUSES = [
  "scheduled",
  "confirmed",
  "waiting",
  "in_service",
  "completed",
  "late",
  "no_show",
] as const;

export type BoardAppointmentStatus = (typeof BOARD_STATUSES)[number];

export type AppointmentStatus = BoardAppointmentStatus | "cancelled";

/** Status que ainda ocupam horário (conflito / slots). */
export const SLOT_BLOCKING_STATUSES: BoardAppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "waiting",
  "in_service",
  "late",
];

/** Status que indicam consulta futura ativa (não enviar follow-up de venda). */
export const FUTURE_ACTIVE_STATUSES: BoardAppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "waiting",
  "late",
];

export const APPOINTMENT_STATUS_META: Record<
  BoardAppointmentStatus,
  { label: string; shortLabel: string; color: string }
> = {
  scheduled: { label: "Agendado", shortLabel: "Agendado", color: "#9CA3AF" },
  confirmed: { label: "Confirmado", shortLabel: "1-Confirmado", color: "#22C55E" },
  waiting: { label: "Em espera", shortLabel: "2-Em espera", color: "#EAB308" },
  in_service: { label: "Em atendimento", shortLabel: "3-Em atendimento", color: "#3B82F6" },
  completed: { label: "Atendido", shortLabel: "4-Atendido", color: "#15803D" },
  late: { label: "Atrasado", shortLabel: "5-Atrasado", color: "#EF4444" },
  no_show: { label: "Faltou", shortLabel: "6-Faltou", color: "#374151" },
};

export const STATUS_LEGEND = BOARD_STATUSES.map((status) => ({
  status,
  label: APPOINTMENT_STATUS_META[status].shortLabel,
  color: APPOINTMENT_STATUS_META[status].color,
}));

export function isBoardStatus(value: string): value is BoardAppointmentStatus {
  return (BOARD_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: string): string {
  if (isBoardStatus(status)) return APPOINTMENT_STATUS_META[status].label;
  if (status === "cancelled") return "Cancelado";
  return status;
}

export function statusColor(status: string): string {
  if (isBoardStatus(status)) return APPOINTMENT_STATUS_META[status].color;
  return "#9CA3AF";
}
