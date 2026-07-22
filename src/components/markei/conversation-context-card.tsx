import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";

import type { WhatsappConversation } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ConversationContextCardProps {
  conversation: WhatsappConversation;
}

// Resumo/contexto da conversa gerado pela IA — colapsável, acima das mensagens.
// Não renderiza nada quando ainda não há contexto.
export function ConversationContextCard({ conversation }: ConversationContextCardProps) {
  const [open, setOpen] = useState(false);
  const text = conversation.contextSummary ?? conversation.leadInterest;
  if (!text) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border bg-muted/40">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <FileText className="h-3.5 w-3.5 text-primary" />
        Contexto da Conversa
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="px-3 pb-3 text-xs text-muted-foreground">{text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
