import { useState } from "react";
import { Search, PauseCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { contactLabel, type WhatsappConversation } from "@/lib/whatsapp/types";

function timeShort(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface ConversationListProps {
  conversations: WhatsappConversation[];
  selectedId: string | null;
  onSelect: (c: WhatsappConversation) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const [q, setQ] = useState("");
  const filtered = conversations.filter((c) =>
    contactLabel(c).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar conversa…"
            className="pl-8"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
        )}
        {filtered.map((c) => {
          const label = contactLabel(c);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border/60 p-3 text-left transition-colors hover:bg-accent/40",
                selectedId === c.id && "bg-accent/60",
              )}
            >
              <Avatar className="h-10 w-10 shrink-0">
                {c.profilePicUrl && <AvatarImage src={c.profilePicUrl} />}
                <AvatarFallback className="bg-primary/15 text-xs text-primary">
                  {label.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{label}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {timeShort(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {c.aiPaused && <PauseCircle className="h-3 w-3 shrink-0 text-warning" />}
                  <span className="truncate text-xs text-muted-foreground">
                    {c.lastMessagePreview ?? "—"}
                  </span>
                </div>
              </div>
              {c.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {c.unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
