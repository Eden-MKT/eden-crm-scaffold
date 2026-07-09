// Núcleo do prompt/tools da IA de atendimento — compartilhado entre a produção
// (evolution-webhook) e o simulador (simulate-turn), para não haver divergência.
import { HUMANIZE_RULES } from "./humanize.ts";
import {
  buildAgendaPrompt,
  freeSlots,
  MEDICAL_PROMPT,
  resolveService,
  type AgendaHours,
  type AgentService,
} from "./agenda.ts";
import { buildInjectionLayer } from "./best-practices.ts";

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
      "Cria o agendamento após confirmar data, hora, tipo e nome com o paciente. Só chame depois de verificar_disponibilidade e da confirmação do paciente.",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato AAAA-MM-DD" },
        hora: { type: "string", description: "Hora no formato HH:MM (24h)" },
        servico: { type: "string", description: "Tipo de atendimento" },
        nome_paciente: { type: "string", description: "Nome do paciente" },
      },
      required: ["data", "hora"],
    },
  },
};

// Conjunto de tools conforme a config do agente.
export function toolsForAgent(agent: Agent) {
  return agent.agenda_enabled === true
    ? [MARK_TOOL, CLASSIFY_TOOL, AGENDA_VERIFICAR_TOOL, AGENDA_MARCAR_TOOL]
    : [MARK_TOOL, CLASSIFY_TOOL];
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

// System prompt completo do agente (idêntico em produção e simulação).
export function buildSystemPrompt(
  agent: Agent,
  contact: { name: string | null; phone: string | null },
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
        )
      : "";

  const parts = [
    agent.system_prompt ? String(agent.system_prompt) : "",
    agent.niche ? `Nicho do cliente: ${agent.niche}` : "",
    agent.prompt_injection_enabled !== false ? buildInjectionLayer(agent) : "",
    agent.is_medical === true ? MEDICAL_PROMPT : "",
    agent.business_info ? `Informações do negócio: ${agent.business_info}` : "",
    buildClientDataBlock(agent),
    agendaBlock,
    agent.conversion_goal ? `Objetivo do atendimento (conversão): ${agent.conversion_goal}` : "",
    agent.greeting ? `Saudação de referência: ${agent.greeting}` : "",
    agent.agenda_enabled === true ? dateBlock : "",
    contactBlock,
    HUMANIZE_RULES,
  ];
  return parts.filter(Boolean).join("\n\n");
}

// Tool verificar_disponibilidade: devolve horários livres reais (read-only).
export async function handleVerificar(db: DB, agent: Agent, argsJson: string) {
  let args: { data?: string; servico?: string } = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    /* ignora */
  }
  const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
  const services = (agent.agenda_services as AgentService[]) ?? [];
  const hours = agent.agenda_hours as AgendaHours;
  const service = resolveService(services, args.servico);
  if (!args.data) return { erro: "Informe a data no formato AAAA-MM-DD." };
  const slots = await freeSlots(db, {
    clientId: String(agent.client_id ?? "00000000-0000-0000-0000-000000000000"),
    dateISO: args.data,
    durationMin: service.durationMin,
    hours,
    tz,
  });
  return {
    data: args.data,
    servico: service.label,
    duracao_min: service.durationMin,
    horarios_livres: slots,
    ...(slots.length ? {} : { aviso: "Sem horários livres nesse dia; sugira outra data." }),
  };
}
