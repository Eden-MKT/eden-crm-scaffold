import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Client } from "@/lib/clients/types";
import { mapClient } from "@/lib/clients/types";

type AgentUpdate = Database["public"]["Tables"]["whatsapp_agents"]["Update"];

import {
  mapAgent,
  mapConversation,
  mapMessage,
  type AgentExtraField,
  type AgentService,
  type AgendaHours,
  type FollowupConfig,
  type HandoffConfig,
  type KnowledgeItem,
  type ObjectionConfigItem,
  type WhatsappAgent,
  type WhatsappConversation,
  type WhatsappMessage,
} from "./types";

export const whatsappKeys = {
  all: ["whatsapp"] as const,
  agents: () => [...whatsappKeys.all, "agents"] as const,
  agentByClient: (clientId: string) => [...whatsappKeys.all, "agent", clientId] as const,
  conversations: (agentId: string) => [...whatsappKeys.all, "conversations", agentId] as const,
  messages: (conversationId: string) => [...whatsappKeys.all, "messages", conversationId] as const,
  stats: () => [...whatsappKeys.all, "stats"] as const,
};

export interface AgentWithClient {
  agent: WhatsappAgent | null;
  client: Client;
}

// NÃO inclua as colunas monday_* aqui. monday_token é um segredo do cliente e
// só deve ser lido pelas Edge Functions (service role) — listar aqui o entrega
// ao navegador de qualquer usuário do painel. Quando houver UI de configuração
// do Monday, busque a config por um caminho que não exponha o token.
const AGENT_COLS =
  "id, client_id, instance_name, status, phone_number, system_prompt, niche, business_info, conversion_goal, model, temperature, ai_enabled, greeting, responsible_name, responsible_phone, business_address, profession, registration_number, extra_fields, response_delay_seconds, is_medical, agenda_enabled, agenda_timezone, agenda_hours, agenda_services, prompt_injection_enabled, knowledge_items, objection_config, handoff_config, followup_config, created_at, updated_at";

// Lista todos os clientes com o agente (se existir) — a base dos cards.
export async function fetchAgentsWithClients(): Promise<AgentWithClient[]> {
  const [clientsRes, agentsRes] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, company, email, phone, stage, payment_method, contract_value, billing_type, installments, created_at, updated_at",
      )
      .order("name", { ascending: true }),
    supabase.from("whatsapp_agents").select(AGENT_COLS),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (agentsRes.error) throw agentsRes.error;

  const agentByClient = new Map((agentsRes.data ?? []).map((a) => [a.client_id, mapAgent(a)]));
  return (clientsRes.data ?? []).map((c) => ({
    client: mapClient(c),
    agent: agentByClient.get(c.id) ?? null,
  }));
}

// Cria (ou retorna) o agente de um cliente.
export async function ensureAgent(clientId: string): Promise<WhatsappAgent> {
  const existing = await supabase
    .from("whatsapp_agents")
    .select(AGENT_COLS)
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return mapAgent(existing.data);

  const { data, error } = await supabase
    .from("whatsapp_agents")
    .insert({ client_id: clientId })
    .select(AGENT_COLS)
    .single();
  if (error) throw error;
  return mapAgent(data);
}

export interface UpdateAgentInput {
  systemPrompt?: string;
  niche?: string;
  businessInfo?: string;
  conversionGoal?: string;
  model?: string;
  temperature?: number;
  aiEnabled?: boolean;
  greeting?: string;
  responsibleName?: string;
  responsiblePhone?: string;
  businessAddress?: string;
  profession?: string;
  registrationNumber?: string;
  extraFields?: AgentExtraField[];
  responseDelaySeconds?: number;
  isMedical?: boolean;
  agendaEnabled?: boolean;
  agendaTimezone?: string;
  agendaHours?: AgendaHours;
  agendaServices?: AgentService[];
  promptInjectionEnabled?: boolean;
  knowledgeItems?: KnowledgeItem[];
  objectionConfig?: ObjectionConfigItem[];
  handoffConfig?: HandoffConfig;
  followupConfig?: FollowupConfig;
}

export async function updateAgent(id: string, patch: UpdateAgentInput): Promise<void> {
  const row: AgentUpdate = {};
  if (patch.systemPrompt !== undefined) row.system_prompt = patch.systemPrompt;
  if (patch.niche !== undefined) row.niche = patch.niche;
  if (patch.businessInfo !== undefined) row.business_info = patch.businessInfo;
  if (patch.conversionGoal !== undefined) row.conversion_goal = patch.conversionGoal;
  if (patch.model !== undefined) row.model = patch.model;
  if (patch.temperature !== undefined) row.temperature = patch.temperature;
  if (patch.aiEnabled !== undefined) row.ai_enabled = patch.aiEnabled;
  if (patch.greeting !== undefined) row.greeting = patch.greeting;
  if (patch.responsibleName !== undefined) row.responsible_name = patch.responsibleName;
  if (patch.responsiblePhone !== undefined) row.responsible_phone = patch.responsiblePhone;
  if (patch.businessAddress !== undefined) row.business_address = patch.businessAddress;
  if (patch.profession !== undefined) row.profession = patch.profession;
  if (patch.registrationNumber !== undefined) row.registration_number = patch.registrationNumber;
  if (patch.extraFields !== undefined)
    row.extra_fields = patch.extraFields as unknown as AgentUpdate["extra_fields"];
  if (patch.responseDelaySeconds !== undefined)
    row.response_delay_seconds = patch.responseDelaySeconds;
  if (patch.isMedical !== undefined) row.is_medical = patch.isMedical;
  if (patch.agendaEnabled !== undefined) row.agenda_enabled = patch.agendaEnabled;
  if (patch.agendaTimezone !== undefined) row.agenda_timezone = patch.agendaTimezone;
  if (patch.agendaHours !== undefined)
    row.agenda_hours = patch.agendaHours as unknown as AgentUpdate["agenda_hours"];
  if (patch.agendaServices !== undefined)
    row.agenda_services = patch.agendaServices as unknown as AgentUpdate["agenda_services"];
  if (patch.promptInjectionEnabled !== undefined)
    row.prompt_injection_enabled = patch.promptInjectionEnabled;
  if (patch.knowledgeItems !== undefined)
    row.knowledge_items = patch.knowledgeItems as unknown as AgentUpdate["knowledge_items"];
  if (patch.objectionConfig !== undefined)
    row.objection_config = patch.objectionConfig as unknown as AgentUpdate["objection_config"];
  if (patch.handoffConfig !== undefined)
    row.handoff_config = patch.handoffConfig as unknown as AgentUpdate["handoff_config"];
  if (patch.followupConfig !== undefined)
    row.followup_config = patch.followupConfig as unknown as AgentUpdate["followup_config"];
  const { error } = await supabase.from("whatsapp_agents").update(row).eq("id", id);
  if (error) throw error;
}

