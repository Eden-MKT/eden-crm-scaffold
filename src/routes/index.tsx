import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Éden Marketing CRM" },
      { name: "description", content: "Visão geral do CRM da Éden Marketing." },
    ],
  }),
  component: DashboardPage,
});

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Dashboard placeholder com cards vazios.
const cards = [
  { title: "Clientes ativos" },
  { title: "Novos este mês" },
  { title: "Campanhas em andamento" },
  { title: "Receita estimada" },
];

function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da operação da Éden Marketing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-primary">—</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
