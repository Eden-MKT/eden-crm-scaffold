import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "motion/react";
import {
  CalendarCheck,
  Clock,
  MessagesSquare,
  Percent,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { fetchPortalMetrics, portalKeys } from "@/lib/portal/queries";
import { FUNNEL_STEPS } from "@/lib/markei/types";
import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard, type MetricTone } from "@/components/markei/metric-card";
import { TemperatureDonut } from "@/components/markei/temperature-donut";

function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

function monthLabel(iso: string): string {
  // "2026-07" ou "2026-07-01" → "jul/26"
  const d = new Date(iso.length === 7 ? `${iso}-01T12:00:00` : `${iso.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(d);
}

function formatResponseTime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}min`;
}

// Tom do tempo de resposta: rápido é bom, lento vira alerta.
function responseTimeTone(seconds: number | null | undefined): MetricTone {
  if (seconds == null) return "brand";
  if (seconds <= 60) return "success";
  if (seconds <= 120) return "warning";
  return "danger";
}

// Dashboard do portal do cliente — mesmos cards e gráficos do painel de
// gestão, alimentados pelo portal_metrics (escopado no servidor).
export function PortalPanelDashboard() {
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

  const topTopics = (m?.topTopics ?? []).map((t) => ({ label: t.topic, value: t.count }));

  const monthly = (m?.monthlyVolume ?? []).map((v) => ({
    label: monthLabel(v.month),
    leads: v.leads,
    conversions: v.conversions,
  }));

  const funnel = m?.funnelDistribution;
  const funnelRows = funnel
    ? [
        { label: FUNNEL_STEPS[0], value: funnel.novoContato, color: "var(--chart-2)" },
        { label: FUNNEL_STEPS[1], value: funnel.emAtendimento, color: "var(--warning)" },
        { label: FUNNEL_STEPS[2], value: funnel.qualificado, color: "var(--success)" },
        {
          label: FUNNEL_STEPS[3],
          value: funnel.agendado,
          color: "var(--brand-light, var(--brand))",
        },
        { label: FUNNEL_STEPS[4], value: funnel.convertido, color: "var(--brand)" },
      ]
    : [];
  const funnelMax = Math.max(1, ...funnelRows.map((r) => r.value));

  const responseSeconds = m?.tempoMedioRespostaSegundos ?? null;

  const cards: {
    label: string;
    value: number | string;
    hint: string;
    tone: MetricTone;
    icon: React.ReactNode;
    share?: number;
    emphasis?: boolean;
  }[] = [
    {
      label: "Conversas",
      value: m?.totals.conversations ?? 0,
      hint: "atendimentos iniciados pela IA",
      tone: "info",
      icon: <Users className="h-4 w-4" />,
      emphasis: true,
    },
    {
      label: "Conversão",
      value: `${(m?.totals.conversionRate ?? 0).toFixed(0)}%`,
      hint: `${m?.totals.converted ?? 0} leads convertidos`,
      tone: "brand",
      icon: <Target className="h-4 w-4" />,
      share: m?.totals.conversionRate ?? 0,
      emphasis: true,
    },
    {
      label: "Leads novos (30d)",
      value: m?.windows.month?.leads ?? 0,
      hint: "novos contatos no último mês",
      tone: "success",
      icon: <TrendingUp className="h-4 w-4" />,
      emphasis: true,
    },
    {
      label: "Tempo médio",
      value: formatResponseTime(responseSeconds),
      hint: "para responder um lead",
      tone: responseTimeTone(responseSeconds),
      icon: <Clock className="h-4 w-4" />,
    },
    {
      label: "Mensagens",
      value: m?.totals.messages ?? 0,
      hint: "trocadas com seus leads",
      tone: "warning",
      icon: <MessagesSquare className="h-4 w-4" />,
    },
    m?.agendaEnabled
      ? {
          label: "Agendamentos (mês)",
          value: m?.appointments.total ?? 0,
          hint: `${m?.appointments.completed ?? 0} compareceram · ${m?.appointments.noShow ?? 0} faltas`,
          tone: "brand",
          icon: <CalendarCheck className="h-4 w-4" />,
        }
      : {
          label: "Prob. média de fechar",
          value: m?.probConversaoMedia != null ? `${Math.round(m.probConversaoMedia)}%` : "—",
          hint: "média dos leads analisados pela IA",
          tone: "brand",
          icon: <Percent className="h-4 w-4" />,
          share: m?.probConversaoMedia ?? undefined,
        },
  ];

  return (
    <main className="mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Visão geral"
        subtitle={
          m?.agentConnected
            ? "sua IA atendendo no WhatsApp · dados atualizados a cada minuto"
            : "acompanhe os resultados da sua IA no WhatsApp"
        }
      />

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

          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cards.slice(0, 3).map((c) => (
              <StaggerItem key={c.label}>
                <MetricCard {...c} />
              </StaggerItem>
            ))}
          </Stagger>
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cards.slice(3).map((c) => (
              <StaggerItem key={c.label}>
                <MetricCard {...c} />
              </StaggerItem>
            ))}
          </Stagger>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="surface-depth surface-depth-hover">
              <CardHeader className="space-y-0.5 pb-3">
                <CardTitle className="text-sm">Temperatura dos leads</CardTitle>
                <p className="text-xs text-muted-foreground">quão perto de fechar cada lead está</p>
              </CardHeader>
              <CardContent className="h-56 md:h-64">
                <TemperatureDonut distribution={m?.temperatureDistribution} />
              </CardContent>
            </Card>

            <ChartCard
              title="Leads por dia"
              subtitle="últimos 14 dias"
              empty={leadsDaily.every((d) => d.value === 0)}
            >
              <BarChart data={leadsDaily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pgrad-leads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.gridStroke} vertical={false} strokeOpacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chart.axisTick, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Bar
                  dataKey="value"
                  name="Leads"
                  fill="url(#pgrad-leads)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={28}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Horários de pico"
              subtitle="quando os leads mais procuram — últimos 30 dias"
              empty={peakHours.every((p) => p.value === 0)}
            >
              <BarChart data={peakHours} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pgrad-hour" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-light)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--brand-light)" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.gridStroke} vertical={false} strokeOpacity={0.4} />
                <XAxis
                  dataKey="label"
                  interval={2}
                  tick={{ fill: chart.axisTick, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Bar
                  dataKey="value"
                  name="Mensagens"
                  fill="url(#pgrad-hour)"
                  radius={[6, 6, 2, 2]}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Volume mensal"
              subtitle="leads e conversões por mês"
              empty={monthly.length === 0}
            >
              <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chart.gridStroke} vertical={false} strokeOpacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chart.axisTick, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="leads"
                  name="Leads"
                  fill="var(--chart-2)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={22}
                  isAnimationActive={!reduce}
                />
                <Bar
                  dataKey="conversions"
                  name="Conversões"
                  fill="var(--brand)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={22}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>
          </div>

          <div className="grid gap-4 pb-4 lg:grid-cols-2">
            {/* Funil — barras horizontais simples, do primeiro contato ao fechamento. */}
            <Card className="surface-depth surface-depth-hover">
              <CardHeader className="space-y-0.5 pb-3">
                <CardTitle className="text-sm">Funil de atendimento</CardTitle>
                <p className="text-xs text-muted-foreground">
                  onde seus leads estão, do primeiro contato ao fechamento
                </p>
              </CardHeader>
              <CardContent>
                {funnelRows.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/70">
                    <p className="text-xs text-muted-foreground">Ainda sem dados no período</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {funnelRows.map((r) => (
                      <li key={r.label}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {r.label}
                          </span>
                          <span className="text-xs font-semibold tabular-nums">{r.value}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{
                              width: `${(r.value / funnelMax) * 100}%`,
                              background: r.color,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="surface-depth surface-depth-hover">
              <CardHeader className="space-y-0.5 pb-3">
                <CardTitle className="text-sm">O que os clientes mais pedem</CardTitle>
                <p className="text-xs text-muted-foreground">
                  assuntos mais frequentes nas conversas
                </p>
              </CardHeader>
              <CardContent className="h-56 md:h-64">
                {topTopics.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70">
                    <p className="text-xs text-muted-foreground">Ainda sem dados suficientes</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topTopics} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid
                        stroke={chart.gridStroke}
                        horizontal={false}
                        strokeOpacity={0.4}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: chart.axisTick, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={84}
                        tick={{ fill: chart.axisTick, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                      <Bar
                        dataKey="value"
                        name="Pedidos"
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={!reduce}
                      >
                        {topTopics.map((t) => (
                          <Cell key={t.label} fill="var(--success)" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}

function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Card className="surface-depth surface-depth-hover">
      <CardHeader className="space-y-0.5 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-56 md:h-64">
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70">
            <p className="text-xs text-muted-foreground">Ainda sem dados no período</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
