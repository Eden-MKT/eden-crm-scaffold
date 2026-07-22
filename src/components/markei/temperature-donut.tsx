import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useReducedMotion } from "motion/react";

import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { TEMPERATURE_META, type MarkeiMetrics, type TemperatureKey } from "@/lib/markei/types";

const ORDER: TemperatureKey[] = ["hot", "warm", "cold", "unanalyzed"];

interface TemperatureDonutProps {
  distribution: MarkeiMetrics["temperatureDistribution"] | undefined;
}

// Donut de temperatura dos leads (Quente/Morno/Frio/Não analisado) — usado
// no dashboard e no analytics.
export function TemperatureDonut({ distribution }: TemperatureDonutProps) {
  const chart = useChartTheme();
  const reduce = useReducedMotion();

  const data = ORDER.map((key) => ({
    key,
    label: TEMPERATURE_META[key].label,
    color: TEMPERATURE_META[key].color,
    value: distribution?.[key] ?? 0,
  }));
  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = data.filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sem leads no período.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              isAnimationActive={!reduce}
              animationDuration={700}
            >
              {slices.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.color}
                  stroke={chart.cellStroke}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={chart.tooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
        {data.map((d) => (
          <span key={d.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.label}
            <span className="font-medium text-foreground">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
