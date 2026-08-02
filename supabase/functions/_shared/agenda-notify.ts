// Aviso "CONSULTA AGENDADA" no grupo WhatsApp do agente (quando configurado).
import { sendText } from "./evolution.ts";
import { utcToZonedParts } from "./agenda.ts";

// deno-lint-ignore no-explicit-any
type DB = any;

const DEFAULT_ADDRESS = "RB Clinique - Av Ataulfo de Paiva 135 - Sala 218";
const DEFAULT_SPECIALIST = "Dr Rafael Carvalho";

export function formatAgendaNotifyMessage(opts: {
  patientName: string;
  specialistName: string;
  startsAt: Date;
  timezone: string;
  address: string;
}): string {
  const local = utcToZonedParts(opts.startsAt, opts.timezone);
  const [y, m, d] = local.dateISO.split("-");
  const datePt = `${d}/${m}/${y}`;
  return [
    "CONSULTA AGENDADA",
    `🟢 Nome: ${opts.patientName}`,
    `👨‍⚕️ Especialista: ${opts.specialistName}`,
    `📅 Data e horário: ${datePt} - ${local.time}h`,
    `📍 Endereço: ${opts.address}`,
    "",
    "⚠️ Importante: não se esqueça de trazer seus exames (caso tenha) e documentos.",
    "Caso precise de ajuda, estamos por aqui. 💙",
  ].join("\n");
}

/** Envia aviso no grupo se o agente tiver `agenda_notify_group_jid` e instância. */
export async function notifyAppointmentById(db: DB, appointmentId: string): Promise<void> {
  const { data: appt, error } = await db
    .from("appointments")
    .select(
      "id, patient_name, patient_phone, starts_at, location_address, agent_id, agent:whatsapp_agents(id, instance_name, agenda_notify_group_jid, agenda_timezone, responsible_name)",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    console.error("agenda-notify load:", error.message);
    return;
  }
  const agent = appt?.agent as {
    instance_name: string | null;
    agenda_notify_group_jid: string | null;
    agenda_timezone: string | null;
    responsible_name: string | null;
  } | null;

  const groupJid = agent?.agenda_notify_group_jid?.trim();
  const instance = agent?.instance_name?.trim();
  if (!appt || !groupJid || !instance) return;

  const tz = agent.agenda_timezone || "America/Sao_Paulo";
  const name =
    (appt.patient_name as string | null)?.trim() ||
    (appt.patient_phone as string | null)?.trim() ||
    "Paciente";
  // responsible_name costuma ser a atendente (ex.: Jessica); o grupo precisa do médico.
  // Só usa responsible_name se já vier como "Dr/Dra …".
  const responsible = agent.responsible_name?.trim() || "";
  const specialist = /^dr\.?a?\s/i.test(responsible) ? responsible : DEFAULT_SPECIALIST;
  const address = (appt.location_address as string | null)?.trim() || DEFAULT_ADDRESS;

  const text = formatAgendaNotifyMessage({
    patientName: name,
    specialistName: specialist,
    startsAt: new Date(appt.starts_at as string),
    timezone: tz,
    address,
  });

  // Claim atômico: só o primeiro chamador de UMA linha envia. Se a IA reprocessar
  // o mesmo agendamento (loop de tools) ou dois fluxos correrem, o UPDATE só afeta
  // 1x — evita o aviso duplicado no grupo. Remarcação de verdade cria linha nova
  // (group_notified_at null) → avisa corretamente.
  const { data: claimed } = await db
    .from("appointments")
    .update({ group_notified_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .is("group_notified_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return; // já avisado

  try {
    await sendText(instance, groupJid, text, 800);
  } catch (e) {
    console.error("agenda-notify send:", e instanceof Error ? e.message : e);
  }
}
