import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";

/** Tons semânticos — mapeados para os tokens do design system. */
export type MetricTone = "brand" | "info" | "success" | "warning" | "danger";

const TONE_VAR: Record<MetricTone, string> = {
  brand: "var(--brand)",
  info: "var(--chart-2)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
};

interface MetricCardProps {
  label: string;
  value: number | string;
  format?: (n: number) => string;
  hint?: string;
  icon?: ReactNode;
  tone?: MetricTone;
  /** 0–100: desenha uma barra fina de contexto (share do total). */
  share?: number;
  /** Dá mais peso visual ao card (número maior, superfície destacada). */
  emphasis?: boolean;
  className?: string;
}

/**
 * Card de métrica do painel do cliente. Diferente do StatCard (usado no CRM
 * interno), aqui o número é o herói: ícone em cápsula tonal, rótulo discreto,
 * valor grande e uma barra de contexto opcional para dar noção de proporção.
 */
export function MetricCard({
  label,
  value,
  format,
  hint,
  icon,
  tone = "brand",
  share,
  emphasis = false,
  className,
}: MetricCardProps) {
  const color = TONE_VAR[tone];

  return (
    <article
      className={cn(
        "surface-depth surface-depth-hover group relative overflow-hidden rounded-xl p-4",
        className,
      )}
    >
      {/* Brilho tonal no canto — dá profundidade sem poluir. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-[0.18] blur-2xl transition-opacity duration-300 group-hover:opacity-30"
        style={{ background: color }}
      />

      <div className="flex items-center gap-2.5">
        {icon && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
          >
            {icon}
          </span>
        )}
        <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
      </div>

      <p
        className={cn(
          "mt-3 font-semibold tracking-tight text-foreground tabular-nums",
          emphasis ? "text-4xl" : "text-3xl",
        )}
      >
        {typeof value === "number" ? <AnimatedNumber value={value} format={format} /> : value}
      </p>

      {hint && <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>}

      {share != null && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: color }}
          />
        </div>
      )}
    </article>
  );
}
