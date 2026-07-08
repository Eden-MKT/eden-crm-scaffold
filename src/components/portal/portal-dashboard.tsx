import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "motion/react";
import { CalendarCheck, CalendarX, Target, TrendingUp, Users } from "lucide-react";

import { fetchPortalMetrics, portalKeys } from "@/lib/portal/queries";
import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { StatCard } from "@/components/ui/stat-card";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

export function PortalDashboard() {
  const chart = useChartTheme();
  const reduce = useReducedMotion();

  const { data, isLoading, isError } = useQuery({
    queryKey: portalKeys.metrics(),
    queryFn: fetchPortalMetrics,
    refetchInterval: 60_000,
  });

  const m = data?.metrics;

  const leadsDaily = (m?.leadsDaily ?? []).map((d) => ({
    label: dayLabel(d.day),
    value: d.count,
  }));

  // Preenche 24h para o gráfico de picos.
  const peakMap = new Map((m?.peakHours ?? []).map((p) => [p.hour, p.count]));
  const peakHours = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}h`,
    value: peakMap.get(h) ?? 0,
  }));

  const topTopics = (m?.topTopics ?? []).map((t) => ({
    label: t.topic,
    value: t.count,
  }));

  const cards = [
    {
      title: "Novos contatos (30d)",
      value: m?.windows.month?.leads ?? 0,
      accent: "#1F4FD6",
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: "Conversão",
      value: `${(m?.totals.conversionRate ?? 0).toFixed(0)}%`,
      accent: "#2FB67C",
      icon: <Target className="h-4 w-4" />,
    },
    // Com agenda: agendamentos + não comparecimentos. Sem agenda: conversas totais.
    ...(m?.agendaEnabled
      ? [
          {
            title: "Agendamentos",
            value: m?.appointments?.total ?? 0,
            accent: "#3AA0FF",
            icon: <CalendarCheck className="h-4 w-4" />,
          },
          {
            title: "Não comparecimentos",
            value: m?.appointments?.noShow ?? 0,
            accent: "#E04F4F",
            icon: <CalendarX className="h-4 w-4" />,
          },
        ]
      : [
          {
            title: "Conversas totais",
            value: m?.totals.conversations ?? 0,
            accent: "#E0A52F",
            icon: <TrendingUp className="h-4 w-4" />,
          },
        ]),
  ];

  return (
    <main className="mx-auto h-full max-w-5xl space-y-6 overflow-y-auto p-4 md:p-6">
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os dados. Tente novamente.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          {!m?.agentConnected && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              A IA ainda não está conectada ao WhatsApp. Assim que a equipe conectar, seus números
              aparecem aqui.
            </div>
          )}

          <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map((c) => (
              <StaggerItem key={c.title}>
                <StatCard title={c.title} value={c.value} accent={c.accent} icon={c.icon} />
              </StaggerItem>
            ))}
          </Stagger>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Leads por dia (14 dias)">
              <BarChart data={leadsDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chart.axisTick, fontSize: 10 }}
                  axisLine={{ stroke: chart.axisLine }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: chart.axisLine }}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Bar
                  dataKey="value"
                  fill="#1F4FD6"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>

            <ChartCard title="Horários de pico (30 dias)">
              <BarChart data={peakHours}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={2}
                  tick={{ fill: chart.axisTick, fontSize: 9 }}
                  axisLine={{ stroke: chart.axisLine }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: chart.axisLine }}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Bar
                  dataKey="value"
                  fill="#3AA0FF"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>
          </div>

          <Card className="surface-depth">
            <CardHeader>
              <CardTitle className="text-sm">O que os clientes mais pedem</CardTitle>
            </CardHeader>
            <CardContent className="h-56 md:h-72">
              {topTopics.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Ainda sem dados suficientes.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topTopics} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chart.gridStroke}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: chart.axisTick, fontSize: 11 }}
                      axisLine={{ stroke: chart.axisLine }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={84}
                      tick={{ fill: chart.axisTick, fontSize: 11 }}
                      axisLine={{ stroke: chart.axisLine }}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topTopics.map((t) => (
                        <Cell key={t.label} fill="#2FB67C" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="surface-depth">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-56 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
