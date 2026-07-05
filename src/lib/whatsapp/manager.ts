import { supabase } from "@/integrations/supabase/client";

// Wrapper para a edge function evolution-manager (ações no painel).
async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("evolution-manager", {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const evolutionManager = {
  createInstance: (agentId: string) =>
    invoke<{ ok: boolean; instanceName: string }>("create_instance", { agentId }),
  qr: (agentId: string) =>
    invoke<{ base64: string | null; code: string | null }>("qr", { agentId }),
  status: (agentId: string) => invoke<{ status: string }>("status", { agentId }),
  logout: (agentId: string) => invoke<{ ok: boolean }>("logout", { agentId }),
  deleteInstance: (agentId: string) => invoke<{ ok: boolean }>("delete_instance", { agentId }),
  sendManual: (conversationId: string, text: string) =>
    invoke<{ ok: boolean }>("send_manual", { conversationId, text }),
  generateConnectToken: (agentId: string) =>
    invoke<{ token: string }>("generate_connect_token", { agentId }),
};
