import { supabase } from "@/integrations/supabase/client";

// Wrapper (lado STAFF) para a edge function portal-manager.
async function invoke<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-manager", {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface PortalStatus {
  exists: boolean;
  email?: string | null;
}
export interface PortalCredentials {
  ok?: boolean;
  exists?: boolean;
  email: string;
  password?: string;
  message?: string;
}

export const portalManager = {
  status: (clientId: string) => invoke<PortalStatus>("status", { clientId }),
  create: (clientId: string, email: string) =>
    invoke<PortalCredentials>("create_portal", { clientId, email }),
  resetPassword: (clientId: string) => invoke<PortalCredentials>("reset_password", { clientId }),
};
