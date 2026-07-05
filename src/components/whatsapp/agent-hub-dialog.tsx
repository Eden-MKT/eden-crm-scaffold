import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Settings, Plug } from "lucide-react";

import { ensureAgent, whatsappKeys } from "@/lib/whatsapp/queries";
import type { AgentWithClient } from "@/lib/whatsapp/queries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConnectionBadge } from "./status-badge";
import { AgentSettingsSheet } from "./agent-settings-sheet";
import { ConnectionPanel } from "./connection-panel";
import { ChatDialog } from "./chat-dialog";

interface AgentHubDialogProps {
  item: AgentWithClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentHubDialog({ item, open, onOpenChange }: AgentHubDialogProps) {
  const [sub, setSub] = useState<"settings" | "chat" | "connection" | null>(null);

  // Garante o agente (cria on-demand) ao abrir o hub.
  const { data: agent, isLoading } = useQuery({
    queryKey: whatsappKeys.agentByClient(item.client.id),
    queryFn: () => ensureAgent(item.client.id),
    enabled: open,
    initialData: item.agent ?? undefined,
  });

  return (
    <>
      <Dialog open={open && sub === null} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              {item.client.name}
              <ConnectionBadge status={agent ? agent.status : "none"} />
            </DialogTitle>
            <DialogDescription>
              Agente de IA no WhatsApp {item.client.company ? `· ${item.client.company}` : ""}
            </DialogDescription>
          </DialogHeader>

          {isLoading || !agent ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando agente…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSub("settings")}
                  className="surface-depth surface-depth-hover flex flex-col items-center gap-2 rounded-xl p-5 text-center"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Settings className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Configurações</span>
                  <span className="text-[11px] text-muted-foreground">Prompt, nicho, objetivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSub("chat")}
                  className="surface-depth surface-depth-hover flex flex-col items-center gap-2 rounded-xl p-5 text-center"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Chat</span>
                  <span className="text-[11px] text-muted-foreground">Conversas em tempo real</span>
                </button>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setSub("connection")}
              >
                <Plug className="h-4 w-4" />
                Conexão
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {agent && (
        <>
          <AgentSettingsSheet
            agent={agent}
            clientName={item.client.name}
            open={sub === "settings"}
            onOpenChange={(o) => setSub(o ? "settings" : null)}
          />
          <ConnectionPanel
            agent={agent}
            clientName={item.client.name}
            open={sub === "connection"}
            onOpenChange={(o) => setSub(o ? "connection" : null)}
          />
          <ChatDialog
            agent={agent}
            clientName={item.client.name}
            open={sub === "chat"}
            onOpenChange={(o) => setSub(o ? "chat" : null)}
          />
        </>
      )}
    </>
  );
}
