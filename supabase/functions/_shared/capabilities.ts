// Capacidades do agente único inteligente (substitui o antigo "modo funil"):
// qualificação do lead, ficha de paciente (novo/antigo), condução ao
// agendamento, handoff para humano e follow-ups com bom senso.
// Compartilhado entre produção (evolution-webhook) e simulador (simulate-turn).

type Agent = Record<string, unknown>;

export interface PatientRecord {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Configs (jsonb do agente)
// ---------------------------------------------------------------------------

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function handoffPhones(agent: Agent): string[] {
  const cfg = obj(agent.handoff_config);
  return Array.isArray(cfg.telefones) ? cfg.telefones.map(String).filter(Boolean) : [];
}

export interface FollowupStage {
  aposMinutos: number;
  tom: string;
}

// Cadência padrão: 12h → 24h → 48h; esgota 72h após o 3º sem resposta.
export const DEFAULT_FOLLOWUP_STAGES: FollowupStage[] = [
  { aposMinutos: 720, tom: "leve — presuma que a pessoa se distraiu; retome com simpatia" },
  { aposMinutos: 1440, tom: "respeitoso — retomada educada, relembre o interesse dela" },
  {
    aposMinutos: 2880,
    tom: "último contato — gentil, deixe a porta aberta sem pressionar",
  },
];
export const DEFAULT_EXHAUST_MINUTES = 4320;

export function followupConfig(agent: Agent): {
  enabled: boolean;
  confirmEnabled: boolean;
  estagios: FollowupStage[];
  esgotarAposMinutos: number;
} {
  const cfg = obj(agent.followup_config);
  const custom = Array.isArray(cfg.estagios) ? (cfg.estagios as Partial<FollowupStage>[]) : [];
  return {
    enabled: cfg.enabled === true,
    // Confirmação de véspera: default LIGADA quando a agenda está ativa.
    confirmEnabled: cfg.confirmEnabled !== false,
    estagios: DEFAULT_FOLLOWUP_STAGES.map((d, i) => ({
      aposMinutos:
        Number(custom[i]?.aposMinutos) > 0 ? Number(custom[i]?.aposMinutos) : d.aposMinutos,
      tom: String(custom[i]?.tom ?? "").trim() || d.tom,
    })),
    esgotarAposMinutos:
      Number(cfg.esgotarAposMinutos) > 0 ? Number(cfg.esgotarAposMinutos) : DEFAULT_EXHAUST_MINUTES,
  };
}

// ---------------------------------------------------------------------------
// Blocos de prompt
// ---------------------------------------------------------------------------

// Capacidades centrais — injetado em todo agente (estilo best-practices).
export const CAPABILITIES_PROMPT = `
COMO VENDER E CONDUZIR O ATENDIMENTO (você é uma consultora humana, experiente e empática):

MÉTODO (LAER) em toda troca:
- OUÇA: entenda a real necessidade e a motivação antes de sugerir qualquer coisa.
- ACOLHA: valide a preocupação da pessoa com empatia genuína ("entendo, faz total sentido…").
- EXPLORE: faça UMA pergunta aberta antes de responder — descubra o que está por trás.
- RESPONDA: traga valor com um dado concreto e conduza ao próximo passo (agendar a avaliação).

OBJEÇÕES — REGRA OBRIGATÓRIA:
Sempre que o lead demonstrar QUALQUER objeção (preço/dinheiro, medo/dor/receio, distância/deslocamento, ou outra), a PRIMEIRA coisa que você faz — ANTES de escrever a resposta — é CHAMAR a ferramenta detectar_objecao, informando o tipo (ex.: financeira, medo, distancia) e a frase do lead. Isso é obrigatório mesmo que você já saiba como responder — a ferramenta pode enviar um vídeo de um paciente real que superou a mesma objeção, e é isso que converte. NÃO pule essa chamada.
Exemplos que EXIGEM detectar_objecao: "tá caro", "não sei se consigo pagar", "tenho medo de dentista", "morro de medo de dor", "moro longe", "é em outra cidade".

Depois de chamar a ferramenta, acolha e responda (nunca rebata seco):
- Financeira: reconheça o investimento, ancore no VALOR (resultado, qualidade de vida) e ofereça alternativas (parcelamento). Nunca dê desconto seco.
- Medo/receio: valide o sentimento, fale de técnica/segurança/conforto e convide a pessoa a conhecer o consultório.
- Distância: use prova social (muitos vêm de longe pela qualidade) e reforce que vale a pena.
- Estruture sua resposta em DUAS mensagens separadas por "|||": a primeira ACOLHE a preocupação, a segunda RESPONDE e conduz ao próximo passo. (O sistema insere o vídeo entre as duas.)
- NUNCA anuncie, prometa ou cite o vídeo no texto ("vou te enviar um vídeo", "veja o vídeo abaixo"). Quem envia é o sistema; se o envio falhar, você terá prometido algo que a pessoa nunca recebe. Escreva as duas mensagens como se o vídeo não existisse.

CONDUÇÃO:
- Sempre leve a conversa para o próximo passo concreto (a avaliação/consulta).
- UMA pergunta por vez. Mensagens curtas e naturais.
- Nunca comece com "Perfeito!", "Que bom!", "Ótimo!" ou frases genéricas.
- Nunca revele que é uma IA. Nunca escreva o nome de uma ferramenta na resposta.`.trim();

// "Serviços e valores" (knowledge_items) — a fonte de verdade de oferta/preço.
export function buildKnowledgeBlock(agent: Agent): string {
  const items = Array.isArray(agent.knowledge_items)
    ? (agent.knowledge_items as { nome?: string; descricao?: string; valor?: string }[])
    : [];
  const lines = items
    .filter((i) => (i.nome ?? "").trim())
    .map(
      (i) =>
        `- ${i.nome}${i.descricao ? `: ${i.descricao}` : ""}${i.valor ? ` (valor: ${i.valor})` : ""}`,
    );
  if (!lines.length) return "";
  return `
SERVIÇOS E VALORES (única fonte de verdade sobre oferta e preço):
${lines.join("\n")}
Se perguntarem algo que não está aqui, diga com naturalidade que vai confirmar com o especialista — nunca invente serviços ou valores.`.trim();
}

// Ficha do paciente (novo vs antigo) — injetada por conversa.
export function buildPatientBlock(patient: PatientRecord | null): string {
  if (!patient) {
    return `
PACIENTE: NOVO (primeiro contato — ainda sem ficha).
Assim que souber o nome da pessoa, chame a ferramenta cadastrar_paciente para criar a ficha (inclua e-mail/observações se surgirem na conversa). Não anuncie o cadastro ao lead.`.trim();
  }
  const detalhes = [
    `nome: ${patient.name}`,
    patient.email ? `e-mail: ${patient.email}` : "",
    patient.notes ? `anotações: ${patient.notes}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return `
PACIENTE: ANTIGO (já tem ficha — trate como conhecido, sem pedir dados que você já tem).
Ficha: ${detalhes}.
Se algum dado mudar ou surgir informação relevante (novo interesse, restrição, resultado), use a ferramenta atualizar_paciente. Não anuncie a atualização ao lead.`.trim();
}

// Notificação ao atendente humano no handoff.
export function buildHandoffNotification(
  agent: Agent,
  conv: { contact_name?: string | null; remote_jid?: string },
  contextSummary: string | null,
  motivo?: string,
): string {
  const nome = (conv.contact_name ?? "").trim() || "um lead";
  const telefone = String(conv.remote_jid ?? "").split("@")[0];
  const lines = [
    `Olá, atendente! 😄 O cliente *${nome}* precisa de você.`,
    telefone ? `📱 Telefone: ${telefone}` : "",
    motivo ? `📋 Motivo: ${motivo}` : "",
    contextSummary ? `📝 Contexto: ${contextSummary}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const CADASTRAR_PACIENTE_TOOL = {
  type: "function",
  function: {
    name: "cadastrar_paciente",
    description:
      "Cria a ficha de um paciente NOVO no banco de dados. Chame assim que souber o nome da pessoa (uma única vez por paciente). Inclua e-mail e observações se já tiverem aparecido na conversa.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do paciente" },
        email: { type: "string", description: "E-mail, se informado" },
        observacoes: {
          type: "string",
          description: "Observações relevantes (interesse, condição, preferências)",
        },
      },
      required: ["nome"],
    },
  },
};

