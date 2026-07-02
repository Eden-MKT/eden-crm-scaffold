import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";

import { tasksForStage } from "@/lib/clients/onboarding-tasks";
import type { Client } from "@/lib/clients/types";
import { stageAssigneeColor } from "@/lib/clients/stages";
import { cn } from "@/lib/utils";

import { ClientCard } from "./client-card";
import { ClientOnboardingChecklist } from "./client-onboarding-checklist";

interface DraggableClientCardProps {
  client: Client;
  completedKeys?: Set<string>;
  onClick: () => void;
}

// Envolve o ClientCard com drag + checklist da etapa abaixo.
export function DraggableClientCard({
  client,
  completedKeys,
  onClick,
}: DraggableClientCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
    data: { client },
  });

  const color = stageAssigneeColor(client.stage);
  const hasTasks = tasksForStage(client.stage).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "overflow-hidden rounded-xl border bg-card/50 shadow-sm",
        isDragging && "opacity-60",
      )}
      style={{ borderColor: `${color}44` }}
    >
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        {...listeners}
        {...attributes}
        className="touch-none focus:outline-none"
      >
        <ClientCard
          client={client}
          onClick={onClick}
          dragging={isDragging}
          className="rounded-none border-0 shadow-none"
        />
      </div>

      {hasTasks && (
        <ClientOnboardingChecklist
          clientId={client.id}
          stage={client.stage}
          variant="kanban"
          completedKeys={completedKeys}
        />
      )}
    </motion.div>
  );
}
