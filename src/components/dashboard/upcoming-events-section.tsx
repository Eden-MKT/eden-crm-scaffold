import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ArrowRight } from "lucide-react";

import { agendaKeys, fetchUpcomingEvents } from "@/lib/agenda/queries";
import { EVENT_COLORS, EVENT_TYPES, type AgendaEvent } from "@/lib/agenda/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";

const typeLabel = (t: AgendaEvent["type"]) =>
  EVENT_TYPES.find((x) => x.value === t)?.label ?? "Compromisso";

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `Hoje ${time}`;
  if (isTomorrow(d)) return `Amanhã ${time}`;
  return `${format(d, "dd/MM", { locale: ptBR })} ${time}`;
}

export function UpcomingEventsSection() {
  const { data: events } = useQuery({
    queryKey: agendaKeys.upcoming(),
    queryFn: () => fetchUpcomingEvents(6),
  });

  return (
    <FadeIn>
      <Card className="surface-depth overflow-hidden">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <CalendarClock className="h-4 w-4" />
              </span>
              Próximos compromissos
            </span>
            <Link
              to="/agenda"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
            >
              Ver agenda <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!events || events.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              Nenhum compromisso agendado. Abra a Agenda para marcar reuniões, calls e onboarding.
            </div>
          ) : (
            <ul>
              {events.map((ev, index) => (
                <li key={ev.id} className={index > 0 ? "border-t border-border/60" : ""}>
                  <Link
                    to="/agenda"
                    className="group flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-secondary/40"
                  >
                    <div
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: EVENT_COLORS[ev.type] }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium group-hover:text-primary">{ev.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{typeLabel(ev.type)}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {whenLabel(ev.startsAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </FadeIn>
  );
}