export async function fetchConversations(agentId: string): Promise<WhatsappConversation[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("agent_id", agentId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map(mapConversation);
}

export async function fetchMessages(conversationId: string): Promise<WhatsappMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export async function setConversationPaused(
  conversationId: string,
  paused: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ ai_paused: paused })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function clearUnread(conversationId: string): Promise<void> {
  await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);
}

// ---- Handoff / análise / follow-ups (compartilhado entre painéis) ----

export async function setHumanTakeover(conversationId: string, on: boolean): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({
      human_takeover: on,
      human_takeover_at: on ? new Date().toISOString() : null,
      ai_paused: on,
    })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function setAgentAiEnabled(agentId: string, on: boolean): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_agents")
    .update({ ai_enabled: on })
    .eq("id", agentId);
  if (error) throw error;
}

export interface LeadAnalysis {
  lead_temperature: "hot" | "warm" | "cold";
  conversion_probability: number;
  analysis_summary: string;
  lead_interest: string | null;
  lead_status: string;
}

export async function analyzeConversation(conversationId: string): Promise<LeadAnalysis> {
  const { data, error } = await supabase.functions.invoke("analyze-conversation", {
    body: { conversationId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as LeadAnalysis;
}

export interface ManualFollowUp {
  id: string;
  conversationId: string;
  agentId: string;
  message: string;
  scheduledAt: string;
  status: "pending" | "sending" | "sent" | "cancelled" | "failed";
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  leadName: string | null;
  leadPhone: string;
}

const FOLLOWUP_COLS =
  "id, conversation_id, agent_id, message, scheduled_at, status, sent_at, error, created_at, whatsapp_conversations(contact_name, remote_jid)";

function mapFollowUp(row: Record<string, unknown>): ManualFollowUp {
  const conv = (row.whatsapp_conversations ?? {}) as {
    contact_name?: string | null;
    remote_jid?: string;
  };
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    agentId: String(row.agent_id),
    message: String(row.message ?? ""),
    scheduledAt: String(row.scheduled_at),
    status: row.status as ManualFollowUp["status"],
    sentAt: (row.sent_at as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
    leadName: conv.contact_name ?? null,
    leadPhone: String(conv.remote_jid ?? "").split("@")[0],
  };
}

export async function fetchManualFollowUps(status?: string): Promise<ManualFollowUp[]> {
  let q = supabase.from("follow_ups").select(FOLLOWUP_COLS).order("scheduled_at", {
    ascending: true,
  });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapFollowUp(r as Record<string, unknown>));
}

export async function createManualFollowUp(input: {
  conversationId: string;
  agentId: string;
  message: string;
  scheduledAt: string;
}): Promise<void> {
  const { error } = await supabase.from("follow_ups").insert({
    conversation_id: input.conversationId,
    agent_id: input.agentId,
    message: input.message,
    scheduled_at: input.scheduledAt,
  });
  if (error) throw error;
}

export async function setManualFollowUpStatus(
  id: string,
  status: "sent" | "cancelled",
): Promise<void> {
  const { error } = await supabase
    .from("follow_ups")
    .update({ status, ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  if (error) throw error;
}

// ---- Métricas do dashboard ----
export interface WhatsappStats {
  attendancesToday: number;
  messagesToday: number;
  costMonth: number;
  conversionRate: number;
  connectedAgents: number;
}

export async function fetchWhatsappStats(): Promise<WhatsappStats> {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startMonth = new Date();
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);

  const [msgsToday, usageMonth, conversations, agents] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("conversation_id, direction, sent_at")
      .gte("sent_at", startToday.toISOString()),
    supabase.from("whatsapp_usage").select("cost_usd").gte("created_at", startMonth.toISOString()),
    supabase.from("whatsapp_conversations").select("converted"),
    supabase.from("whatsapp_agents").select("status"),
  ]);

  const msgs = msgsToday.data ?? [];
  const attendances = new Set(
    msgs.filter((m) => m.direction === "in").map((m) => m.conversation_id),
  ).size;
  const costMonth = (usageMonth.data ?? []).reduce((s, u) => s + Number(u.cost_usd ?? 0), 0);
  const convs = conversations.data ?? [];
  const converted = convs.filter((c) => c.converted).length;
  const conversionRate = convs.length ? (converted / convs.length) * 100 : 0;
  const connectedAgents = (agents.data ?? []).filter((a) => a.status === "connected").length;

  return {
    attendancesToday: attendances,
    messagesToday: msgs.length,
    costMonth,
    conversionRate,
    connectedAgents,
  };
}