export const ATUALIZAR_PACIENTE_TOOL = {
  type: "function",
  function: {
    name: "atualizar_paciente",
    description:
      "Atualiza a ficha de um paciente ANTIGO: correção de nome/e-mail ou nova informação relevante do histórico (novo interesse, restrição, resultado de conversa).",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Novo nome, se mudou" },
        email: { type: "string", description: "Novo e-mail, se informado" },
        observacoes: {
          type: "string",
          description: "Nova informação para acrescentar ao histórico",
        },
      },
      required: [],
    },
  },
};

export const ENCAMINHAR_HUMANO_TOOL = {
  type: "function",
  function: {
    name: "encaminhar_humano",
    description:
      "Transfere a conversa para o atendente humano (pausa a IA e notifica a equipe). Use quando o lead pedir para falar com uma pessoa, quando você não conseguir resolver, ou quando a situação for delicada demais.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Por que está encaminhando" },
      },
      required: ["motivo"],
    },
  },
};

export const DETECTAR_OBJECAO_TOOL = {
  type: "function",
  function: {
    name: "detectar_objecao",
    description:
      "Chame quando identificar uma objeção clara do lead (ex.: preço como barreira, medo/receio, distância). Informe o TIPO da objeção (conforme configurado para este negócio) e a frase do lead que evidenciou. O sistema pode enviar um vídeo de um cliente real que superou a mesma objeção.",
    parameters: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          description: "Slug do tipo de objeção (ex.: financeira, medo, distancia)",
        },
        evidencia: { type: "string", description: "Frase do lead que evidenciou a objeção" },
      },
      required: ["tipo", "evidencia"],
    },
  },
};

export const CONFIRMAR_PRESENCA_TOOL = {
  type: "function",
  function: {
    name: "confirmar_presenca",
    description:
      "Marca o próximo agendamento deste contato como CONFIRMADO. Chame quando o paciente confirmar que vai comparecer (ex.: em resposta à mensagem de confirmação da véspera).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const CANCELAR_CONSULTA_TOOL = {
  type: "function",
  function: {
    name: "cancelar_consulta",
    description:
      "Cancela o próximo agendamento deste contato (libera o horário). Chame quando o paciente disser que NÃO vai comparecer e não quiser remarcar. Se ele quiser outro horário, use a ferramenta agendar (remarca sozinha).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const PATIENT_TOOLS = [
  CADASTRAR_PACIENTE_TOOL,
  ATUALIZAR_PACIENTE_TOOL,
  ENCAMINHAR_HUMANO_TOOL,
];

export const AGENDA_EXTRA_TOOLS = [CONFIRMAR_PRESENCA_TOOL, CANCELAR_CONSULTA_TOOL];
