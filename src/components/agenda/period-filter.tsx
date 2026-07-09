import { endOfDay, endOfMonth, format, startOfDay, startOfMonth, subDays } from "date-fns";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type PeriodPreset = "day" | "7d" | "month" | "90d" | "custom";

export interface PeriodValue {
  from: Date;
  to: Date;
  preset: PeriodPreset;
}

const PRESETS: { key: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { key: "day", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "month", label: "Mês atual" },
  { key: "90d", label: "90 dias" },
];

export function periodForPreset(preset: Exclude<PeriodPreset, "custom">): PeriodValue {
  const now = new Date();
  switch (preset) {
    case "day":
      return { from: startOfDay(now), to: endOfDay(now), preset };
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), preset };
    case "90d":
      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now), preset };
    case "month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now), preset: "month" };
  }
}

/** Período padrão das agendas: mês atual. */
export function defaultPeriod(): PeriodValue {
  return periodForPreset("month");
}

interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  className?: string;
}

// Filtro de período (estilo gerenciador de anúncios): presets + intervalo personalizado.
export function PeriodFilter({ value, onChange, className }: PeriodFilterProps) {
  const setCustom = (patch: { from?: string; to?: string }) => {
    const from = patch.from ? startOfDay(new Date(`${patch.from}T12:00:00`)) : value.from;
    const to = patch.to ? endOfDay(new Date(`${patch.to}T12:00:00`)) : value.to;
    if (to < from) return; // intervalo inválido: ignora até corrigirem
    onChange({ from, to, preset: "custom" });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(periodForPreset(p.key))}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value.preset === p.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...value, preset: "custom" })}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          value.preset === "custom"
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        Personalizado
      </button>

      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={format(value.from, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && setCustom({ from: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={format(value.to, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && setCustom({ to: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
