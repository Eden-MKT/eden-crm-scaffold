import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { STAGES, ASSIGNEE_COLORS, isStage, type Stage } from "@/lib/clients/stages";
import { fetchAllTaskCompletions, taskKeys } from "@/lib/clients/task-queries";
import { buildCompletionsMap } from "@/lib/clients/task-utils";
import { TEAM_MEMBER_LABELS } from "@/lib/team";
import { clientsKeys, updateClientStage } from "@/lib/clients/queries";
import type { Client } from "@/lib/clients/types";

import { ClientCard } from "./client-card";
import { KanbanColumn } from "./kanban-column";

interface ClientKanbanProps {
  clients: Client[];
  onCardClick: (client: Client) => void;
}

export function ClientKanban({ clients, onCardClick }: ClientKanbanProps) {
  const queryClient = useQueryClient();
  const [activeClient, setActiveClient] = useState<Client | null>(null);

  const { data: allCompletions = [] } = useQuery({
    queryKey: taskKeys.all,
    queryFn: fetchAllTaskCompletions,
  });
  const completionsByClient = buildCompletionsMap(allCompletions);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // Atualização otimista: muda o cache (compartilhado com o Dashboard) na hora.
  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => updateClientStage(id, stage),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: clientsKeys.list() });
      const previous = queryClient.getQueryData<Client[]>(clientsKeys.list());
      queryClient.setQueryData<Client[]>(clientsKeys.list(), (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, stage } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(clientsKeys.list(), ctx.previous);
      }
      toast.error("Não foi possível mover o cliente.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.all });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const client = event.active.data.current?.client as Client | undefined;
    setActiveClient(client ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveClient(null);
    const { active, over } = event;
    if (!over) return;

    const client = active.data.current?.client as Client | undefined;
    const target = String(over.id);
    if (!client || !isStage(target) || client.stage === target) return;

    moveMutation.mutate({ id: client.id, stage: target });
  };

  const byStage = (stage: Stage) => clients.filter((c) => c.stage === stage);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveClient(null)}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground md:text-xs">
        <span className="w-full font-medium text-foreground sm:w-auto">Responsável:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ASSIGNEE_COLORS.filipe }} />
          {TEAM_MEMBER_LABELS.filipe}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ASSIGNEE_COLORS.joao }} />
          {TEAM_MEMBER_LABELS.joao}
        </span>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:snap-none md:px-0">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            clients={byStage(stage.id)}
            completionsByClient={completionsByClient}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeClient ? <ClientCard client={activeClient} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
