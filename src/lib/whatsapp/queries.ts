import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Client } from "@/lib/clients/types";
import { mapClient } from "@/lib/clients/types";

type AgentUpdate = Database["public"]["Tables"]["whatsapp_agents"]["Update"];

import {
  mapAgent,
  mapConversation,
  mapMessage,
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

const AGENT_COLS =
  "id, client_id, instance_name, status, phone_number, system_prompt, niche, business_info, conversion_goal, model, temperature, ai_enabled, greeting, created_at, updated_at";

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
