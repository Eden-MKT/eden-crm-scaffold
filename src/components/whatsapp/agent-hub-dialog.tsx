import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, LayoutDashboard, Settings, Plug } from "lucide-react";

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
import { ClientPortalPanel } from "./client-portal-panel";
import { AgentAgendaPanel } from "./agent-agenda-panel";

interface AgentHubDialogProps {
  /** Abre direto numa sub-tela (ex.: "settings" via atalho Configurar do card). */
  initialSub?: "settings" | null;
  item: AgentWithClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentHubDialog({ item, open, onOpenChange, initialSub }: AgentHubDialogProps) {
  const [sub, setSub] = useState<"settings" | "connection" | "portal" | "agenda" | null>(null);

  useEffect(() => {
    if (open) setSub(initialSub ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSub]);

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
              <button
                type="button"
                onClick={() => setSub("settings")}
                className="press-scale surface-depth surface-depth-hover flex w-full flex-col items-center gap-2 rounded-xl p-5 text-center"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Settings className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">Configurações</span>
                <span className="text-[11px] text-muted-foreground">Prompt, nicho, objetivo</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setSub("connection")}>
                  <Plug className="h-4 w-4" />
                  Conexão
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setSub("portal")}>
                  <LayoutDashboard className="h-4 w-4" />
                  Painel do cliente
                </Button>
                {agent.agendaEnabled && (
                  <Button
                    variant="outline"
                    className="col-span-2 gap-2"
                    onClick={() => setSub("agenda")}
                  >
                    <Calendar className="h-4 w-4" />
                    Agenda de atendimentos
                  </Button>
                )}
              </div>
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
          <ClientPortalPanel
            clientId={item.client.id}
            clientName={item.client.name}
            clientEmail={item.client.email}
            open={sub === "portal"}
            onOpenChange={(o) => setSub(o ? "portal" : null)}
          />
          <AgentAgendaPanel
            agent={agent}
            clientName={item.client.name}
            open={sub === "agenda"}
            onOpenChange={(o) => setSub(o ? "agenda" : null)}
          />
        </>
      )}
    </>
  );
}
