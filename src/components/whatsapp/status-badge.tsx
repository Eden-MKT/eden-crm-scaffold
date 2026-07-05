import { Badge } from "@/components/ui/badge";
import type { AgentStatus } from "@/lib/whatsapp/types";

const MAP: Record<
  AgentStatus | "none",
  { label: string; variant: "success" | "warning" | "secondary" | "outline" }
> = {
  connected: { label: "Conectado", variant: "success" },
  connecting: { label: "Conectando", variant: "warning" },
  disconnected: { label: "Desconectado", variant: "outline" },
  none: { label: "Não configurado", variant: "secondary" },
};

export function ConnectionBadge({ status }: { status: AgentStatus | "none" }) {
  const c = MAP[status];
  return (
    <Badge variant={c.variant} className="gap-1.5">
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (status === "connected"
            ? "bg-success"
            : status === "connecting"
              ? "bg-warning animate-pulse"
              : "bg-muted-foreground")
        }
      />
      {c.label}
    </Badge>
  );
}
