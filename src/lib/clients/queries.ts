import { supabase } from "@/integrations/supabase/client";

import type { BillingType } from "./billing-types";
import type { PaymentMethod } from "./payment-methods";
import type { Stage } from "./stages";
import { mapClient, type Client } from "./types";

export const clientsKeys = {
  all: ["clients"] as const,
  list: () => [...clientsKeys.all, "list"] as const,
  detail: (id: string) => [...clientsKeys.all, "detail", id] as const,
};

const CLIENT_COLUMNS =
  "id, name, company, email, phone, stage, payment_method, contract_value, billing_type, installments, created_at, updated_at";

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapClient);
}

export interface CreateClientInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  stage: Stage;
  paymentMethod?: PaymentMethod | null;
  contractValue: number;
  billingType: BillingType;
  installments?: number | null;
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      company: input.company || null,
      email: input.email || null,
      phone: input.phone || null,
      stage: input.stage,
      payment_method: input.paymentMethod ?? null,
      contract_value: input.contractValue,
      billing_type: input.billingType,
      installments: input.billingType === "parcelado" ? input.installments : null,
    })
    .select(CLIENT_COLUMNS)
    .single();

  if (error) throw error;
  return mapClient(data);
}

export async function updateClientStage(id: string, stage: Stage): Promise<void> {
  const { error } = await supabase.from("clients").update({ stage }).eq("id", id);
  if (error) throw error;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}
