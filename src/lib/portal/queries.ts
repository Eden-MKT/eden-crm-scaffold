import { supabase } from "@/integrations/supabase/client";
import type { PortalData } from "./types";

export const portalKeys = {
  metrics: () => ["portal", "metrics"] as const,
};

// Métricas do cliente logado (escopadas no servidor pela edge function).
export async function fetchPortalMetrics(): Promise<PortalData> {
  const { data, error } = await supabase.functions.invoke("portal-metrics", {
    body: {},
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as PortalData;
}
