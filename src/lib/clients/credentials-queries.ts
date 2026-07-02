import { supabase } from "@/integrations/supabase/client";

export interface ClientCredentials {
  clientId: string;
  instagramLogin: string;
  instagramPassword: string;
  notes: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface UpsertClientCredentialsInput {
  instagramLogin?: string;
  instagramPassword?: string;
  notes?: string;
  updatedBy?: string | null;
}

export const credentialsKeys = {
  all: ["client-credentials"] as const,
  byClient: (clientId: string) => [...credentialsKeys.all, clientId] as const,
};

const COLUMNS =
  "client_id, instagram_login, instagram_password, notes, updated_at, updated_by";

function mapCredentials(row: {
  client_id: string;
  instagram_login: string | null;
  instagram_password: string | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}): ClientCredentials {
  return {
    clientId: row.client_id,
    instagramLogin: row.instagram_login ?? "",
    instagramPassword: row.instagram_password ?? "",
    notes: row.notes ?? "",
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function fetchClientCredentials(
  clientId: string,
): Promise<ClientCredentials | null> {
  const { data, error } = await supabase
    .from("client_credentials")
    .select(COLUMNS)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCredentials(data) : null;
}

export async function upsertClientCredentials(
  clientId: string,
  input: UpsertClientCredentialsInput,
): Promise<ClientCredentials> {
  const { data, error } = await supabase
    .from("client_credentials")
    .upsert(
      {
        client_id: clientId,
        instagram_login: input.instagramLogin ?? "",
        instagram_password: input.instagramPassword ?? "",
        notes: input.notes ?? "",
        updated_by: input.updatedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    )
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return mapCredentials(data);
}
