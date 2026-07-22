import { supabase } from "@/integrations/supabase/client";

import type { MarkeiMetrics, Period } from "./types";
import type { LeadFilters } from "./leads";

export const markeiKeys = {
  all: ["markei"] as const,
  metrics: (period: Period = "all", agentId?: string) =>
    [...markeiKeys.all, "metrics", period, agentId ?? "all"] as const,
  leads: (filters: LeadFilters) => [...markeiKeys.all, "leads", filters] as const,
  leadHasAppointment: (conversationId: string) =>
    [...markeiKeys.all, "lead-appointment", conversationId] as const,
  autoFollowups: () => [...markeiKeys.all, "auto-followups"] as const,
  manualFollowups: () => [...markeiKeys.all, "manual-followups"] as const,
};

// Métricas agregadas de todos os clientes — guard (is_staff/is_markei) vive no SQL.
export async function fetchMarkeiMetrics(
  period: Period = "all",
  agentId?: string,
): Promise<MarkeiMetrics> {
  const { data, error } = await supabase.rpc("markei_metrics", {
    p_period: period,
    ...(agentId ? { p_agent_id: agentId } : {}),
  });
  if (error) throw error;
  return data as unknown as MarkeiMetrics;
}
