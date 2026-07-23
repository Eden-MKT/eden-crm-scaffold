import { supabase } from "@/integrations/supabase/client";

export interface ImprovedPrompt {
  prompt: string;
  /** Dados do original que não sobreviveram à melhoria (idealmente vazio). */
  missing: string[];
  /** true quando o resultado ficou bem menor que o original (regras resumidas). */
  shrunk: boolean;
}

// Chama a edge function improve-prompt (staff) e retorna o prompt melhorado.
// `current` é o texto que está no editor — enviado para não perder edições
// ainda não salvas (a edge cai no prompt do banco se vier vazio).
export async function improvePrompt(agentId: string, current?: string): Promise<ImprovedPrompt> {
  const { data, error } = await supabase.functions.invoke("improve-prompt", {
    body: { agentId, prompt: current ?? "" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return {
    prompt: String(data?.prompt ?? "").trim(),
    missing: Array.isArray(data?.missing) ? data.missing.map(String) : [],
    shrunk: Boolean(data?.shrunk),
  };
}
