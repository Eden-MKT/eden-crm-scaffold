// Núcleo do prompt/tools da IA de atendimento — compartilhado entre a produção
// (evolution-webhook) e o simulador (simulate-turn), para não haver divergência.
import { HUMANIZE_RULES } from "./humanize.ts";
import {
  buildAgendaPrompt,
  freeSlots,
  FUTURE_ACTIVE_STATUSES,
  MEDICAL_PROMPT,
  nextAvailableDay,
  parseAgendaTrips,
  resolveLocationForDate,
  resolveService,
  utcToZonedParts,
  weekdayLabelPtBr,
  type AgendaHours,
  type AgentService,
} from "./agenda.ts";
import { buildInjectionLayer } from "./best-practices.ts";
import {
  AGENDA_EXTRA_TOOLS,
  buildKnowledgeBlock,
  buildObjectionBlock,
  CAPABILITIES_PROMPT,
  DETECTAR_OBJECAO_TOOL,
  PATIENT_TOOLS,
} from "./capabilities.ts";

// deno-lint-ignore no-explicit-any
type DB = any;
type Agent = Record<string, unknown>;

export const MARK_TOOL = {
  type: "function",
  function: {
    name: "marcar_conversao",
    description:
      "Marque a conversa como convertida quando o objetivo do atendimento for atingido (ex.: agendou, fechou compra, pediu orçamento — conforme o objetivo do agente).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const TOPIC_VALUES = [
  "Agendamento",
  "Preço/Orçamento",
  "Dúvida",
  "Suporte",
  "Reclamação",
  "Outro",
];

export const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classificar_assunto",
    description:
      "Classifique o ASSUNTO PRINCIPAL desta conversa em uma categoria. Chame sempre a cada resposta, atualizando se o assunto mudar.",
    parameters: {
      type: "object",
      properties: { assunto: { type: "string", enum: TOPIC_VALUES } },
      required: ["assunto"],
    },
  },
};

// Tools de agenda — só incluídas quando o agente tem agenda_enabled.
export const AGENDA_VERIFICAR_TOOL = {
  type: "function",
  function: {
    name: "verificar_disponibilidade",
    description:
      "Retorna os horários livres para uma data e tipo de atendimento. Use SEMPRE antes de oferecer horários; ofereça apenas os horários retornados.",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato AAAA-MM-DD" },
        servico: { type: "string", description: "Tipo de atendimento (ex.: Consulta)" },
      },
      required: ["data"],
    },
  },
};

export const AGENDA_MARCAR_TOOL = {
  type: "function",
  function: {
    name: "agendar",
    description:
      "Cria o agendamento. Só chame DEPOIS de: (1) ter INFORMADO o valor da consulta ao paciente nesta conversa; (2) ter perguntado e recebido o NOME COMPLETO do próprio paciente; (3) confirmar data e hora com verificar_disponibilidade. NUNCA agende sem o valor informado e sem o nome dito pelo paciente (não use o nome salvo do contato). O 'local' deve bater com a data (viagem só nas datas de viagem; caso contrário é o consultório base).",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato AAAA-MM-DD" },
        hora: { type: "string", description: "Hora no formato HH:MM (24h)" },
        servico: { type: "string", description: "Tipo de atendimento" },
        local: {
          type: "string",
          description:
            "A cidade/consultório que você confirmou com o paciente (ex.: 'Leblon' (Rio) ou 'Guaçuí'). Deve corresponder ao local que verificar_disponibilidade retornou para essa data — NUNCA marque uma viagem numa data que não seja de viagem.",
        },
        nome_paciente: {
          type: "string",
          description:
            "Nome COMPLETO informado pelo próprio paciente (nunca o nome salvo do contato).",
        },
        valor_informado: {
          type: "boolean",
          description:
            "true SOMENTE se você já informou o valor da consulta ao paciente nesta conversa. Se ainda não informou, informe primeiro e não agende.",
        },
        nascimento: {
          type: "string",
          description: "Data de nascimento do paciente, se informada.",
        },
        cpf: { type: "string", description: "CPF do paciente, se informado." },
      },
      required: ["data", "hora", "nome_paciente", "valor_informado"],
    },
  },
};

