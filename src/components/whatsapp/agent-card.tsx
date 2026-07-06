import { Bot, MessageSquare, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AgentWithClient } from "@/lib/whatsapp/queries";
import { ConnectionBadge } from "./status-badge";

interface AgentCardProps {
  item: AgentWithClient;
  onOpen: () => void;
}

export function AgentCard({ item, onOpen }: AgentCardProps) {
  const { client, agent } = item;
  const status = agent ? agent.status : "none";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "press-scale surface-depth surface-depth-hover group flex flex-col gap-3 rounded-xl p-4 text-left",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-brand text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight text-foreground">{client.name}</p>
            {client.company && (
              <p className="truncate text-xs text-muted-foreground">{client.company}</p>
            )}
          </div>
        </div>
        <ConnectionBadge status={status} />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {agent?.phoneNumber ? (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />+{agent.phoneNumber}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {agent ? "Sem número conectado" : "Agente não criado"}
          </span>
        )}
        {agent && !agent.aiEnabled && <span className="text-warning">IA desligada</span>}
      </div>
    </button>
  );
}
