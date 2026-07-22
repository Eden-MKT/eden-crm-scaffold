import { useState } from "react";
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
  AlarmClock,
  CalendarCheck,
  CalendarClock,
  Clock,
  CircleOff,
  Hourglass,
  Percent,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import { FUNNEL_STEPS, type Period } from "@/lib/markei/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { MetricCard, type MetricTone } from "./metric-card";
import { PeriodSelect } from "./period-select";
import { TemperatureDonut } from "./temperature-donut";

// Progressão do funil em cor: começa no azul (contato frio) e caminha para o
// verde da marca (negócio fechado).
const FUNNEL_TONES = [
  "var(--chart-2)",
  "var(--warning)",
  "var(--brand-light)",
  "var(--success)",
  "var(--brand)",
];

// Fila de follow-up: quanto mais tempo esperando, mais quente o alerta.
const FUP_TILES: {
  key: "s0" | "s1" | "s2" | "s3";
  title: string;
  tone: string;
  icon: LucideIcon;
}[] = [
  { key: "s0", title: "Aguardando 1 hora", tone: "var(--chart-2)", icon: Clock },
  { key: "s1", title: "Aguardando 24 horas", tone: "var(--warning)", icon: Hourglass },
  { key: "s2", title: "Aguardando 48 horas", tone: "var(--destructive)", icon: AlarmClock },
  {
    key: "s3",
    title: "Tentativas esgotadas",
    tone: "var(--muted-foreground)",
    icon: CircleOff,
  },
];

