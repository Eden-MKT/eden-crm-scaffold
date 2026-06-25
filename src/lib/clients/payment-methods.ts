// Formas de pagamento — lista fixa (BR).
export type PaymentMethod = "pix" | "boleto" | "cartao_credito" | "transferencia" | "dinheiro";

export interface PaymentMethodConfig {
  id: PaymentMethod;
  label: string;
}

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  { id: "pix", label: "Pix" },
  { id: "boleto", label: "Boleto" },
  { id: "cartao_credito", label: "Cartão de crédito" },
  { id: "transferencia", label: "Transferência / TED" },
  { id: "dinheiro", label: "Dinheiro" },
];

export const PAYMENT_METHOD_MAP: Record<PaymentMethod, PaymentMethodConfig> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.id, p]),
) as Record<PaymentMethod, PaymentMethodConfig>;

export function paymentMethodLabel(value: string | null): string {
  if (!value) return "—";
  return PAYMENT_METHOD_MAP[value as PaymentMethod]?.label ?? value;
}
