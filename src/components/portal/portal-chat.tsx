import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { fetchPortalConversations, fetchPortalMessages, portalChatKeys } from "@/lib/portal/chat";
import { contactLabel, type WhatsappConversation } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConversationList } from "@/components/whatsapp/conversation-list";
import { PortalMessageBubble } from "./portal-message-bubble";

export function PortalChat() {
  const [selected, setSelected] = useState<WhatsappConversation | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: portalChatKeys.conversations(),
    queryFn: fetchPortalConversations,
    refetchInterval: 15_000,
  });
  const list: WhatsappConversation[] = data ?? [];

  const current = selected
    ? (list.find((c) => c.id === selected.id) ?? selected)
    : null;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_1fr]">
      <div className={cn("min-h-0", current ? "hidden md:block" : "block")}>
        {isLoading && list.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <ConversationList
            conversations={list}
            selectedId={current?.id ?? null}
            onSelect={setSelected}
          />
        )}
      </div>

      <div className={cn("min-h-0", current ? "block" : "hidden md:block")}>
        {current ? (
          <Thread conversation={current} onBack={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Selecione uma conversa para ver o histórico.
          </div>
        )}
      </div>
    </div>
  );
}

function Thread({
  conversation,
  onBack,
}: {
  conversation: WhatsappConversation;
  onBack: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: messages } = useQuery({
    queryKey: portalChatKeys.messages(conversation.id),
    queryFn: () => fetchPortalMessages(conversation.id),
    refetchInterval: 8_000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const label = contactLabel(conversation);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border p-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9">
          {conversation.profilePicUrl && <AvatarImage src={conversation.profilePicUrl} />}
          <AvatarFallback className="bg-primary/15 text-xs text-primary">
            {label.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{conversation.remoteJid.split("@")[0]}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
        {(messages ?? []).map((m) => (
          <PortalMessageBubble key={m.id} message={m} />
        ))}
        {(messages?.length ?? 0) === 0 && (
          <p className="pt-8 text-center text-xs text-muted-foreground">
            Sem mensagens nesta conversa.
          </p>
        )}
      </div>

      <div className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">
        Histórico somente leitura
      </div>
    </div>
  );
}
