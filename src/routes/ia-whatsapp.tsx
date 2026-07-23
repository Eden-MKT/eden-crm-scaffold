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
import { PageHeader } from "@/components/ui/page-header";
import { AgentCard } from "@/components/whatsapp/agent-card";
import { AgentHubDialog } from "@/components/whatsapp/agent-hub-dialog";
import { DispatchPanel } from "@/components/dispatch/dispatch-panel";
import { cn } from "@/lib/utils";

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
  const [configOnly, setConfigOnly] = useState(false);
  const [view, setView] = useState<"agentes" | "disparador">("agentes");

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
    <div className="h-page-shell flex min-h-0 flex-col gap-4">
      <PageHeader
        title="IA WhatsApp"
        subtitle="Agentes de atendimento por IA no WhatsApp de cada cliente."
      />

      <div className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-1">
        {(["agentes", "disparador"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              view === v
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v === "agentes" ? "Agentes" : "Disparador"}
          </button>
        ))}
      </div>

      {view === "disparador" ? (
        <DispatchPanel />
      ) : (
        <>
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
              <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {items?.map((item) => (
                  <AgentCard
                    key={item.client.id}
                    item={item}
                    onOpen={() => {
                      setConfigOnly(false);
                      setSelected(item);
                    }}
                    onConfigure={() => {
                      setConfigOnly(true);
                      setSelected(item);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {selected && (
        <AgentHubDialog
          initialSub={configOnly ? "settings" : null}
          item={selected}
          open={selected !== null}
          onOpenChange={(o) => !o && setSelected(null)}
        />
      )}
    </div>
  );
}