// Tool consultar_equipe — só incluída quando o agente tem grupo configurado
// (agenda_notify_group_jid). Independe de agenda_enabled: serve para levar
// dúvidas fora do conhecimento da IA ao grupo humano (human-in-the-loop).
export const AGENDA_CONSULTAR_EQUIPE_TOOL = {
  type: "function",
  function: {
    name: "consultar_equipe",
    description:
      "Envia uma pergunta ao grupo da equipe quando você NÃO sabe responder com segurança OU quando o assunto é um dos temas que devem ser confirmados com a equipe. NUNCA invente a resposta — use esta ferramenta e avise o paciente que vai confirmar.",
    parameters: {
      type: "object",
      properties: {
        pergunta: {
          type: "string",
          description: "A pergunta objetiva a enviar à equipe",
        },
      },
      required: ["pergunta"],
    },
  },
};

function hasGroupJid(agent: Agent): boolean {
  return (
    typeof agent.agenda_notify_group_jid === "string" &&
    (agent.agenda_notify_group_jid as string).trim().length > 0
  );
}

// Conjunto de tools conforme a config do agente.
export function toolsForAgent(agent: Agent) {
  return [
    MARK_TOOL,
    CLASSIFY_TOOL,
    DETECTAR_OBJECAO_TOOL,
    ...PATIENT_TOOLS,
    ...(agent.agenda_enabled === true
      ? [AGENDA_VERIFICAR_TOOL, AGENDA_MARCAR_TOOL, ...AGENDA_EXTRA_TOOLS]
      : []),
    ...(hasGroupJid(agent) ? [AGENDA_CONSULTAR_EQUIPE_TOOL] : []),
  ];
}

// Bloco de "consulta à equipe": lista os temas que a IA sempre confirma no grupo
// e a regra de nunca inventar resposta fora do que sabe.
export function buildGroupConsultBlock(agent: Agent): string {
  if (!hasGroupJid(agent)) return "";
  const raw = agent.group_consult_topics;
  const topics = Array.isArray(raw)
    ? raw.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean)
    : [];
  const temas = topics.length ? topics.join(", ") : "qualquer dúvida fora das suas informações";
  return `
CONSULTA À EQUIPE: para os temas a seguir, OU sempre que você não tiver certeza da resposta, use a ferramenta consultar_equipe em vez de responder — NUNCA invente. Temas: ${temas}. Após consultar, diga ao paciente que vai confirmar com a equipe e retorna em seguida.`.trim();
}

// Bloco de dados estruturados do cliente (campos fixos + extra_fields).
export function buildClientDataBlock(agent: Agent): string {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    const val = s(v);
    if (val) lines.push(`- ${label}: ${val}`);
  };
  push("Responsável pelo atendimento", agent.responsible_name);
  push("Telefone do responsável", agent.responsible_phone);
  push("Profissão/Especialidade", agent.profession);
  push("Registro (CRM/OAB/…)", agent.registration_number);
  push("Endereço", agent.business_address);

  const extra = agent.extra_fields;
  if (Array.isArray(extra)) {
    for (const f of extra) {
      if (f && typeof f === "object") {
        const label = s((f as Record<string, unknown>).label);
        const value = s((f as Record<string, unknown>).value);
        if (label && value) lines.push(`- ${label}: ${value}`);
        else if (value) lines.push(`- ${value}`);
      }
    }
  }

  if (!lines.length) return "";
  return (
    "Dados do responsável e do negócio (use quando fizer sentido, ex.: informar quem entrará em contato). " +
    "Use só o que estiver aqui — nunca invente valores, nomes ou endereços:\n" +
    lines.join("\n")
  );
}

// Agendamento já existente do contato (injetado no prompt para a IA não "brigar"
// com o próprio horário do cliente nem criar duplicatas).
export interface ContactAppointment {
  startsAt: string; // ISO UTC
  serviceLabel: string | null;
  status: string; // scheduled | completed | no_show
}

function buildContactAppointmentsBlock(appts: ContactAppointment[], tz: string): string {
  if (!appts.length) return "";
  const statusLabel: Record<string, string> = {
    scheduled: "confirmado",
    completed: "já realizado",
    no_show: "não compareceu",
  };
  const lines = appts.map((a) => {
    const local = utcToZonedParts(new Date(a.startsAt), tz);
    return `- ${a.serviceLabel ?? "Atendimento"} em ${local.dateISO} às ${local.time} (${statusLabel[a.status] ?? a.status})`;
  });
  return `
AGENDAMENTOS DESTE CONTATO (já registrados no sistema):
${lines.join("\n")}
Regras sobre esses agendamentos:
- Se o cliente apenas CONFIRMAR ou AGRADECER um agendamento acima ("ok", "estarei lá", "obrigado"), responda confirmando com simpatia — NÃO chame verificar_disponibilidade nem agendar de novo. O horário dele já está garantido.
- O horário dele NÃO é conflito para ele mesmo — nunca diga que o horário que ELE tem "está ocupado".
- Se ele pedir para MUDAR o horário, use a ferramenta agendar com o novo horário: o sistema remarca sozinho (o anterior é cancelado automaticamente). Confirme a mudança citando o horário antigo e o novo.
- Se ele disser que JÁ COMPARECEU/já fez a consulta, agradeça a visita e pergunte se precisa de algo mais — não ofereça reagendar.
`.trim();
}

