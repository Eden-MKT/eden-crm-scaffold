import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { clientsKeys, fetchClients } from "@/lib/clients/queries";
import type { Client } from "@/lib/clients/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/ui/fade-in";
import { ClientKanban } from "@/components/clients/client-kanban";
import { ClientDashboard } from "@/components/clients/client-dashboard";
import { CreateClientDialog } from "@/components/clients/create-client-dialog";
import { ClientProfileDrawer } from "@/components/clients/client-profile-drawer";

type ClientesTab = "dashboard" | "kanban";

interface ClientesSearch {
  client?: string;
  tab?: ClientesTab;
}

export const Route = createFileRoute("/clientes")({
  validateSearch: (search: Record<string, unknown>): ClientesSearch => ({
    client: typeof search.client === "string" ? search.client : undefined,
    tab: search.tab === "kanban" || search.tab === "dashboard" ? search.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Clientes — Éden Marketing CRM" },
      { name: "description", content: "Gerenciamento de clientes da agência." },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const { client: clientIdFromUrl, tab: tabFromUrl } = Route.useSearch();
  const navigate = Route.useNavigate();

  const {
    data: clients,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: clientsKeys.list(), queryFn: fetchClients });

  const [selected, setSelected] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ClientesTab>(tabFromUrl ?? "kanban");

  const openClient = (client: Client) => {
    setSelected(client);
    setDrawerOpen(true);
  };

  const list = clients ?? [];

  // Deep link: /clientes?client=ID&tab=kanban
  useEffect(() => {
    if (!clientIdFromUrl || list.length === 0) return;
    const client = list.find((c) => c.id === clientIdFromUrl);
    if (!client) return;
    if (tabFromUrl) setActiveTab(tabFromUrl);
    openClient(client);
    navigate({ search: {}, replace: true });
  }, [clientIdFromUrl, tabFromUrl, list, navigate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gestão de clientes da Éden Marketing.</p>
        </div>
        <div className="w-full sm:w-auto">
          <CreateClientDialog />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando clientes…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar clientes: {error instanceof Error ? error.message : "tente novamente."}
        </p>
      )}

      {!isLoading && !isError && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ClientesTab)}
          className="space-y-6"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard" className="shrink-0">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="kanban" className="shrink-0">
              Quadro de Clientes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <FadeIn>
              <ClientDashboard clients={list} />
            </FadeIn>
          </TabsContent>

          <TabsContent value="kanban">
            <FadeIn>
              <ClientKanban clients={list} onCardClick={openClient} />
            </FadeIn>
          </TabsContent>
        </Tabs>
      )}

      <ClientProfileDrawer client={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
