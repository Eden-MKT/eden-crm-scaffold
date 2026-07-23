// Wrapper para a Edge Function dispatch-admin (Fase 4). O front NUNCA envia
// mensagens nem muda status de campanha direto na tabela — tudo passa por aqui
// (service role + validações de compliance no servidor).
import { supabase } from "@/integrations/supabase/client";

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("dispatch-admin", {
    body: { action, ...body },
  });
  if (error) {
    // A function devolve {error} no corpo com status !=2xx; o supabase-js embrulha
    // isso em FunctionsHttpError. Tenta extrair a mensagem legível do corpo.
    // deno-lint-ignore no-explicit-any
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) throw new Error(parsed.error);
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface DryRunResult {
  total: number;
  elegiveis: number;
  suprimidos: { suppression: number; sem_opt_in: number; cooldown: number };
  fora_janela_agora: number;
  previsao_dias: number;
  amostra: {
    telefone: string;
    nome: string | null;
    empresa: string | null;
    mensagem: string;
  }[];
}

export const dispatchAdmin = {
  syncTemplates: (waAccountId: string) =>
    invoke<{ ok: boolean; sincronizados: number }>("sync_templates", {
      wa_account_id: waAccountId,
    }),
  dryRun: (campaignId: string) => invoke<DryRunResult>("dry_run", { campaign_id: campaignId }),
  launchCampaign: (campaignId: string, confirmName: string) =>
    invoke<{ ok: boolean; status: string }>("launch_campaign", {
      campaign_id: campaignId,
      confirm_name: confirmName,
    }),
  pauseCampaign: (campaignId: string) =>
    invoke<{ ok: boolean; status: string }>("pause_campaign", { campaign_id: campaignId }),
  resumeCampaign: (campaignId: string) =>
    invoke<{ ok: boolean; status: string }>("resume_campaign", { campaign_id: campaignId }),
  panic: () =>
    invoke<{ ok: boolean; campanhas_pausadas: number; contas_pausadas: number }>("panic", {}),
  resumeAccount: (waAccountId: string) =>
    invoke<{ ok: boolean; status: string }>("resume_account", { wa_account_id: waAccountId }),
};
