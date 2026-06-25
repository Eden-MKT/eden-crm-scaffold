import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { clientsKeys, fetchClients } from "@/lib/clients/queries";
import type { Client } from "@/lib/clients/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/ui/fade-in";
import { ClientKanban } from "@/components/clients/client-kanban";
import { ClientDashboard } from "@/components/clients/client-dashboard";
import { CreateClientDialog } from "@/components/clients/create-client-dialog";
import { ClientProfileDrawer } from "@/components/clients/client-profile-drawer";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Éden Marketing CRM" },
      { name: "description", content: "Gerenciamento de clientes da agência." },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const {
    data: clients,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: clientsKeys.list(), queryFn: fetchClients });

  const [selected, setSelected] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openClient = (client: Client) => {
    setSelected(client);
    setDrawerOpen(true);
  };

  const list = clients ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gestão de clientes da Éden Marketing.</p>
        </div>
        <CreateClientDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando clientes…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar clientes: {error instanceof Error ? error.message : "tente novamente."}
        </p>
      )}

      {!isLoading && !isError && (
        <Tabs defaultValue="kanban" className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="kanban">Quadro de Clientes</TabsTrigger>
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
