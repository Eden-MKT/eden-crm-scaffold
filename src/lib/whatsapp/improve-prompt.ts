import { supabase } from "@/integrations/supabase/client";

// Chama a edge function improve-prompt (staff) e retorna o prompt melhorado.
export async function improvePrompt(agentId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("improve-prompt", {
    body: { agentId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return String(data?.prompt ?? "").trim();
}
