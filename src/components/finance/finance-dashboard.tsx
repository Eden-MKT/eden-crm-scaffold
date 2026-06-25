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

import { BILLING_TYPE_MAP, type BillingType } from "@/lib/clients/billing-types";
import type { FinanceEntry } from "@/lib/finance/types";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import { useChartTheme } from "@/lib/charts/use-chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";

interface FinanceDashboardProps {
  entries: FinanceEntry[];
}

const BILLING_COLORS: Record<BillingType, string> = {
  avista: "#1F4FD6",
  recorrente: "#3AA0FF",
  parcelado: "#E0A52F",
};

export function FinanceDashboard({ entries }: FinanceDashboardProps) {
  const chart = useChartTheme();
  const reduce = useReducedMotion();

  const incomes = entries.filter((e) => e.kind === "income");
  const expenses = entries.filter((e) => e.kind === "expense");
  const sum = (list: FinanceEntry[]) => list.reduce((acc, e) => acc + e.amount, 0);

  const recebido = sum(incomes.filter((e) => e.status === "pago"));
  const aReceber = sum(incomes.filter((e) => e.status === "pendente" && !e.isRecurring));
  const mrr = sum(incomes.filter((e) => e.isRecurring));
  const despesaPaga = sum(expenses.filter((e) => e.status === "pago"));
  const despesaPendente = sum(expenses.filter((e) => e.status === "pendente"));
  const lucro = recebido - despesaPaga;

  const summary = [
    { title: "Recebido", value: recebido, accent: "#2FB67C" },
    { title: "A receber", value: aReceber, accent: "#3AA0FF" },
    { title: "Recorrente / mês (MRR)", value: mrr, accent: "#1F4FD6" },
    { title: "Despesas a pagar", value: despesaPendente, accent: "#E0A52F" },
    { title: "Lucro (recebido − pago)", value: lucro, accent: "#2FB67C" },
  ];

  const byBilling = (["avista", "recorrente", "parcelado"] as BillingType[]).map((b) => ({
    key: b,
    label: BILLING_TYPE_MAP[b].label,
    value: sum(incomes.filter((e) => e.billingType === b)),
    color: BILLING_COLORS[b],
  }));

  const compare = [
    { name: "Receitas", value: recebido + aReceber + mrr, color: "#2FB67C" },
    { name: "Despesas", value: despesaPaga + despesaPendente, color: "#E04F4F" },
  ];

  const upcoming = entries
    .filter((e) => e.status === "pendente" && e.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 6);

  const hasIncome = byBilling.some((b) => b.value > 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summary.map((s) => (
          <StaggerItem key={s.title}>
            <StatCard
              title={s.title}
              value={s.value}
              format={formatCurrencyBRL}
              accent={s.accent}
            />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="surface-depth">
          <CardHeader>
            <CardTitle className="text-sm">Receita por plano</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {hasIncome ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byBilling.filter((b) => b.value > 0)}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    isAnimationActive={!reduce}
                    animationDuration={700}
                  >
                    {byBilling
                      .filter((b) => b.value > 0)
                      .map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.color}
                          stroke={chart.cellStroke}
                          strokeWidth={2}
                        />
                      ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => formatCurrencyBRL(v)}
                    contentStyle={chart.tooltip}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </CardContent>
        </Card>

        <Card className="surface-depth">
          <CardHeader>
            <CardTitle className="text-sm">Receitas x Despesas</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compare} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: chart.axisLine }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: chart.axisLine }}
                  tickLine={false}
                  width={70}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  formatter={(v: number) => formatCurrencyBRL(v)}
                  contentStyle={chart.tooltip}
                  cursor={{ fill: chart.cursorFill }}
                />
                <Bar
                  dataKey="value"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!reduce}
                  animationDuration={700}
                >
                  {compare.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="surface-depth">
        <CardHeader>
          <CardTitle className="text-sm">Próximos vencimentos</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta pendente com vencimento.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((e) => {
                const overdue = (e.dueDate ?? "") < today;
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-md border border-border p-2 transition-colors hover:bg-accent/40"
                  >
                    <Badge variant={e.kind === "income" ? "success" : "warning"}>
                      {e.kind === "income" ? "Receber" : "Pagar"}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {e.description}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(e.dueDate ?? "")}
                      {overdue && " · atrasada"}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrencyBRL(e.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem receitas ainda. Cadastre um cliente com valor de contrato.
    </div>
  );
}
