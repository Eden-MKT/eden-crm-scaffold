import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  format,
  isToday,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import {
  STATUS_LEGEND,
  statusColor,
  type BoardAppointmentStatus,
} from "@/lib/agenda/appointment-status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ClinicorpWeekItem {
  id: string;
  patientName: string | null;
  serviceLabel: string | null;
  startsAt: string;
  status: string;
  source?: string;
}

interface ClinicorpWeekAgendaProps {
  appointments: ClinicorpWeekItem[];
  isLoading?: boolean;
  /** Chamado no mount e a cada troca de semana (seg 00:00 → sex 23:59:59). */
  onWeekChange?: (fromISO: string, toISO: string) => void;
  onNew?: () => void;
  onItemClick?: (id: string) => void;
  onStatusChange?: (id: string, status: BoardAppointmentStatus) => void;
  hoursHint?: string;
  className?: string;
}

const DAY_COUNT = 5; // Seg–Sex

function weekBounds(anchor: Date) {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  const friday = addDays(monday, 4);
  const from = new Date(monday);
  from.setHours(0, 0, 0, 0);
  const to = new Date(friday);
  to.setHours(23, 59, 59, 999);
  return { monday, friday, fromISO: from.toISOString(), toISO: to.toISOString() };
}

export function ClinicorpWeekAgenda({
  appointments,
  isLoading,
  onWeekChange,
  onNew,
  onItemClick,
  onStatusChange,
  hoursHint = "7:00 - 19:00",
  className,
}: ClinicorpWeekAgendaProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const { monday, friday, fromISO, toISO } = useMemo(() => weekBounds(anchor), [anchor]);

  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => addDays(monday, i)),
    [monday],
  );

  useEffect(() => {
    onWeekChange?.(fromISO, toISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromISO, toISO]);

  const byDay = useMemo(() => {
    const map = new Map<string, ClinicorpWeekItem[]>();
    for (const day of days) {
      map.set(format(day, "yyyy-MM-dd"), []);
    }
    for (const appt of appointments) {
      const key = format(new Date(appt.startsAt), "yyyy-MM-dd");
      const list = map.get(key);
      if (!list) continue;
      list.push(appt);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    }
    return map;
  }, [appointments, days]);

  const count = appointments.length;
  const rangeLabel = `${format(monday, "d", { locale: ptBR })} a ${format(friday, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Agenda</h2>
            <p className="text-sm text-muted-foreground">
              {count} agendamento{count === 1 ? "" : "s"} · semana de {rangeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setAnchor((d) => addWeeks(d, -1))}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => setAnchor(new Date())}
              >
                Hoje
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setAnchor((d) => addWeeks(d, 1))}
                aria-label="Próxima semana"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {onNew && (
              <Button size="sm" className="gap-1.5" onClick={onNew}>
                <Plus className="h-4 w-4" /> Novo agendamento
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {STATUS_LEGEND.map((item) => (
            <span key={item.status} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {item.label}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px]">
            <Bot className="h-3 w-3" />
            Ícone de robô = confirmado automaticamente pela IA no WhatsApp
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card/30">
          <div className="grid min-w-[720px] grid-cols-5 divide-x divide-border">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const items = byDay.get(key) ?? [];
              const today = isToday(day);
              return (
                <div key={key} className="flex min-h-[420px] flex-col">
                  <div
                    className={cn(
                      "border-b border-border px-3 py-2 text-center text-sm font-medium",
                      today ? "bg-primary/10 text-foreground" : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {format(day, "d")} — {format(day, "EEEE", { locale: ptBR })}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {isLoading && items.length === 0 && (
                      <p className="py-8 text-center text-xs text-muted-foreground">…</p>
                    )}
                    {!isLoading && items.length === 0 && (
                      <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                        sem agendamentos
                      </p>
                    )}
                    {items.map((appt) => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        onClick={() => onItemClick?.(appt.id)}
                        onStatusChange={
                          onStatusChange
                            ? (status) => onStatusChange(appt.id, status)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            {hoursHint}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function AppointmentCard({
  appt,
  onClick,
  onStatusChange,
}: {
  appt: ClinicorpWeekItem;
  onClick?: () => void;
  onStatusChange?: (status: BoardAppointmentStatus) => void;
}) {
  const color = statusColor(appt.status);
  const time = format(new Date(appt.startsAt), "HH:mm");
  const isAi = appt.source === "ai";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="group w-full cursor-pointer rounded-md border border-border/80 bg-background px-2.5 py-2 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-start gap-2">
        {onStatusChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: color }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                title="Alterar status"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onClick={(e) => e.stopPropagation()}
              className="w-48"
            >
              {STATUS_LEGEND.map((item) => (
                <DropdownMenuItem
                  key={item.status}
                  onClick={() => onStatusChange(item.status)}
                  className="gap-2"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {appt.patientName || "Sem nome"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {time}
            {appt.serviceLabel ? ` · ${appt.serviceLabel}` : ""}
          </p>
        </div>

        {isAi && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="mt-0.5 shrink-0 text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Bot className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs">
              Confirmado / criado automaticamente pela IA no WhatsApp
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Helpers exportados para os shells calcularem a semana corrente. */
export function currentWeekRange(date = new Date()) {
  return weekBounds(date);
}
