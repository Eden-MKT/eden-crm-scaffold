import { useDroppable } from "@dnd-kit/core";

import type { StageConfig } from "@/lib/clients/stages";
import { TEAM_MEMBER_LABELS } from "@/lib/team";
import { formatCurrencyBRL } from "@/lib/format";
import type { Client } from "@/lib/clients/types";
import { cn } from "@/lib/utils";

import { DraggableClientCard } from "./draggable-client-card";

interface KanbanColumnProps {
  stage: StageConfig;
  clients: Client[];
  completionsByClient: Map<string, Set<string>>;
  onCardClick: (client: Client) => void;
}

export function KanbanColumn({
  stage,
  clients,
  completionsByClient,
  onCardClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = clients.reduce((sum, c) => sum + c.contractValue, 0);

  return (
    <div className="flex w-[88vw] max-w-[320px] shrink-0 snap-center flex-col md:w-80 md:max-w-none">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {clients.length}
        </span>
      </div>
      {stage.assignee && (
        <p className="mb-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {TEAM_MEMBER_LABELS[stage.assignee]}
        </p>
      )}

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-3 rounded-lg border border-dashed border-transparent p-2 transition-colors",
          isOver && "border-primary/60 bg-primary/5",
        )}
      >
        {clients.map((client) => (
          <DraggableClientCard
            key={client.id}
            client={client}
            completedKeys={completionsByClient.get(client.id)}
            onClick={() => onCardClick(client)}
          />
        ))}
        {clients.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Arraste clientes para cá
          </p>
        )}
      </div>

      {clients.length > 0 && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">Total: {formatCurrencyBRL(total)}</p>
      )}
    </div>
  );
}
