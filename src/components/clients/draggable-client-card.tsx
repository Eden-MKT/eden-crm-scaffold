import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";

import type { Client } from "@/lib/clients/types";

import { ClientCard } from "./client-card";

interface DraggableClientCardProps {
  client: Client;
  onClick: () => void;
}

// Envolve o ClientCard com o comportamento de arrastar do dnd-kit.
export function DraggableClientCard({ client, onClick }: DraggableClientCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
    data: { client },
  });

  return (
    // Wrapper anima só a ENTRADA (fade+scale); o drag fica no div interno
    // com o transform do dnd-kit — sem conflito.
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        {...listeners}
        {...attributes}
        className="touch-none focus:outline-none"
      >
        <ClientCard client={client} onClick={onClick} dragging={isDragging} />
      </div>
    </motion.div>
  );
}
