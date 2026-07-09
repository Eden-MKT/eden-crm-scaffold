import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { agendaKeys, fetchEventsInRange } from "@/lib/agenda/queries";
import { EVENT_COLORS, EVENT_TYPES, type AgendaEvent } from "@/lib/agenda/types";
import { TEAM_MEMBERS, teamLabelForEmail, useTeamMember } from "@/lib/team";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EventDialog } from "./event-dialog";

const WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AgendaView() {
  const member = useTeamMember();
  const isOwner = member !== null; // donos (Filipe/João) podem filtrar por responsável
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<string>("all"); // "all" | email do membro

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  const { data: events } = useQuery({
    queryKey: agendaKeys.range(gridStart.toISOString(), gridEnd.toISOString()),
    queryFn: () => fetchEventsInRange(gridStart.toISOString(), gridEnd.toISOString()),
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    const filtered = (events ?? []).filter(
      (ev) => filter === "all" || ev.assignees.includes(filter),
    );
    for (const ev of filtered) {
      const key = format(new Date(ev.startsAt), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events, filter]);

  const openNew = (date: Date | null) => {
    setEditing(null);
    setDefaultDate(date);
    setDialogOpen(true);
  };
  const openEdit = (ev: AgendaEvent) => {
    setEditing(ev);
    setDefaultDate(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agenda"
        subtitle="Reuniões, onboarding, calls e compromissos da equipe."
        action={
          <Button className="gap-1.5" onClick={() => openNew(new Date())}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        }
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-lg font-semibold capitalize">
            {format(cursor, "MMMM yyyy", { locale: ptBR })}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
          Hoje
        </Button>
      </div>

      {/* Filtro por responsável — só para donos (que veem a agenda de todos). */}
      {isOwner && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="Todos" active={filter === "all"} onClick={() => setFilter("all")} />
          {TEAM_MEMBERS.map((m) => (
            <FilterChip
              key={m.key}
              label={m.label}
              active={filter === m.email}
              onClick={() => setFilter(m.email)}
            />
          ))}
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {EVENT_TYPES.map((t) => (
          <span key={t.value} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: EVENT_COLORS[t.value] }}
            />
            {t.label}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {WEEK_LABELS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            return (
              <button
                type="button"
                key={key}
                onClick={() => openNew(day)}
                className={cn(
                  "min-h-24 border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-accent/40",
                  !inMonth && "bg-muted/20 text-muted-foreground/60",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday(day) && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(ev);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          openEdit(ev);
                        }
                      }}
                      className="rounded px-1 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: EVENT_COLORS[ev.type] }}
                      title={ev.title}
                    >
                      <span className="block truncate">
                        {format(new Date(ev.startsAt), "HH:mm")} {ev.title}
                      </span>
                      {ev.assignees.length > 0 && (
                        <span className="block truncate text-[9px] font-normal text-white/80">
                          {ev.assignees.map(teamLabelForEmail).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3} mais
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editing}
        defaultDate={defaultDate}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
