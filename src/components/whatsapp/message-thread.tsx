import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

import { evolutionManager } from "@/lib/whatsapp/manager";
import {
  clearUnread,
  fetchMessages,
  setConversationPaused,
  whatsappKeys,
} from "@/lib/whatsapp/queries";
import { useMessagesRealtime } from "@/lib/whatsapp/use-realtime";
import { contactLabel, type WhatsappConversation } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "./message-bubble";

interface MessageThreadProps {
  conversation: WhatsappConversation;
  agentId: string;
  onBack?: () => void;
  /** Conteúdo extra no header, depois dos badges (ex.: ações do painel Markei). */
  headerExtras?: React.ReactNode;
  /** Conteúdo entre o header e a área de mensagens (ex.: contexto da conversa). */
  aboveMessages?: React.ReactNode;
}

export function MessageThread({
  conversation,
  agentId,
  onBack,
  headerExtras,
  aboveMessages,
}: MessageThreadProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: whatsappKeys.messages(conversation.id),
    queryFn: () => fetchMessages(conversation.id),
  });

  useMessagesRealtime(conversation.id);

  // Zera o não-lido ao abrir.
  useEffect(() => {
    clearUnread(conversation.id).then(() =>
      queryClient.invalidateQueries({
        queryKey: whatsappKeys.conversations(agentId),
      }),
    );
  }, [conversation.id, agentId, queryClient]);

  // Auto-scroll ao fim quando chegam mensagens.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) => setConversationPaused(conversation.id, paused),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: whatsappKeys.conversations(agentId),
      }),
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) => evolutionManager.sendManual(conversation.id, text),
    onSuccess: () => setDraft(""),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar."),
  });

  const label = contactLabel(conversation);

  const send = () => {
    const t = draft.trim();
    if (t) sendMutation.mutate(t);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border p-3">
        {onBack && (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9">
          {conversation.profilePicUrl && <AvatarImage src={conversation.profilePicUrl} />}
          <AvatarFallback className="bg-primary/15 text-xs text-primary">
            {label.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{conversation.remoteJid.split("@")[0]}</p>
        </div>
        {conversation.converted && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Convertido
          </Badge>
        )}
        {headerExtras}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">IA</span>
          <Switch
            checked={!conversation.aiPaused}
            onCheckedChange={(on) => pauseMutation.mutate(!on)}
          />
        </div>
      </div>

      {aboveMessages}

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
        {(messages ?? []).map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {(messages?.length ?? 0) === 0 && (
          <p className="pt-8 text-center text-xs text-muted-foreground">
            Sem mensagens nesta conversa.
          </p>
        )}
      </div>

      {/* Input manual */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            conversation.aiPaused
              ? "IA pausada — responda manualmente…"
              : "Enviar mensagem manual (pausa recomendada)…"
          }
        />
        <Button size="icon" onClick={send} disabled={sendMutation.isPending || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
