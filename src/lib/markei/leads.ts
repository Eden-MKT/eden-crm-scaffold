// Consultas da tela "Pacientes e Leads" e dos follow-ups automáticos.
// O nome do médico (IA) não vem por embed — o papel markei não lê `clients`
// direto; o mapeamento agentId → nome é feito client-side com o porAgente do
// RPC markei_metrics.

import { supabase } from "@/integrations/supabase/client";
import { mapConversation, type WhatsappConversation } from "@/lib/whatsapp/types";

import type { LeadDerivedStatus, Period } from "./types";

export type LeadSort = "recent" | "oldest" | "name";

export interface LeadFilters {
  search?: string;
  agentId?: string;
  status?: LeadDerivedStatus | "all";
  period?: Period;
  sort?: LeadSort;
  page?: number; // 1-based
}

export const LEADS_PAGE_SIZE = 25;

function periodStart(period: Period | undefined): string | null {
  if (!period || period === "all") return null;
  if (period === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = period === "week" ? 7 : period === "month" ? 30 : 365;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function buildLeadsQuery(f: LeadFilters, withCount: boolean) {
  let q = withCount
    ? supabase.from("whatsapp_conversations").select("*", { count: "exact" })
    : supabase.from("whatsapp_conversations").select("*");

  if (f.agentId) q = q.eq("agent_id", f.agentId);

  const start = periodStart(f.period);
  if (start) q = q.gte("last_message_at", start);

  const s = (f.search ?? "").trim().replace(/[,()%]/g, "");
  if (s) q = q.or(`contact_name.ilike.%${s}%,remote_jid.ilike.%${s}%`);

  switch (f.status) {
    case "convertido":
      q = q.eq("converted", true);
      break;
    case "respondeu":
      q = q.eq("lead_status", "qualificado").eq("converted", false);
      break;
    case "em_atendimento":
      q = q
        .eq("lead_status", "em_atendimento")
        .not("analyzed_at", "is", null)
        .eq("converted", false);
      break;
    case "novo":
      q = q.eq("lead_status", "em_atendimento").is("analyzed_at", null).eq("converted", false);
      break;
  }

  switch (f.sort) {
    case "oldest":
      q = q.order("last_message_at", { ascending: true, nullsFirst: true });
      break;
    case "name":
      q = q.order("contact_name", { ascending: true, nullsFirst: false });
      break;
    default:
      q = q.order("last_message_at", { ascending: false, nullsFirst: false });
  }
  return q;
}

export async function fetchMarkeiLeads(
  filters: LeadFilters,
): Promise<{ rows: WhatsappConversation[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * LEADS_PAGE_SIZE;

  const q = buildLeadsQuery(filters, true);
  const { data, error, count } = await q.range(from, from + LEADS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []).map(mapConversation), total: count ?? 0 };
}

/** Mesmos filtros da lista, sem paginação (cap de 2000 linhas) — para o CSV. */
export async function fetchLeadsForCsv(filters: LeadFilters): Promise<WhatsappConversation[]> {
  const { data, error } = await buildLeadsQuery(filters, false).limit(2000);
  if (error) throw error;
  return (data ?? []).map(mapConversation);
}

/** RLS permite ao papel markei editar contact_name. */
export async function updateLeadName(conversationId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ contact_name: name })
    .eq("id", conversationId);
  if (error) throw error;
}

/** true se o lead tem avaliação agendada (etapa 4 da jornada). */
export async function fetchConversationHasAppointment(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "scheduled")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Leads na cadência de follow-up automático (não convertidos/esgotados/assumidos). */
export async function fetchAutoFollowups(): Promise<WhatsappConversation[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("converted", false)
    .eq("followup_exhausted", false)
    .eq("human_takeover", false)
    .order("last_message_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(mapConversation);
}
