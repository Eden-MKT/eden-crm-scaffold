// Plano de pagamento do contrato (modalidade) — distinto da "forma de pagamento".
export type BillingType = "avista" | "recorrente" | "parcelado";

export interface BillingTypeConfig {
  id: BillingType;
  label: string;
  /** Rótulo do campo de valor para esse plano. */
  amountLabel: string;
}

export const BILLING_TYPES: BillingTypeConfig[] = [
  { id: "avista", label: "À vista (tudo de uma vez)", amountLabel: "Valor total (R$)" },
  {
    id: "recorrente",
    label: "Mensalidade recorrente",
    amountLabel: "Valor mensal (R$)",
  },
  {
    id: "parcelado",
    label: "Parcelado no cartão",
    amountLabel: "Valor total (R$)",
  },
];

export const BILLING_TYPE_MAP: Record<BillingType, BillingTypeConfig> = Object.fromEntries(
  BILLING_TYPES.map((b) => [b.id, b]),
) as Record<BillingType, BillingTypeConfig>;

export function billingTypeLabel(value: string | null): string {
  if (!value) return "—";
  return BILLING_TYPE_MAP[value as BillingType]?.label ?? value;
}
