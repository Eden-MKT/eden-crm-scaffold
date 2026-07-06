import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { fetchFinanceEntries, financeKeys } from "@/lib/finance/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/ui/fade-in";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceDashboard } from "@/components/finance/finance-dashboard";
import { ExpenseManager } from "@/components/finance/expense-manager";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Éden Marketing CRM" },
      { name: "description", content: "Financeiro da Éden Marketing." },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const {
    data: entries,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: financeKeys.list(), queryFn: fetchFinanceEntries });

  const list = entries ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Receitas dos contratos, contas a receber e despesas da empresa."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando financeiro…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar: {error instanceof Error ? error.message : "tente novamente."}
        </p>
      )}

      {!isLoading && !isError && (
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard" className="shrink-0">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="despesas" className="shrink-0">
              Despesas da empresa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <FadeIn>
              <FinanceDashboard entries={list} />
            </FadeIn>
          </TabsContent>

          <TabsContent value="despesas">
            <FadeIn>
              <ExpenseManager scope="empresa" title="Despesas da empresa" />
            </FadeIn>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
