import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { whatsappKeys } from "./queries";
import { mapMessage, type WhatsappMessage } from "./types";

// Realtime das conversas de um agente (lista lateral + stats).
export function useConversationsRealtime(agentId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!agentId) return;
    const channel = supabase
      .channel(`wa-conv-${agentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `agent_id=eq.${agentId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: whatsappKeys.conversations(agentId),
          });
          queryClient.invalidateQueries({ queryKey: whatsappKeys.stats() });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId, queryClient]);
}

// Realtime das mensagens de uma conversa aberta (thread).
export function useMessagesRealtime(conversationId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`wa-msg-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = mapMessage(payload.new as Parameters<typeof mapMessage>[0]);
          queryClient.setQueryData<WhatsappMessage[]>(
            whatsappKeys.messages(conversationId),
            (old) => {
              if (!old) return [msg];
              if (old.some((m) => m.id === msg.id)) return old;
              return [...old, msg];
            },
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
}
