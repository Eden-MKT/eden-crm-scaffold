// Helpers visuais compartilhados do Disparador (badges, formatação pt-BR).
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";

type Variant = "default" | "secondary" | "destructive" | "success" | "warning" | "outline";

const CAMPAIGN_STATUS: Record<string, { label: string; variant: Variant }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  agendada: { label: "Agendada", variant: "secondary" },
  rodando: { label: "Rodando", variant: "success" },
  pausada: { label: "Pausada", variant: "warning" },
  concluida: { label: "Concluída", variant: "secondary" },
  abortada: { label: "Abortada", variant: "destructive" },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const c = CAMPAIGN_STATUS[status] ?? { label: status, variant: "outline" as Variant };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

const ACCOUNT_STATUS: Record<string, { label: string; variant: Variant }> = {
  ativa: { label: "Ativa", variant: "success" },
  pausada: { label: "Pausada", variant: "warning" },
  desativada: { label: "Desativada", variant: "destructive" },
};

export function AccountStatusBadge({ status }: { status: string }) {
  const c = ACCOUNT_STATUS[status] ?? { label: status, variant: "outline" as Variant };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export function QualityBadge({ tier }: { tier: string }) {
  const variant: Variant =
    tier === "GREEN"
      ? "success"
      : tier === "YELLOW"
        ? "warning"
        : tier === "RED"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{tier}</Badge>;
}

const TEMPLATE_STATUS: Record<string, Variant> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  PAUSED: "warning",
  DISABLED: "secondary",
};

export function TemplateStatusBadge({ status }: { status: string }) {
  return <Badge variant={TEMPLATE_STATUS[status] ?? "outline"}>{status}</Badge>;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}
