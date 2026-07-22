import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "motion/react";
import {
  Bot,
  CalendarClock,
  Clock,
  Flame,
  MessagesSquare,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import type { Period } from "@/lib/markei/types";
import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard, type MetricTone } from "./metric-card";
import { PeriodSelect } from "./period-select";
import { TemperatureDonut } from "./temperature-donut";

function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

function formatResponseTime(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}min`;
}

// Tom do tempo de resposta: rápido é bom, lento vira alerta.
function responseTimeTone(seconds: number | null): MetricTone {
  if (seconds == null) return "brand";
  if (seconds <= 60) return "success";
  if (seconds <= 120) return "warning";
  return "danger";
}

// Faixas do volume horário: <10h, 10-12, 12-14, 14-16, 16-18, ≥18h.
const HOUR_BUCKETS = [
  { label: "<10h", test: (h: number) => h < 10 },
  { label: "10-12h", test: (h: number) => h >= 10 && h < 12 },
  { label: "12-14h", test: (h: number) => h >= 12 && h < 14 },
  { label: "14-16h", test: (h: number) => h >= 14 && h < 16 },
  { label: "16-18h", test: (h: number) => h >= 16 && h < 18 },
  { label: "≥18h", test: (h: number) => h >= 18 },
];

// Visão geral agregada de todos os médicos — espelho do dashboard de referência.
export function MarkeiDashboard() {
  const chart = useChartTheme();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("all");

  const {
    data: m,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: markeiKeys.metrics(period),
    queryFn: () => fetchMarkeiMetrics(period),
    refetchInterval: 60_000,
  });

  const leadsDaily = (m?.leadsDaily ?? []).map((d) => ({
    label: dayLabel(d.day),
    value: d.count,
  }));

  const hourBuckets = HOUR_BUCKETS.map((b) => ({
    label: b.label,
    value: (m?.peakHours ?? []).filter((p) => b.test(p.hour)).reduce((s, p) => s + p.count, 0),
  }));

  const byAgent = [...(m?.porAgente ?? [])]
    .sort((a, b) => b.conversas - a.conversas)
    .map((a) => ({ label: a.nome, conversas: a.conversas }));

  const fupPendentes =
    (m?.followupStats?.s0 ?? 0) + (m?.followupStats?.s1 ?? 0) + (m?.followupStats?.s2 ?? 0);
  const hotLeads = m?.temperatureDistribution?.hot ?? 0;
  const conversas = m?.conversas ?? 0;

  const responseSeconds = m?.tempoMedioRespostaSegundos ?? null;

  const iasAtivas = m?.ias.ativas ?? 0;
  const iasTotal = m?.ias.total ?? 0;

  // Os três primeiros são o resumo que importa (destaque); os demais dão apoio.
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
      value: conversas,
      hint: "atendimentos iniciados pela IA",
      tone: "info",
      icon: <Users className="h-4 w-4" />,
      emphasis: true,
    },
    {
      label: "Conversão",
      value: `${(m?.taxaConversao ?? 0).toFixed(0)}%`,
      hint: `${m?.conversoes ?? 0} leads convertidos`,
      tone: "brand",
      icon: <Target className="h-4 w-4" />,
      share: m?.taxaConversao ?? 0,
      emphasis: true,
    },
    {
      label: "Leads novos (30d)",
      value: m?.leadsNovos.month ?? 0,
      hint: `${m?.leadsNovos.day ?? 0} hoje · ${m?.leadsNovos.week ?? 0} na semana`,
      tone: "success",
      icon: <TrendingUp className="h-4 w-4" />,
      emphasis: true,
    },
    {
      label: "IAs ativas",
      value: iasAtivas,
      hint: `de ${iasTotal} no total`,
      tone: "brand",
      icon: <Bot className="h-4 w-4" />,
      share: iasTotal > 0 ? (iasAtivas / iasTotal) * 100 : 0,
    },
    {
      label: "Tempo médio",
      value: formatResponseTime(responseSeconds),
      hint: "para responder um lead (7d)",
      tone: responseTimeTone(responseSeconds),
      icon: <Clock className="h-4 w-4" />,
    },
    {
      label: "Mensagens",
      value: m?.mensagens ?? 0,
      hint: "trocadas no período",
      tone: "warning",
      icon: <MessagesSquare className="h-4 w-4" />,
    },
  ];

  return (
    <main className="mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Visão geral"
        subtitle={
          iasAtivas > 0
            ? `${iasAtivas} ${iasAtivas === 1 ? "IA atendendo" : "IAs atendendo"} · dados atualizados a cada minuto`
            : "Nenhuma IA ativa no momento"
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelect value={period} onChange={setPeriod} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: markeiKeys.all })}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", isFetching && "animate-spin")} />
              Atualizar
            </Button>
          </div>
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
          {/* Três métricas em destaque e três de apoio — o olho pega o resumo
              antes do detalhe, em vez de seis caixas de mesmo peso. */}
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
            <ChartCard
              title="Performance por IA"
              subtitle="conversas atendidas por agente"
              empty={byAgent.length === 0}
            >
              <BarChart data={byAgent} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-agent" x1="0" y1="0" x2="0" y2="1">
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
                <Bar
                  dataKey="conversas"
                  name="Conversas"
                  fill="url(#grad-agent)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={64}
                  isAnimationActive={!reduce}
                />
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

            <ChartCard
              title="Leads por dia"
              subtitle="últimos 14 dias"
              empty={leadsDaily.every((d) => d.value === 0)}
            >
              <BarChart data={leadsDaily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-leads" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#grad-leads)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={28}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Volume por horário"
              subtitle="quando os leads mais procuram — últimos 30 dias"
              empty={hourBuckets.every((b) => b.value === 0)}
            >
              <BarChart data={hourBuckets} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-hour" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-light)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--brand-light)" stopOpacity={0.45} />
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
                <Bar
                  dataKey="value"
                  name="Mensagens"
                  fill="url(#grad-hour)"
                  radius={[6, 6, 2, 2]}
                  maxBarSize={44}
                  isAnimationActive={!reduce}
                />
              </BarChart>
            </ChartCard>
          </div>

          <div className="grid gap-4 pb-4 sm:grid-cols-2">
            <FocusCard
              title="Follow-ups pendentes"
              value={fupPendentes}
              total={conversas}
              tone="var(--warning)"
              icon={<CalendarClock className="h-4 w-4" />}
              description="leads aguardando retorno automático da IA"
            />
            <FocusCard
              title="Leads quentes"
              value={hotLeads}
              total={conversas}
              tone="var(--destructive)"
              icon={<Flame className="h-4 w-4" />}
              description="alta chance de fechar — priorize o contato"
            />
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
  /** true quando não há dados — mostra uma mensagem em vez de eixos vazios. */
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

/**
 * Card de atenção: número grande, proporção sobre o total e a barra na cor do
 * assunto. Responde "quantos, de quantos, e o que fazer".
 */
function FocusCard({
  title,
  value,
  total,
  tone,
  icon,
  description,
}: {
  title: string;
  value: number;
  total: number;
  tone: string;
  icon: React.ReactNode;
  description: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card className="surface-depth surface-depth-hover">
      <CardHeader className="flex flex-row items-center gap-2.5 space-y-0 pb-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone }}
        >
          {icon}
        </span>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">
              de {total} · {pct}%
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct}%`, background: tone }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
