import { UserCheck } from "lucide-react";

import { TEMPERATURE_META } from "@/lib/markei/types";
import type { WhatsappConversation } from "@/lib/whatsapp/types";

// As cores vêm dos tokens do design system (var(--...)), então o fundo e a
// borda precisam de color-mix — concatenar alfa em hex (`${color}1f`) gera CSS
// inválido e a etiqueta fica sem fundo nenhum.
function pill(color: string) {
  return {
    color,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
  };
}

interface LeadBadgesProps {
  conversation: WhatsappConversation;
}

// Badges compactos da lista de conversas do painel Markei (NOVO, handoff,
// pendentes e temperatura). Renderiza null quando não há nada a mostrar.
export function LeadBadges({ conversation: c }: LeadBadgesProps) {
  const isNew = Date.now() - new Date(c.createdAt).getTime() < 24 * 3_600_000;
  const temp = c.leadTemperature ? TEMPERATURE_META[c.leadTemperature] : null;
  const TempIcon = temp?.icon;

  if (!isNew && !c.humanTakeover && c.unreadCount === 0 && !temp) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {isNew && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
          style={pill("#1EA340")}
        >
          NOVO
        </span>
      )}
      {c.humanTakeover && (
        <span
          className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
          style={pill("#E0A52F")}
        >
          <UserCheck className="h-2.5 w-2.5" /> Sob autoridade da secretária
        </span>
      )}
      {c.unreadCount > 0 && (
        <span
          className="animate-pulse rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
          style={pill("#1EA340")}
        >
          {c.unreadCount} pendentes
        </span>
      )}
      {temp && TempIcon && (
        <span
          className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
          style={pill(temp.color)}
        >
          <TempIcon className="h-2.5 w-2.5" /> {temp.label}
        </span>
      )}
    </div>
  );
}
