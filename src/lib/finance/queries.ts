import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Client } from "@/lib/clients/types";

import {
  mapFinanceEntry,
  type FinanceCategory,
  type FinanceEntry,
  type FinanceStatus,
} from "./types";

type FinanceInsert = Database["public"]["Tables"]["finance_entries"]["Insert"];

export const financeKeys = {
  all: ["finance"] as const,
  list: () => [...financeKeys.all, "list"] as const,
  clientExpenses: (clientId: string) => [...financeKeys.all, "client-expenses", clientId] as const,
};

const COLUMNS = "*";

export async function fetchFinanceEntries(): Promise<FinanceEntry[]> {
  const { data, error } = await supabase
    .from("finance_entries")
    .select(COLUMNS)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapFinanceEntry);
}

export async function fetchCompanyExpenses(): Promise<FinanceEntry[]> {
  const { data, error } = await supabase
    .from("finance_entries")
    .select(COLUMNS)
    .eq("kind", "expense")
    .eq("category", "empresa")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapFinanceEntry);
}

export async function fetchClientExpenses(clientId: string): Promise<FinanceEntry[]> {
  const { data, error } = await supabase
    .from("finance_entries")
    .select(COLUMNS)
    .eq("client_id", clientId)
    .eq("category", "projeto_cliente")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapFinanceEntry);
}

// --- Helpers de data ---------------------------------------------------------
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Gera os lançamentos de receita no Financeiro a partir do plano de pagamento
 * do cliente recém-criado. Chamado logo após createClient().
 */
export async function createRevenueForClient(client: Client): Promise<void> {
  const total = client.contractValue;
  if (!total || total <= 0) return;

  const today = new Date();
  const base = {
    kind: "income" as const,
    client_id: client.id,
    category: "contrato" as const,
    billing_type: client.billingType,
    status: "pendente" as const,
  };

  let rows: FinanceInsert[] = [];

  if (client.billingType === "avista") {
    rows = [
      {
        ...base,
        description: `Contrato (à vista) — ${client.name}`,
        amount: round2(total),
        due_date: toISODate(today),
        installment_no: 1,
        installment_total: 1,
      },
    ];
  } else if (client.billingType === "parcelado") {
    const n = Math.max(1, client.installments ?? 1);
    const each = round2(total / n);
    rows = Array.from({ length: n }, (_, i) => ({
      ...base,
      description: `Contrato (parcela ${i + 1}/${n}) — ${client.name}`,
      // ajusta a última parcela para fechar o total exatamente
      amount: i === n - 1 ? round2(total - each * (n - 1)) : each,
      due_date: toISODate(addMonths(today, i)),
      installment_no: i + 1,
      installment_total: n,
    }));
  } else {
    // recorrente — um lançamento mensal recorrente (MRR)
    rows = [
      {
        ...base,
        description: `Mensalidade recorrente — ${client.name}`,
        amount: round2(total),
        due_date: toISODate(today),
        is_recurring: true,
      },
    ];
  }

  const { error } = await supabase.from("finance_entries").insert(rows);
  if (error) throw error;
}

// --- CRUD de despesas --------------------------------------------------------
export interface CreateExpenseInput {
  description: string;
  amount: number;
  dueDate?: string | null;
  category: Extract<FinanceCategory, "empresa" | "projeto_cliente">;
  clientId?: string | null;
  status?: FinanceStatus;
}

export async function createExpense(input: CreateExpenseInput): Promise<void> {
  const { error } = await supabase.from("finance_entries").insert({
    kind: "expense",
    description: input.description,
    amount: input.amount,
    category: input.category,
    client_id: input.clientId ?? null,
    due_date: input.dueDate || null,
    status: input.status ?? "pendente",
  });
  if (error) throw error;
}

export async function setEntryStatus(id: string, status: FinanceStatus): Promise<void> {
  const { error } = await supabase
    .from("finance_entries")
    .update({
      status,
      paid_at: status === "pago" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from("finance_entries").delete().eq("id", id);
  if (error) throw error;
}
