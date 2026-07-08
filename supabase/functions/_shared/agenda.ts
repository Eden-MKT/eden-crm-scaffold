// Lógica de agenda compartilhada entre a IA (evolution-webhook) e as edge functions
// humanas (portal-agenda). Fuso padrão America/Sao_Paulo (Brasil sem horário de verão).

// deno-lint-ignore no-explicit-any
type DB = any;

export const SLOT_STEP_MIN = 30;

export interface AgentService {
  label: string;
  durationMin: number;
}
interface DayHours {
  open: boolean;
  start: string; // "HH:MM"
  end: string;
}
export interface AgendaHours {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
  lunch: { enabled: boolean; start: string; end: string };
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Offset (ms) do fuso em relação ao UTC no instante `date`.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    map.hour === "24" ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

// Converte um horário de parede (data local + "HH:MM" no fuso) para instante UTC.
export function zonedToUtc(dateISO: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const off1 = tzOffsetMs(new Date(naive), tz);
  let utc = new Date(naive - off1);
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = new Date(naive - off2);
  return utc;
}

// Partes de parede (data/hora/weekday) de um instante UTC no fuso.
export function utcToZonedParts(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    dateISO: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour === "24" ? "00" : map.hour}:${map.minute}`,
    weekday: map.weekday, // "Mon", "Tue"...
  };
}

function weekdayKeyOf(dateISO: string, tz: string): (typeof WEEKDAY_KEYS)[number] {
  // Meio-dia local evita virada de dia por offset.
  const noon = zonedToUtc(dateISO, "12:00", tz);
  const idx = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .format(noon)
    .toLowerCase();
  const map: Record<string, (typeof WEEKDAY_KEYS)[number]> = {
    sun: "sun",
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
  };
  return map[idx.slice(0, 3)] ?? "mon";
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Escolhe o serviço que melhor casa com o texto pedido (case-insensitive).
export function resolveService(services: AgentService[], requested?: string): AgentService {
  const list = Array.isArray(services) ? services.filter((s) => s && s.label) : [];
  if (!list.length) return { label: requested?.trim() || "Atendimento", durationMin: 60 };
  if (requested) {
    const q = requested.trim().toLowerCase();
    const hit =
      list.find((s) => s.label.toLowerCase() === q) ||
      list.find((s) => s.label.toLowerCase().includes(q) || q.includes(s.label.toLowerCase()));
    if (hit) return { label: hit.label, durationMin: Number(hit.durationMin) || 60 };
  }
  return { label: list[0].label, durationMin: Number(list[0].durationMin) || 60 };
}

async function scheduledInRange(db: DB, clientId: string, startUtc: Date, endUtc: Date) {
  const { data } = await db
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("client_id", clientId)
    .eq("status", "scheduled")
    .lt("starts_at", endUtc.toISOString())
    .gt("ends_at", startUtc.toISOString());
  return (data ?? []) as Array<{ starts_at: string; ends_at: string }>;
}

// Horários livres (strings "HH:MM" no fuso do cliente) para um dia e duração.
export async function freeSlots(
  db: DB,
  opts: { clientId: string; dateISO: string; durationMin: number; hours: AgendaHours; tz: string },
): Promise<string[]> {
  const { clientId, dateISO, durationMin, hours, tz } = opts;
  const key = weekdayKeyOf(dateISO, tz);
  const day = hours?.[key];
  if (!day || !day.open) return [];

  const winStart = zonedToUtc(dateISO, day.start, tz).getTime();
  const winEnd = zonedToUtc(dateISO, day.end, tz).getTime();
  const lunch = hours.lunch?.enabled
    ? {
        s: zonedToUtc(dateISO, hours.lunch.start, tz).getTime(),
        e: zonedToUtc(dateISO, hours.lunch.end, tz).getTime(),
      }
    : null;

  const busy = await scheduledInRange(db, clientId, new Date(winStart), new Date(winEnd));
  const busyRanges = busy.map((b) => ({
    s: new Date(b.starts_at).getTime(),
    e: new Date(b.ends_at).getTime(),
  }));

  const stepMs = SLOT_STEP_MIN * 60_000;
  const durMs = durationMin * 60_000;
  const nowMs = Date.now();
  const slots: string[] = [];
  for (let s = winStart; s + durMs <= winEnd; s += stepMs) {
    const e = s + durMs;
    if (s < nowMs) continue; // não oferecer horário no passado
    if (lunch && overlaps(s, e, lunch.s, lunch.e)) continue;
    if (busyRanges.some((b) => overlaps(s, e, b.s, b.e))) continue;
    slots.push(utcToZonedParts(new Date(s), tz).time);
  }
  return slots;
}

export async function isFree(
  db: DB,
  clientId: string,
  startUtc: Date,
  endUtc: Date,
): Promise<boolean> {
  const busy = await scheduledInRange(db, clientId, startUtc, endUtc);
  return busy.length === 0;
}

// Cria um agendamento após rechecar o horário. Retorna a linha ou null (conflito).
export async function createAppointment(
  db: DB,
  a: {
    clientId: string;
    agentId?: string | null;
    conversationId?: string | null;
    startsAt: Date;
    durationMin: number;
    serviceLabel: string;
    patientName?: string | null;
    patientPhone?: string | null;
    source: "ai" | "staff" | "client";
    notes?: string | null;
  },
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const endsAt = new Date(a.startsAt.getTime() + a.durationMin * 60_000);
  if (!(await isFree(db, a.clientId, a.startsAt, endsAt))) {
    return { ok: false, reason: "conflict" };
  }
  const { data, error } = await db
    .from("appointments")
    .insert({
      client_id: a.clientId,
      agent_id: a.agentId ?? null,
      conversation_id: a.conversationId ?? null,
      patient_name: a.patientName ?? null,
      patient_phone: a.patientPhone ?? null,
      service_label: a.serviceLabel,
      duration_min: a.durationMin,
      starts_at: a.startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "scheduled",
      source: a.source,
      notes: a.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: String(error.message ?? error) };
  return { ok: true, id: data.id };
}

// ---- Blocos de prompt (um lugar só, para edições futuras do nicho) ----

export const MEDICAL_PROMPT = `
CONTEXTO MÉDICO (o cliente é um profissional/consultório de saúde):
- Trate os contatos como PACIENTES. Acolha com empatia e linguagem simples.
- Ao longo da conversa, descubra de forma natural (uma pergunta por vez): se é a primeira vez
  ou retorno; o motivo/queixa principal; se é atendimento particular ou por convênio (e qual);
  e se há urgência.
- NUNCA dê diagnóstico, conduta clínica, prescrição ou garantia de resultado — isso é do
  profissional. Em caso de urgência/emergência, oriente procurar atendimento imediato.
- Não invente valores, endereços, datas ou nomes de profissionais que não estejam nas
  informações do negócio.
- Perceba quando o paciente não quer mais conversar ou não quer agendar agora ("depois eu vejo",
  "vou pensar", respostas curtas/evasivas): não insista, encerre com cordialidade e deixe a porta
  aberta ("quando quiser, é só chamar").
`.trim();

// Instruções de agendamento específicas do agente (serviços + horário de atendimento).
export function buildAgendaPrompt(
  services: AgentService[],
  hours: AgendaHours,
  tz: string,
): string {
  const svc = (Array.isArray(services) ? services : [])
    .filter((s) => s && s.label)
    .map((s) => `- ${s.label} (~${Number(s.durationMin) || 60} min)`)
    .join("\n");
  const dayNames: Record<string, string> = {
    mon: "Seg",
    tue: "Ter",
    wed: "Qua",
    thu: "Qui",
    fri: "Sex",
    sat: "Sáb",
    sun: "Dom",
  };
  const hoursLines = WEEKDAY_KEYS.map((k) => k)
    .filter((k) => k !== "sun" || true)
    .map((k) => {
      const d = hours?.[k as keyof AgendaHours] as DayHours | undefined;
      if (!d) return "";
      return d.open ? `${dayNames[k]}: ${d.start}–${d.end}` : `${dayNames[k]}: fechado`;
    })
    .filter(Boolean)
    .join(" · ");
  const lunch = hours?.lunch?.enabled ? ` (almoço ${hours.lunch.start}–${hours.lunch.end})` : "";

  return `
AGENDAMENTO (você pode agendar diretamente no sistema):
- SEU OBJETIVO é qualificar o paciente, tirar todas as dúvidas e MARCAR A CONSULTA. Conduza a
  conversa nessa direção, com cordialidade e sem pressão.
- Enquanto o paciente demonstrar interesse e ainda não agendou, um "ok/tá/entendi" é apenas
  CONFIRMAÇÃO — siga em frente (ex.: ofereça horários, confirme os dados). Não encerre no meio.
- Se o paciente disser que não quer agendar agora ou demonstrar desinteresse, NÃO insista:
  encerre com cordialidade e deixe a porta aberta.
- Tipos de atendimento disponíveis:
${svc || "- Consulta (~60 min)"}
- Horário de atendimento: ${hoursLines}${lunch}. Fuso: ${tz}.
- SEMPRE use a ferramenta verificar_disponibilidade (com a data no formato AAAA-MM-DD e o tipo
  de atendimento) ANTES de oferecer horários. Ofereça apenas horários que ela retornar — nunca
  invente horário.
- Só use a ferramenta agendar depois de confirmar com o paciente a data, a hora, o tipo de
  atendimento e o nome. Se o horário estiver ocupado, ofereça as alternativas retornadas.
- Ao concluir o agendamento, confirme em uma frase curta (data, hora e tipo).
`.trim();
}
