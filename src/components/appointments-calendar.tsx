import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { STATUS_LEGEND, statusColor } from "@/lib/agenda/appointment-status";

const WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const LEGEND = STATUS_LEGEND.map((s) => ({ status: s.status, label: s.label }));

export interface AppointmentsCalendarItem {
  id: string;
  patientName: string | null;
  serviceLabel: string | null;
  startsAt: string;
  status: string;
}

interface AppointmentsCalendarProps {
  appointments: AppointmentsCalendarItem[];
  /** Chamado no mount e a cada troca de mês com o intervalo da grade visível. */
  onMonthChange?: (gridStartISO: string, gridEndISO: string) => void;
  onItemClick?: (id: string) => void;
}

// Grade mensal de agendamentos — mesmo layout da agenda interna da equipe
// (agenda-view), mas alimentada de fora: quem usa controla dados e período.
export function AppointmentsCalendar({
  appointments,
  onMonthChange,
  onItemClick,
}: AppointmentsCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const gridStartISO = gridStart.toISOString();
  const gridEndISO = gridEnd.toISOString();

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    // ISO strings são estáveis; os objetos Date mudam de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridStartISO, gridEndISO],
  );

  // Avisa o dono do componente (mount + troca de mês) para buscar o período.
  useEffect(() => {
    onMonthChange?.(gridStartISO, gridEndISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStartISO, gridEndISO]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, AppointmentsCalendarItem[]>();
    for (const appt of appointments) {
      const key = format(new Date(appt.startsAt), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  return (
    <div className="space-y-4">
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

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: statusColor(l.status) }}
            />
            {l.label}
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
            const dayItems = itemsByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            return (
              <div
                key={key}
                className={cn(
                  "min-h-24 border-b border-r border-border p-1.5 text-left align-top",
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
                  {dayItems.slice(0, 3).map((appt) => {
                    const name = appt.patientName ?? appt.serviceLabel ?? "Agendamento";
                    const title = [appt.patientName, appt.serviceLabel].filter(Boolean).join(" · ");
                    return (
                      <div
                        key={appt.id}
                        role={onItemClick ? "button" : undefined}
                        tabIndex={onItemClick ? 0 : undefined}
                        onClick={() => onItemClick?.(appt.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onItemClick?.(appt.id);
                        }}
                        className={cn(
                          "rounded px-1 py-0.5 text-[11px] font-medium text-white",
                          onItemClick && "cursor-pointer",
                        )}
                        style={{
                          backgroundColor: statusColor(appt.status),
                        }}
                        title={title || name}
                      >
                        <span className="block truncate">
                          {format(new Date(appt.startsAt), "HH:mm")} {name}
                        </span>
                      </div>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">
                      +{dayItems.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
