import type { Database } from "@/integrations/supabase/types";

// As colunas monday_* ficam de fora do que o front lê: monday_token é segredo
// do cliente e só as Edge Functions (service role) devem enxergá-lo. Manter o
// Omit aqui faz o type-check acusar se alguém voltar a selecioná-las no painel.
type AgentRow = Omit<
  Database["public"]["Tables"]["whatsapp_agents"]["Row"],
  "monday_enabled" | "monday_board_id" | "monday_group_map" | "monday_token"
>;
type ConversationRow = Database["public"]["Tables"]["whatsapp_conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

export type AgentStatus = "disconnected" | "connecting" | "connected";
export type MessageDirection = "in" | "out";
export type MessageSender = "contact" | "ai" | "human";
export type MessageType = "text" | "image" | "audio" | "video" | "document" | "sticker" | "other";

// Campo livre extra de dados do cliente (rótulo + valor) — armazenado em extra_fields (JSONB).
export interface AgentExtraField {
  label: string;
  value: string;
}

// Config de agenda (clientes médicos): tipos de atendimento + horários de trabalho.
export interface AgentService {
  label: string;
  durationMin: number;
}
export interface AgendaDay {
  open: boolean;
  start: string; // "HH:MM"
  end: string;
}
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface AgendaHours {
  mon: AgendaDay;
  tue: AgendaDay;
  wed: AgendaDay;
  thu: AgendaDay;
  fri: AgendaDay;
  sat: AgendaDay;
  sun: AgendaDay;
  lunch: { enabled: boolean; start: string; end: string };
}

export const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

export const DEFAULT_AGENDA_HOURS: AgendaHours = {
  mon: { open: true, start: "08:00", end: "18:00" },
  tue: { open: true, start: "08:00", end: "18:00" },
  wed: { open: true, start: "08:00", end: "18:00" },
  thu: { open: true, start: "08:00", end: "18:00" },
  fri: { open: true, start: "08:00", end: "18:00" },
  sat: { open: false, start: "08:00", end: "12:00" },
  sun: { open: false, start: "08:00", end: "12:00" },
  lunch: { enabled: true, start: "12:00", end: "13:00" },
};

// ---- Capacidades do agente único — configs por agente ----

// "Serviços e valores" (aba Básico) — fonte de verdade de oferta/preço da IA.
export interface KnowledgeItem {
  nome: string;
  descricao: string;
  valor: string;
}

// Objeções que a IA reconhece + vídeo opcional (aba Objeções).
// Nomes de campo espelham o backend (_shared/objection.ts): tipo, video_url, gatilhos.
export interface ObjectionConfigItem {
  tipo: string; // slug único, minúsculo, sem espaço (ex.: "financeira")
  rotulo: string; // nome amigável (ex.: "Preço / investimento")
  gatilhos: string[]; // palavras-dica (ex.: ["caro", "não posso pagar"])
  video_url: string; // URL do vídeo (vazio = só responde por texto)
  abordagem: string; // como a IA responde
}

// Handoff: telefone(s) do atendente humano notificado quando a IA transfere.
export interface HandoffConfig {
  telefones: string[];
}

export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = { telefones: [] };

export interface FollowupStageConfig {
  aposMinutos: number;
  tom: string;
}

export interface FollowupConfig {
  enabled: boolean;
  /** Confirmação de consulta na véspera (~9h) — só faz efeito com agenda ativa. */
  confirmEnabled: boolean;
  estagios: FollowupStageConfig[];
}

// Cadência padrão: 12h → 24h → 48h (a IA avalia a conversa antes de insistir).
export const DEFAULT_FOLLOWUP_CONFIG: FollowupConfig = {
  enabled: false,
  confirmEnabled: true,
  estagios: [
    { aposMinutos: 720, tom: "leve — presuma que a pessoa se distraiu" },
    { aposMinutos: 1440, tom: "respeitoso — retomada educada" },
    { aposMinutos: 2880, tom: "último contato — gentil, deixe a porta aberta" },
  ],
};

export type LeadTemperature = "hot" | "warm" | "cold";
export type LeadStatus = "em_atendimento" | "qualificado" | "desqualificado";

// Ficha de paciente (tabela patients) — criada/atualizada pela IA.
export interface Patient {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappAgent {
  id: string;
  clientId: string;
  instanceName: string | null;
  status: AgentStatus;
  phoneNumber: string | null;
  systemPrompt: string;
  niche: string;
  businessInfo: string;
  conversionGoal: string;
  model: string;
  temperature: number;
  aiEnabled: boolean;
  greeting: string;
  responsibleName: string;
  responsiblePhone: string;
  businessAddress: string;
  profession: string;
  registrationNumber: string;
  extraFields: AgentExtraField[];
  responseDelaySeconds: number;
  isMedical: boolean;
  agendaEnabled: boolean;
  agendaTimezone: string;
  agendaHours: AgendaHours;
  agendaServices: AgentService[];
  promptInjectionEnabled: boolean;
  knowledgeItems: KnowledgeItem[];
  objectionConfig: ObjectionConfigItem[];
  handoffConfig: HandoffConfig;
  followupConfig: FollowupConfig;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappConversation {
  id: string;
  agentId: string;
  remoteJid: string;
  contactName: string | null;
  profilePicUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  aiPaused: boolean;
  converted: boolean;
  convertedAt: string | null;
  unreadCount: number;
  patientId: string | null;
  leadInterest: string | null;
  contextSummary: string | null;
  leadTemperature: LeadTemperature | null;
  conversionProbability: number | null;
  analysisSummary: string | null;
  leadStatus: LeadStatus;
  analyzedAt: string | null;
  followupStage: number;
  lastFollowupAt: string | null;
  followupExhausted: boolean;
  humanTakeover: boolean;
  createdAt: string;
}

export interface WhatsappMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  sender: MessageSender;
  messageType: MessageType;
  content: string | null;
  mediaPath: string | null;
  mediaMime: string | null;
  evolutionId: string | null;
  sentAt: string;
  createdAt: string;
}

// Normaliza o JSONB extra_fields (pode vir null/valor inesperado) em AgentExtraField[].
function parseExtraFields(raw: unknown): AgentExtraField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => ({ label: String(f.label ?? ""), value: String(f.value ?? "") }));
}

