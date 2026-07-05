import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, DollarSign, MessageSquare, Target, Wifi } from "lucide-react";

import {
  fetchAgentsWithClients,
  fetchWhatsappStats,
  whatsappKeys,
  type AgentWithClient,
} from "@/lib/whatsapp/queries";
import { StatCard } from "@/components/ui/stat-card";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { AgentCard } from "@/components/whatsapp/agent-card";
import { AgentHubDialog } from "@/components/whatsapp/agent-hub-dialog";

export const Route = createFileRoute("/ia-whatsapp")({
  head: () => ({
    meta: [
      { title: "IA WhatsApp — Éden Marketing CRM" },
      { name: "description", content: "Agentes de IA no WhatsApp." },
    ],
  }),
  component: IaWhatsappPage,
});

function IaWhatsappPage() {
  const { data: items } = useQuery({
    queryKey: whatsappKeys.agents(),
    queryFn: fetchAgentsWithClients,
  });
  const { data: stats } = useQuery({
    queryKey: whatsappKeys.stats(),
    queryFn: fetchWhatsappStats,
    refetchInterval: 30_000,
  });

  const [selected, setSelected] = useState<AgentWithClient | null>(null);

  const usd = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const cards = [
    {
      title: "Atendimentos hoje",
      value: stats?.attendancesToday ?? 0,
      accent: "#3AA0FF",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      title: "Mensagens hoje",
      value: stats?.messagesToday ?? 0,
      accent: "#1F4FD6",
      icon: <Bot className="h-4 w-4" />,
    },
    {
      title: "Custo do mês",
      value: usd(stats?.costMonth ?? 0),
      accent: "#E0A52F",
      icon: <DollarSign className="h-4 w-4" />,
    },
    {
      title: "Conversão",
      value: `${(stats?.conversionRate ?? 0).toFixed(0)}%`,
      accent: "#2FB67C",
      icon: <Target className="h-4 w-4" />,
    },
    {
      title: "Agentes conectados",
      value: stats?.connectedAgents ?? 0,
      accent: "#2FB67C",
      icon: <Wifi className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">IA WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Agentes de atendimento por IA no WhatsApp de cada cliente.
        </p>
      </div>

      <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <StaggerItem key={c.title}>
            <StatCard title={c.title} value={c.value} accent={c.accent} icon={c.icon} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {(items?.length ?? 0) === 0 ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Cadastre clientes para criar agentes de IA.
          </p>
        ) : (
          <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items?.map((item) => (
              <AgentCard key={item.client.id} item={item} onOpen={() => setSelected(item)} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <AgentHubDialog
          item={selected}
          open={selected !== null}
          onOpenChange={(o) => !o && setSelected(null)}
        />
      )}
    </div>
  );
}
