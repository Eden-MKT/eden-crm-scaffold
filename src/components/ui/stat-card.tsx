import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/ui/animated-number";

interface StatCardProps {
  title: string;
  /** Número (anima) ou texto já formatado. */
  value: number | string;
  /** Formatação quando value é número (ex.: moeda). */
  format?: (n: number) => string;
  /** Cor de acento (ponto + barra superior). Default: primária. */
  accent?: string;
  icon?: ReactNode;
  hint?: string;
  className?: string;
}

// Card de métrica com "profundidade refinada" — usado nos 3 dashboards.
export function StatCard({ title, value, format, accent, icon, hint, className }: StatCardProps) {
  return (
    <Card className={cn("surface-depth surface-depth-hover relative overflow-hidden", className)}>
      {/* fio de acento no topo */}
      <span
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: accent ?? "var(--primary)" }}
      />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: accent ?? "var(--primary)" }}
          />
          {title}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {typeof value === "number" ? <AnimatedNumber value={value} format={format} /> : value}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