function parseServices(raw: unknown): AgentService[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({ label: String(s.label ?? ""), durationMin: Number(s.durationMin ?? 60) || 60 }))
    .filter((s) => s.label);
}

function parseHours(raw: unknown): AgendaHours {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...DEFAULT_AGENDA_HOURS, ...(raw as Partial<AgendaHours>) } as AgendaHours;
  }
  return DEFAULT_AGENDA_HOURS;
}

// Parsers tolerantes dos jsonb de config (jsonb {} → defaults completos).
function parseJsonObject<T extends object>(raw: unknown, defaults: T): T {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...defaults, ...(raw as Partial<T>) };
  }
  return defaults;
}

function parseKnowledgeItems(raw: unknown): KnowledgeItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      nome: String(i.nome ?? ""),
      descricao: String(i.descricao ?? ""),
      valor: String(i.valor ?? ""),
    }));
}

function parseObjectionConfig(raw: unknown): ObjectionConfigItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      tipo: String(i.tipo ?? ""),
      rotulo: String(i.rotulo ?? ""),
      gatilhos: Array.isArray(i.gatilhos) ? i.gatilhos.map((g) => String(g)) : [],
      video_url: String(i.video_url ?? ""),
      abordagem: String(i.abordagem ?? ""),
    }));
}

function parseHandoffConfig(raw: unknown): HandoffConfig {
  const base = parseJsonObject(raw, DEFAULT_HANDOFF_CONFIG);
  return {
    telefones: Array.isArray(base.telefones) ? base.telefones.map(String).filter(Boolean) : [],
  };
}