// Bloco de adaptação de tom conforme a leitura do lead (da análise em cron).
function buildResistanceBlock(conv?: {
  lead_temperature?: string | null;
  conversion_probability?: number | null;
}): string {
  const temp = conv?.lead_temperature ?? null;
  const prob =
    typeof conv?.conversion_probability === "number" ? conv.conversion_probability : null;
  if (!temp && prob == null) {
    return "LEITURA DO LEAD: ainda sem análise — conduza com empatia e descoberta.";
  }
  if (temp === "quente" || (prob != null && prob >= 70)) {
    return "LEITURA DO LEAD: QUENTE — proponha o agendamento com clareza e leve urgência (agenda concorrida). Seja objetivo no fechamento, mas NÃO pule acolhimento nem solte preço na primeira resposta à pergunta de valor (siga a regra de preço).";
  }
  if (temp === "frio" || (prob != null && prob < 35)) {
    return "LEITURA DO LEAD: FRIO/RESISTENTE — mais empatia, menos pressão, foque em construir confiança e entender a dor.";
  }
  return "LEITURA DO LEAD: MORNO — explore dores, crie desejo com prova social, caminhe para o próximo passo.";
}

// System prompt completo do agente (idêntico em produção e simulação).
// patientBlock: ficha novo/antigo montada por conversa (buildPatientBlock).
export function buildSystemPrompt(
  agent: Agent,
  contact: { name: string | null; phone: string | null },
  contactAppointments?: ContactAppointment[],
  patientBlock?: string,
  conv?: { lead_temperature?: string | null; conversion_probability?: number | null },
): string {
  const contactBlock =
    `Dados do contato (vindos do WhatsApp): nome = ${
      contact.name && contact.name.trim() ? contact.name.trim() : "desconhecido"
    }; telefone = ${contact.phone ?? "desconhecido"}.` +
    ` Só use o nome se for um nome real de pessoa; se estiver "desconhecido", não invente nem use placeholder.`;

  // Consciência de data — sem isso a IA "chuta" datas relativas (ex.: "próxima terça").
  const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  const dateBlock =
    `Data atual: hoje é ${hoje} (fuso ${tz}). Use isso para resolver datas relativas ` +
    `("hoje", "amanhã", "próxima terça", etc.) e NUNCA ofereça ou agende datas no passado. ` +
    `Ao usar a ferramenta de disponibilidade/agendamento, envie sempre a data no formato AAAA-MM-DD já resolvida.`;

  const agendaBlock =
    agent.agenda_enabled === true
      ? buildAgendaPrompt(
          (agent.agenda_services as AgentService[]) ?? [],
          agent.agenda_hours as AgendaHours,
          String(agent.agenda_timezone ?? "America/Sao_Paulo"),
          parseAgendaTrips(agent.agenda_trips),
        )
      : "";

  // Um bloco "# REGRAS CRÍTICAS (PRIORIDADE MÁXIMA...)" no system_prompt do agente
  // é HASTEADO para o fim do prompt montado (depois das regras globais como o
  // CAPABILITIES_PROMPT), para vencer por recência os subsistemas que o contradizem.
  const rawPrompt = agent.system_prompt ? String(agent.system_prompt) : "";
  const critIdx = rawPrompt.indexOf("# REGRAS CRÍTICAS (PRIORIDADE MÁXIMA");
  const mainPrompt = critIdx >= 0 ? rawPrompt.slice(0, critIdx).replace(/\s+$/, "") : rawPrompt;
  const criticalBlock = critIdx >= 0 ? rawPrompt.slice(critIdx).trim() : "";

  const parts = [
    mainPrompt,
    agent.niche ? `Nicho do cliente: ${agent.niche}` : "",
    agent.prompt_injection_enabled !== false ? buildInjectionLayer(agent) : "",
    CAPABILITIES_PROMPT,
    buildResistanceBlock(conv),
    agent.is_medical === true ? MEDICAL_PROMPT : "",
    agent.business_info ? `Informações do negócio: ${agent.business_info}` : "",
    buildKnowledgeBlock(agent),
    buildObjectionBlock(agent),
    buildClientDataBlock(agent),
    agendaBlock,
    buildGroupConsultBlock(agent),
    buildContactAppointmentsBlock(contactAppointments ?? [], tz),
    patientBlock ?? "",
    agent.conversion_goal ? `Objetivo do atendimento (conversão): ${agent.conversion_goal}` : "",
    agent.greeting ? `Saudação de referência: ${agent.greeting}` : "",
    agent.agenda_enabled === true ? dateBlock : "",
    contactBlock,
    HUMANIZE_RULES,
    criticalBlock, // POR ÚLTIMO: prioridade máxima do agente vence por recência.
  ];
  return parts.filter(Boolean).join("\n\n");
}

