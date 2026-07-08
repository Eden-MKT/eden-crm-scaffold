import type { Database } from "@/integrations/supabase/types";

type AgentRow = Database["public"]["Tables"]["whatsapp_agents"]["Row"];
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
