import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "motion/react";

import { ACTIVE_STAGES, STAGES, type Stage } from "@/lib/clients/stages";
import type { Client } from "@/lib/clients/types";
import { formatCurrencyBRL } from "@/lib/format";
import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";

interface ClientDashboardProps {
  clients: Client[];
}

export function ClientDashboard({ clients }: ClientDashboardProps) {
  const chart = useChartTheme();
  const reduce = useReducedMotion();
  const countByStage = (stage: Stage) => clients.filter((c) => c.stage === stage).length;

  const data = STAGES.map((s) => ({
    stage: s.short,
    label: s.label,
    value: countByStage(s.id),
    color: s.color,
  }));

  const totalAtivos = clients.filter((c) => ACTIVE_STAGES.includes(c.stage)).length;
  const valorAtivos = clients
    .filter((c) => ACTIVE_STAGES.includes(c.stage))
    .reduce((sum, c) => sum + c.contractValue, 0);

  const summary = [
    { title: "Clientes ativos", value: totalAtivos, accent: "#2FB67C" },
    { title: "Em kickoff", value: countByStage("kickoff"), accent: "#2FB67C" },
    { title: "Em manutenção", value: countByStage("manutencao"), accent: "#2FB67C" },
    { title: "Churn", value: countByStage("churn"), accent: "#E04F4F" },
    {
      title: "Valor em contratos (ativos)",
      value: valorAtivos,
      accent: "#1F4FD6",
      format: formatCurrencyBRL,
    },
  ];

  const hasClients = clients.length > 0;

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summary.map((s) => (
          <StaggerItem key={s.title}>
            <StatCard title={s.title} value={s.value} format={s.format} accent={s.accent} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="surface-depth">
          <CardHeader>
            <CardTitle className="text-sm">Distribuição por etapa</CardTitle>
          </CardHeader>
          <CardContent className="h-56 md:h-72">
            {hasClients ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    isAnimationActive={!reduce}
                    animationDuration={700}
                  >
                    {data.map((entry) => (
                      <Cell
                        key={entry.stage}
                        fill={entry.color}
                        stroke={chart.cellStroke}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chart.tooltip} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card className="surface-depth">
          <CardHeader>
            <CardTitle className="text-sm">Clientes por etapa</CardTitle>
          </CardHeader>
          <CardContent className="h-56 md:h-72">
            {hasClients ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                  <XAxis
                    dataKey="stage"
                    tick={{ fill: chart.axisTick, fontSize: 11 }}
                    axisLine={{ stroke: chart.axisLine }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: chart.axisTick, fontSize: 11 }}
                    axisLine={{ stroke: chart.axisLine }}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                  <Bar
                    dataKey="value"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!reduce}
                    animationDuration={700}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.stage} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Nenhum cliente cadastrado ainda.
    </div>
  );
}