function monthLabel(iso: string): string {
  const d = new Date(iso.length === 7 ? `${iso}-02T12:00:00` : iso);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(d);
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

// Analytics — visão analítica com filtro por IA e por período.
export function MarkeiAnalytics() {
  const chart = useChartTheme();
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<Period>("all");
  const [agentId, setAgentId] = useState<string>("all");

  // Lista de IAs para o filtro (não muda com o filtro de agente).
  const { data: base } = useQuery({
    queryKey: markeiKeys.metrics(),
    queryFn: () => fetchMarkeiMetrics(),
  });
  const agents = base?.porAgente ?? [];

  const {
    data: m,
    isLoading,
    isError,
  } = useQuery({
    queryKey: markeiKeys.metrics(period, agentId === "all" ? undefined : agentId),
    queryFn: () => fetchMarkeiMetrics(period, agentId === "all" ? undefined : agentId),
    refetchInterval: 60_000,
  });

  const fd = m?.funnelDistribution;
  const funnelData = fd
    ? [
        { label: FUNNEL_STEPS[0], value: fd.novoContato },
        { label: FUNNEL_STEPS[1], value: fd.emAtendimento },
        { label: FUNNEL_STEPS[2], value: fd.qualificado },
        { label: FUNNEL_STEPS[3], value: fd.agendado },
        { label: FUNNEL_STEPS[4], value: fd.convertido },
      ]
    : [];

  const monthly = (m?.monthlyVolume ?? []).map((v) => ({
    label: monthLabel(v.month),
    Leads: v.leads,
    Conversões: v.conversions,
  }));

  const appointments = (m?.appointmentsUpcoming ?? []).map((a) => ({
    label: dayLabel(a.day),
    value: a.count,
  }));

  const fupPendentes =
    (m?.followupStats.s0 ?? 0) + (m?.followupStats.s1 ?? 0) + (m?.followupStats.s2 ?? 0);
  const fupTotal = fupPendentes + (m?.followupStats.s3 ?? 0);

  const conversas = m?.conversas ?? 0;
  const agendadas = appointments.reduce((s, a) => s + a.value, 0);
  const probMedia = m?.probConversaoMedia ?? null;

  const agentName =
    agentId === "all" ? null : (agents.find((a) => a.agentId === agentId)?.nome ?? null);

  // Os três primeiros são o resumo do período; os demais explicam o detalhe.
  const kpis: {
    label: string;
    value: number | string;
    hint: string;
    tone: MetricTone;
    icon: React.ReactNode;
    share?: number;
    emphasis?: boolean;
  }[] = [
    {
      label: "Leads no período",
      value: conversas,
      hint: `${m?.leadsNovos.day ?? 0} chegaram hoje`,
      tone: "info",
      icon: <Users className="h-4 w-4" />,
      emphasis: true,
    },
    {
      label: "Conversão",
      value: `${(m?.taxaConversao ?? 0).toFixed(0)}%`,
      hint: `${m?.conversoes ?? 0} leads fecharam`,
      tone: "brand",
      icon: <Target className="h-4 w-4" />,
      share: m?.taxaConversao ?? 0,
      emphasis: true,
    },
    {
      label: "Chance média de fechar",
      value: probMedia != null ? `${Math.round(probMedia)}%` : "—",
      hint: "estimativa da IA para os leads abertos",
      tone: "warning",
      icon: <Percent className="h-4 w-4" />,
      share: probMedia ?? undefined,
      emphasis: true,
    },
    {
      label: "Novos nesta semana",
      value: m?.leadsNovos.week ?? 0,
      hint: `${m?.leadsNovos.month ?? 0} nos últimos 30 dias`,
      tone: "success",
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      label: "Follow-ups pendentes",
      value: fupPendentes,
      hint: "leads aguardando retorno da IA",
      tone: "warning",
      icon: <CalendarClock className="h-4 w-4" />,
      share: conversas > 0 ? (fupPendentes / conversas) * 100 : 0,
    },
    {
      label: "Avaliações marcadas",
      value: agendadas,
      hint: "confirmadas para os próximos dias",
      tone: "success",
      icon: <CalendarCheck className="h-4 w-4" />,
    },
  ];

  return (
    <main className="mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Analytics"
        subtitle={
          isLoading
            ? "Carregando os números do período…"
            : `${conversas} ${conversas === 1 ? "lead" : "leads"} no período · ${
                agentName ?? "todas as IAs"
              }`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="IA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as IAs</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.agentId} value={a.agentId}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PeriodSelect value={period} onChange={setPeriod} />
          </div>
        }
      />

      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      )}

      {isError && (
        <Card className="surface-depth">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">Não foi possível carregar os dados.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verifique a conexão e tente novamente em instantes.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (
        <>
          {/* Resumo do período em destaque, detalhe logo abaixo — o olho pega a
              leitura principal antes de entrar nos gráficos. */}
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.slice(0, 3).map((k) => (
              <StaggerItem key={k.label}>
                <MetricCard {...k} />
              </StaggerItem>
            ))}
          </Stagger>
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.slice(3).map((k) => (
              <StaggerItem key={k.label}>
                <MetricCard {...k} />
              </StaggerItem>
            ))}
          </Stagger>

          <div className="grid gap-4 pb-4 lg:grid-cols-2">
            <ChartCard
              title="Funil de conversão"
              subtitle="onde estão os leads, do primeiro contato ao fechamento"
              empty={funnelData.every((d) => d.value === 0)}
            >
              <BarChart
                data={funnelData}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
              >
                <defs>
                  {FUNNEL_TONES.map((tone, i) => (
                    <linearGradient key={i} id={`an-grad-funnel-${i}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={tone} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={tone} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke={chart.gridStroke} horizontal={false} strokeOpacity={0.4} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  tick={{ fill: chart.axisTick, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Bar
                  dataKey="value"
                  name="Leads"
                  radius={[2, 6, 6, 2]}
                  maxBarSize={26}
                  isAnimationActive={!reduce}
                >
                  {funnelData.map((entry, i) => (
                    <Cell key={entry.label} fill={`url(#an-grad-funnel-${i})`} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>

            <Card className="surface-depth surface-depth-hover">
              <CardHeader className="space-y-0.5 pb-3">
                <CardTitle className="text-sm">Temperatura dos leads</CardTitle>
                <p className="text-xs text-muted-foreground">quão perto de fechar cada lead está</p>
              </CardHeader>
              <CardContent className="h-56 md:h-64">
                <TemperatureDonut distribution={m?.temperatureDistribution} />
              </CardContent>
            </Card>

            <Card className="surface-depth surface-depth-hover">
              <CardHeader className="space-y-0.5 pb-3">
                <CardTitle className="text-sm">Fila de follow-up</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {fupTotal > 0
                    ? `${fupPendentes} de ${fupTotal} ainda podem receber retorno da IA`
                    : "há quanto tempo cada lead espera um retorno"}
                </p>
              </CardHeader>
              <CardContent>
                {fupTotal === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/70 px-4">
                    <p className="text-center text-xs text-muted-foreground">
                      Nenhum lead na fila. Assim que alguém parar de responder, a IA agenda o
                      retorno automaticamente.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {FUP_TILES.map((t) => {
                      const value = m?.followupStats[t.key] ?? 0;
                      const pct = fupTotal > 0 ? Math.round((value / fupTotal) * 100) : 0;
                      return (
                        <div key={t.key} className="rounded-lg border border-border/70 p-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                background: `color-mix(in oklab, ${t.tone} 18%, transparent)`,
                                color: t.tone,
                              }}
                            >
                              <t.icon className="h-3.5 w-3.5" />
                            </span>
                            <p className="min-w-0 truncate text-xs text-muted-foreground">
                              {t.title}
                            </p>
                          </div>
                          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-[width] duration-700"
                              style={{ width: `${pct}%`, background: t.tone }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <ChartCard
              title="Volume mensal"
              subtitle="leads que chegaram e quantos viraram cliente"
              empty={monthly.every((v) => v.Leads === 0 && v.Conversões === 0)}
            >
              <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="an-grad-leads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="an-grad-conv" x1="0" y1="0" x2="0" y2="1">
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
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursorFill }} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                  align="right"
                  verticalAlign="top"
                />
                <Bar
                  dataKey="Leads"
                  fill="url(#an-grad-leads)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={28}
                  isAnimationActive={!reduce}
                />
                <Bar
                  dataKey="Conversões"
                  fill="url(#an-grad-conv)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={28}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>

            <ChartCard
              className="lg:col-span-2"
              title="Avaliações agendadas"
              subtitle={
                agendadas > 0
                  ? `${agendadas} ${agendadas === 1 ? "avaliação confirmada" : "avaliações confirmadas"} para os próximos dias`
                  : "o que a agenda reserva para os próximos dias"
              }
              empty={appointments.length === 0 || appointments.every((a) => a.value === 0)}
              emptyLabel="Nenhuma avaliação marcada para os próximos dias"
            >
              <BarChart data={appointments} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="an-grad-appt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0.45} />
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
                  name="Avaliações"
                  fill="url(#an-grad-appt)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={36}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>
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
  emptyLabel = "Ainda sem dados no período",
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  /** true quando não há dados — mostra uma mensagem em vez de eixos vazios. */
  empty?: boolean;
  emptyLabel?: string;
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <Card className={cn("surface-depth surface-depth-hover", className)}>
      <CardHeader className="space-y-0.5 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-56 md:h-64">
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 px-4">
            <p className="text-center text-xs text-muted-foreground">{emptyLabel}</p>
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
