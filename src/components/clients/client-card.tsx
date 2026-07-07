import { Building2, GripVertical } from "lucide-react";

import { formatCurrencyBRL } from "@/lib/format";
import { stageAssigneeColor } from "@/lib/clients/stages";
import type { Client } from "@/lib/clients/types";
import { cn } from "@/lib/utils";

interface ClientCardProps {
  client: Client;
  onClick?: () => void;
  /** true quando renderizado no DragOverlay (efeito de "pegar"). */
  overlay?: boolean;
  dragging?: boolean;
  className?: string;
}

// Card visual do cliente (sem lógica de drag — reaproveitado no overlay).
export function ClientCard({ client, onClick, overlay, dragging, className }: ClientCardProps) {
  const color = stageAssigneeColor(client.stage);

  return (
    <div
      onClick={onClick}
      className={cn(
        "press-scale group surface-depth surface-depth-hover relative cursor-pointer rounded-xl p-3",
        overlay && "rotate-2 scale-[1.03] shadow-xl ring-1 ring-primary/40 glow-primary",
        dragging && "opacity-40",
        className,
      )}
      style={{
        borderLeft: `3px solid ${color}`,
        backgroundColor: `${color}12`,
      }}
    >
      <GripVertical className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      <p className="pr-5 font-medium leading-tight text-foreground">{client.name}</p>
      {client.company && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" />
          {client.company}
        </p>
      )}
      <p className="mt-2 text-sm font-semibold text-primary">
        {formatCurrencyBRL(client.contractValue)}
      </p>
    </div>
  );
}
