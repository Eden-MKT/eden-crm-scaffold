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
  /** Mensagem manual do estágio; vazia = IA gera na hora conforme o tom. */
  mensagem?: string;
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
      mensagem: String(custom[i]?.mensagem ?? "").trim(),
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

PERGUNTA DE PREÇO / VALOR (obrigatório — o lead muitas vezes pede o número de cara):
Quando a pessoa perguntar quanto custa, valor, orçamento ou "quanto é":
1. ACOLHA: reconheça que faz sentido querer saber ("entendo, é importante ter clareza…").
2. ENCANTAR: em UMA frase, fale do benefício / resultado / diferencial — SEM citar nenhum número.
3. EXPLORE: faça UMA pergunta leve (o que busca, urgência, principal preocupação).
4. PREÇO: só no TURNO SEGUINTE (depois que ela responder) — ou se ela insistir de novo no valor nesta conversa — cite o valor da lista de serviços. Se não houver valor cadastrado, diga que confirma com o especialista e ofereça o próximo passo.
Nunca despeje o preço na primeira resposta à pergunta de valor. Encantar e entender vem antes do número.

OBJEÇÕES — REGRA OBRIGATÓRIA:
Sempre que o lead demonstrar QUALQUER objeção (preço/dinheiro, medo/dor/receio, distância/deslocamento, plano/convênio, ou outra), a PRIMEIRA coisa que você faz — ANTES de escrever a resposta — é CHAMAR a ferramenta detectar_objecao, informando o tipo (ex.: financeira, medo, distancia, sem_convenio) e a frase do lead. Isso é obrigatório mesmo que você já saiba como responder — a ferramenta pode enviar um vídeo de um paciente real que superou a mesma objeção, e é isso que converte. NÃO pule essa chamada.
Exemplos que EXIGEM detectar_objecao: "tá caro", "não sei se consigo pagar", "tenho medo de dentista", "morro de medo de dor", "moro longe", "é em outra cidade", "aceita plano?", "tem convênio?", "é particular?", "vocês atendem Unimed?".

PLANO / CONVÊNIO (se o negócio for particular e existir objeção cadastrada, ex. sem_convenio):
- Se o lead perguntar se aceita plano/convênio ou disser que quer usar o plano: OBRIGATÓRIO chamar detectar_objecao com o tipo configurado (ex.: sem_convenio) ANTES de responder.
- Na resposta: empatia + anuncie o vídeo (sem URL) + explique com orgulho o diferencial do particular (tempo, cuidado, resultado). NUNCA responda só com "não atendemos convênio" / "só particular" — isso faz o lead ir embora.

Depois de chamar a ferramenta, acolha e responda (nunca rebata seco):
- Financeira: reconheça o investimento, ancore no VALOR (resultado, qualidade de vida) e ofereça alternativas (parcelamento). Nunca dê desconto seco.
- Medo/receio: valide o sentimento, explique de forma simples (sem termos técnicos) o cuidado e o conforto, e convide a pessoa a conhecer o consultório.
- Distância: use prova social (muitos vêm de longe pela qualidade) e reforce que vale a pena.
- Plano/convênio: acolha a expectativa do plano, mostre o valor do particular sem fechar a porta, e conduza à avaliação.
ROTEIRO PADRÃO da resposta à objeção (siga à risca):
- Se a ferramenta retornou enviar_video = true, estruture em mensagens separadas por "|||":
  (1) PRIMEIRA mensagem: acolha com empatia validando a objeção específica e ANUNCIE o vídeo — ex.: "Tudo bem se preocupar com o valor, é super normal 😊 ||| Deixa eu te mandar um vídeo do [nome do responsável, ex. Dr. Rafael] respondendo exatamente isso." (o sistema envia o vídeo logo após a primeira mensagem);
  (2) mensagem seguinte (curta, opcional): complemento conforme a abordagem da objeção;
  (3) ÚLTIMA mensagem: pergunte a opinião e puxe o agendamento — ex.: "O que você achou? Podemos agendar sua avaliação?".
  NÃO envie links nem URLs do vídeo — o sistema manda o arquivo de vídeo automaticamente. Só anuncie em texto.
- Se a ferramenta retornou enviar_video = false (sem vídeo ou já enviado), NÃO mencione vídeo nenhum: acolha, responda pela abordagem e feche com o mesmo convite ao agendamento.

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
Se perguntarem algo que não está aqui, diga com naturalidade que vai confirmar com o especialista — nunca invente serviços ou valores.
Não despeje o valor na primeira resposta à pergunta de preço; siga a regra PERGUNTA DE PREÇO / VALOR (acolher → encantar → perguntar → preço só no turno seguinte ou na insistência).`.trim();
}

/** Lista as objeções cadastradas (tipo/gatilhos/abordagem) — sem video_url. */
export function buildObjectionBlock(agent: Agent): string {
  const list = Array.isArray(agent.objection_config)
    ? (agent.objection_config as {
        tipo?: string;
        rotulo?: string;
        gatilhos?: string[];
        abordagem?: string;
        video_url?: string;
      }[])
    : [];
  const lines = list
    .filter((o) => (o.tipo ?? "").trim())
    .map((o) => {
      const gatilhos = Array.isArray(o.gatilhos) ? o.gatilhos.filter(Boolean).join(", ") : "";
      const temVideo = typeof o.video_url === "string" && o.video_url.length > 0;
      return `- tipo="${o.tipo}"${o.rotulo ? ` (${o.rotulo})` : ""}${gatilhos ? ` | gatilhos: ${gatilhos}` : ""}${o.abordagem ? ` | abordagem: ${o.abordagem}` : ""}${temVideo ? " | tem vídeo" : ""}`;
    });
  if (!lines.length) return "";
  return `
OBJEÇÕES CADASTRADAS DESTE NEGÓCIO (use o campo tipo= EXATO ao chamar detectar_objecao):
${lines.join("\n")}
Quando o lead bater num gatilho, chame detectar_objecao com esse tipo. Nunca invente um tipo fora desta lista.`.trim();
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
      "Chame quando identificar uma objeção clara do lead (ex.: preço como barreira, medo/receio, distância, plano/convênio). Informe o TIPO da objeção (conforme configurado para este negócio, ex.: financeira, medo, sem_convenio) e a frase do lead que evidenciou. O sistema pode enviar um vídeo de um cliente real que superou a mesma objeção — NÃO cole links do vídeo na resposta.",
    parameters: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          description:
            "Slug do tipo de objeção (ex.: financeira, medo, distancia, sem_convenio)",
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
