import type { Database } from "@/integrations/supabase/types";
import type { BillingType } from "@/lib/clients/billing-types";

type FinanceRow = Database["public"]["Tables"]["finance_entries"]["Row"];

export type FinanceKind = "income" | "expense";
export type FinanceCategory = "contrato" | "projeto_cliente" | "empresa";
export type FinanceStatus = "pendente" | "pago";

export interface FinanceEntry {
  id: string;
  kind: FinanceKind;
  clientId: string | null;
  description: string;
  amount: number;
  category: FinanceCategory;
  billingType: BillingType | null;
  dueDate: string | null;
  status: FinanceStatus;
  paidAt: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

export function mapFinanceEntry(row: FinanceRow): FinanceEntry {
  return {
    id: row.id,
    kind: row.kind as FinanceKind,
    clientId: row.client_id,
    description: row.description,
    amount: Number(row.amount ?? 0),
    category: row.category as FinanceCategory,
    billingType: (row.billing_type as BillingType | null) ?? null,
    dueDate: row.due_date,
    status: row.status as FinanceStatus,
    paidAt: row.paid_at,
    installmentNo: row.installment_no,
    installmentTotal: row.installment_total,
    isRecurring: row.is_recurring,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