// Tool verificar_disponibilidade: devolve horários livres reais (read-only).
// conversationId (opcional): informa também os horários que o PRÓPRIO contato
// já tem naquele dia — para o modelo não tratar o horário dele como conflito.
export async function handleVerificar(
  db: DB,
  agent: Agent,
  argsJson: string,
  conversationId?: string | null,
) {
  let args: { data?: string; servico?: string } = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    /* ignora */
  }
  const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
  const services = (agent.agenda_services as AgentService[]) ?? [];
  const hours = agent.agenda_hours as AgendaHours;
  const trips = parseAgendaTrips(agent.agenda_trips);
  const service = resolveService(services, args.servico);
  if (!args.data) return { erro: "Informe a data no formato AAAA-MM-DD." };
  const slots = await freeSlots(db, {
    clientId: String(agent.client_id ?? "00000000-0000-0000-0000-000000000000"),
    dateISO: args.data,
    durationMin: service.durationMin,
    hours,
    tz,
    trips,
  });
  const loc = resolveLocationForDate(trips, args.data);

  // Se o dia pedido (ex.: "hoje" já tarde) não tem vaga, já entrega o próximo dia
  // com horários — o modelo oferece o próximo horário comercial em vez de só negar.
  let proxima: {
    data: string;
    dia_semana: string;
    local: string;
    endereco: string;
    horarios_livres: string[];
  } | null = null;
  if (!slots.length) {
    const next = await nextAvailableDay(db, {
      clientId: String(agent.client_id ?? "00000000-0000-0000-0000-000000000000"),
      fromISO: args.data,
      durationMin: service.durationMin,
      hours,
      tz,
      trips,
    });
    if (next) {
      const nloc = resolveLocationForDate(trips, next.dateISO);
      proxima = {
        data: next.dateISO,
        dia_semana: weekdayLabelPtBr(next.dateISO, tz),
        local: nloc.label,
        endereco: nloc.address,
        horarios_livres: next.slots,
      };
    }
  }

  let ownTimes: string[] = [];
  if (conversationId) {
    const { data: own } = await db
      .from("appointments")
      .select("starts_at")
      .eq("conversation_id", conversationId)
      .in("status", [...FUTURE_ACTIVE_STATUSES]);
    ownTimes = (own ?? [])
      .map((o: { starts_at: string }) => utcToZonedParts(new Date(o.starts_at), tz))
      .filter((p: { dateISO: string }) => p.dateISO === args.data)
      .map((p: { time: string }) => p.time);
  }

  return {
    data: args.data,
    // O modelo não calcula dia da semana confiavelmente (já ofereceu "terça"
    // para uma segunda). Entregamos pronto e o prompt manda usar este valor.
    dia_semana: weekdayLabelPtBr(args.data, tz),
    servico: service.label,
    duracao_min: service.durationMin,
    local: loc.label,
    endereco: loc.address,
    ...(loc.isTrip ? { viagem: true } : {}),
    horarios_livres: slots,
    ...(ownTimes.length
      ? {
          agendamentos_do_proprio_contato: ownTimes,
          observacao:
            "Os horários acima em 'agendamentos_do_proprio_contato' já são DESTE cliente — não são conflito para ele; não os trate como ocupados nem ofereça reagendar sem ele pedir.",
        }
      : {}),
    ...(slots.length
      ? {}
      : proxima
        ? {
            aviso: `Sem horários nesse dia. PRÓXIMO dia com vaga: ${proxima.data} (${proxima.dia_semana}). Ofereça esses horários — não deixe o paciente chutando datas.`,
            proxima_data_disponivel: proxima,
          }
        : { aviso: "Sem horários livres nesse dia; sugira outra data." }),
  };
}
