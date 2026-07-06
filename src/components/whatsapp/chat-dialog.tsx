import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchConversations, whatsappKeys } from "@/lib/whatsapp/queries";
import { useConversationsRealtime } from "@/lib/whatsapp/use-realtime";
import type { WhatsappAgent, WhatsappConversation } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

interface ChatDialogProps {
  agent: WhatsappAgent;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDialog({ agent, clientName, open, onOpenChange }: ChatDialogProps) {
  const [selected, setSelected] = useState<WhatsappConversation | null>(null);

  const { data: conversations } = useQuery({
    queryKey: whatsappKeys.conversations(agent.id),
    queryFn: () => fetchConversations(agent.id),
    enabled: open,
  });

  useConversationsRealtime(open ? agent.id : null);

  // Mantém a conversa selecionada sincronizada com dados novos (realtime).
  const current = selected ? (conversations?.find((c) => c.id === selected.id) ?? selected) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:rounded-none">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">Chat — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_1fr]">
          {/* Lista (some no mobile quando uma conversa está aberta) */}
          <div className={cn("min-h-0", current ? "hidden md:block" : "block")}>
            <ConversationList
              conversations={conversations ?? []}
              selectedId={current?.id ?? null}
              onSelect={setSelected}
            />
          </div>

          {/* Thread */}
          <div className={cn("min-h-0", current ? "block" : "hidden md:block")}>
            {current ? (
              <MessageThread
                conversation={current}
                agentId={agent.id}
                onBack={() => setSelected(null)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Selecione uma conversa para ver as mensagens.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