function parseFollowupConfig(raw: unknown): FollowupConfig {
  const base = parseJsonObject(raw, DEFAULT_FOLLOWUP_CONFIG);
  const estagios = Array.isArray(base.estagios) ? base.estagios : [];
  return {
    enabled: base.enabled === true,
    confirmEnabled: base.confirmEnabled !== false,
    estagios: DEFAULT_FOLLOWUP_CONFIG.estagios.map((d, i) => ({
      aposMinutos:
        Number(estagios[i]?.aposMinutos) > 0 ? Number(estagios[i]?.aposMinutos) : d.aposMinutos,
      tom: String(estagios[i]?.tom ?? "").trim() || d.tom,
    })),
  };
}

export function mapAgent(row: AgentRow): WhatsappAgent {
  return {
    id: row.id,
    clientId: row.client_id,
    instanceName: row.instance_name,
    status: row.status as AgentStatus,
    phoneNumber: row.phone_number,
    systemPrompt: row.system_prompt ?? "",
    niche: row.niche ?? "",
    businessInfo: row.business_info ?? "",
    conversionGoal: row.conversion_goal ?? "",
    model: row.model,
    temperature: Number(row.temperature ?? 0.7),
    aiEnabled: row.ai_enabled,
    greeting: row.greeting ?? "",
    responsibleName: row.responsible_name ?? "",
    responsiblePhone: row.responsible_phone ?? "",
    businessAddress: row.business_address ?? "",
    profession: row.profession ?? "",
    registrationNumber: row.registration_number ?? "",
    extraFields: parseExtraFields(row.extra_fields),
    responseDelaySeconds: Number(row.response_delay_seconds ?? 15),
    isMedical: row.is_medical ?? false,
    agendaEnabled: row.agenda_enabled ?? false,
    agendaTimezone: row.agenda_timezone ?? "America/Sao_Paulo",
    agendaHours: parseHours(row.agenda_hours),
    agendaServices: parseServices(row.agenda_services),
    promptInjectionEnabled: row.prompt_injection_enabled ?? true,
    knowledgeItems: parseKnowledgeItems(row.knowledge_items),
    objectionConfig: parseObjectionConfig(row.objection_config),
    handoffConfig: parseHandoffConfig(row.handoff_config),
    followupConfig: parseFollowupConfig(row.followup_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConversation(row: ConversationRow): WhatsappConversation {
  return {
    id: row.id,
    agentId: row.agent_id,
    remoteJid: row.remote_jid,
    contactName: row.contact_name,
    profilePicUrl: row.profile_pic_url,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    aiPaused: row.ai_paused,
    converted: row.converted,
    convertedAt: row.converted_at,
    unreadCount: row.unread_count,
    patientId: row.patient_id ?? null,
    leadInterest: row.lead_interest ?? null,
    contextSummary: row.context_summary ?? null,
    leadTemperature: (row.lead_temperature as LeadTemperature | null) ?? null,
    conversionProbability: row.conversion_probability ?? null,
    analysisSummary: row.analysis_summary ?? null,
    leadStatus: (row.lead_status as LeadStatus) ?? "em_atendimento",
    analyzedAt: row.analyzed_at ?? null,
    followupStage: row.followup_stage ?? 0,
    lastFollowupAt: row.last_followup_at ?? null,
    followupExhausted: row.followup_exhausted ?? false,
    humanTakeover: row.human_takeover ?? false,
    createdAt: row.created_at,
  };
}

export function mapMessage(row: MessageRow): WhatsappMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction as MessageDirection,
    sender: row.sender as MessageSender,
    messageType: row.message_type as MessageType,
    content: row.content,
    mediaPath: row.media_path,
    mediaMime: row.media_mime,
    evolutionId: row.evolution_id,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

/** Nome de exibição do contato (nome ou número). */
export function contactLabel(c: WhatsappConversation): string {
  if (c.contactName) return c.contactName;
  return c.remoteJid.split("@")[0];
}
