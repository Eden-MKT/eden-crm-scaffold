import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Repeat, UserPlus, Users, Wallet } from "lucide-react";

import { PendingTasksSection } from "@/components/dashboard/pending-tasks-section";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { StatCard } from "@/components/ui/stat-card";
import { clientsKeys, fetchClients } from "@/lib/clients/queries";
import { fetchAllTaskCompletions, taskKeys } from "@/lib/clients/task-queries";
import { ACTIVE_STAGES } from "@/lib/clients/stages";
import { fetchFinanceEntries, financeKeys } from "@/lib/finance/queries";
import { formatCurrencyBRL } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useTeamMember } from "@/lib/team";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Éden Marketing CRM" },
      { name: "description", content: "Visão geral do CRM da Éden Marketing." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const member = useTeamMember();
  const { data: clients } = useQuery({
    queryKey: clientsKeys.list(),
    queryFn: fetchClients,
  });
  const { data: entries } = useQuery({
    queryKey: financeKeys.list(),
    queryFn: fetchFinanceEntries,
  });
  const { data: completions } = useQuery({
    queryKey: taskKeys.all,
    queryFn: fetchAllTaskCompletions,
  });

  const list = clients ?? [];
  const fin = entries ?? [];
  const now = new Date();

  const ativos = list.filter((c) => ACTIVE_STAGES.includes(c.stage)).length;
  const novosMes = list.filter((c) => {
    const d = new Date(c.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const contratado = fin.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
  const mrr = fin
    .filter((e) => e.kind === "income" && e.isRecurring)
    .reduce((s, e) => s + e.amount, 0);

  const cards = [
    {
      title: "Clientes ativos",
      value: ativos,
      accent: "#2FB67C",
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: "Novos este mês",
      value: novosMes,
      accent: "#3AA0FF",
      icon: <UserPlus className="h-4 w-4" />,
    },
    {
      title: "Valor em contratos",
      value: contratado,
      format: formatCurrencyBRL,
      accent: "#1F4FD6",
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      title: "Recorrente / mês",
      value: mrr,
      format: formatCurrencyBRL,
      accent: "#E0A52F",
      icon: <Repeat className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação da Éden Marketing.</p>
      </div>

      <PendingTasksSection
        clients={list}
        completions={completions ?? []}
        member={member}
        loggedInEmail={user?.email}
      />

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <StaggerItem key={c.title}>
            <StatCard
              title={c.title}
              value={c.value}
              format={c.format}
              accent={c.accent}
              icon={c.icon}
            />
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
