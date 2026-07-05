import { useEffect, useState } from "react";
import { FileText, Bot, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { getWhatsappMediaUrl } from "@/lib/whatsapp/media";
import type { WhatsappMessage } from "@/lib/whatsapp/types";

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function MessageBubble({ message }: { message: WhatsappMessage }) {
  const outgoing = message.direction === "out";
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (message.mediaPath) {
      getWhatsappMediaUrl(message.mediaPath).then((u) => {
        if (active) setUrl(u);
      });
    }
    return () => {
      active = false;
    };
  }, [message.mediaPath]);

  return (
    <div className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          outgoing
            ? "gradient-brand rounded-br-sm text-white"
            : "rounded-bl-sm border border-border bg-card text-foreground",
        )}
      >
        {outgoing && (
          <span className="mb-0.5 flex items-center gap-1 text-[10px] opacity-80">
            {message.sender === "ai" ? (
              <>
                <Bot className="h-3 w-3" /> IA
              </>
            ) : (
              <>
                <User className="h-3 w-3" /> Você
              </>
            )}
          </span>
        )}

        {message.mediaPath && (
          <div className="mb-1">
            {message.messageType === "image" && url && (
              <a href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="imagem" className="max-h-64 rounded-lg object-cover" />
              </a>
            )}
            {message.messageType === "audio" && url && (
              <audio controls src={url} className="w-56" />
            )}
            {message.messageType === "video" && url && (
              <video controls src={url} className="max-h-64 rounded-lg" />
            )}
            {message.messageType === "document" && url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5 text-xs underline"
              >
                <FileText className="h-4 w-4" /> Abrir documento
              </a>
            )}
          </div>
        )}

        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        <span
          className={cn(
            "mt-0.5 block text-right text-[10px]",
            outgoing ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {timeOf(message.sentAt)}
        </span>
      </div>
    </div>
  );
}
