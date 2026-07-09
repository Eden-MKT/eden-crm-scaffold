import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Calendar, LogOut, MessagesSquare } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { fetchPortalMetrics, portalKeys } from "@/lib/portal/queries";
import { fetchPortalAgenda, portalAgendaKeys } from "@/lib/portal/agenda";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BottomTabBar, type BottomTabItem } from "@/components/layout/bottom-tab-bar";
import { PortalDashboard } from "./portal-dashboard";
import { PortalChat } from "./portal-chat";
import { PortalAgenda } from "./portal-agenda";

type View = "metrics" | "chat" | "agenda";

export function PortalHome() {
  const { signOut } = useAuth();
  const [view, setView] = useState<View>("metrics");

  // Nome do cliente para o cabeçalho (cache compartilhado com o dashboard).
  const { data } = useQuery({
    queryKey: portalKeys.metrics(),
    queryFn: fetchPortalMetrics,
  });
  const clientName = data?.client?.name ?? "Seu negócio";

  // Só mostra a aba Agenda quando o atendimento tem agenda ativa (mesma query da aba).
  const { data: agenda } = useQuery({
    queryKey: portalAgendaKeys.list(),
    queryFn: () => fetchPortalAgenda(),
  });
  const agendaEnabled = agenda?.agendaEnabled === true;

  const tabItems: BottomTabItem[] = [
    {
      key: "metrics",
      title: "Métricas",
      icon: BarChart3,
      active: view === "metrics",
      onSelect: () => setView("metrics"),
    },
    {
      key: "chat",
      title: "Histórico",
      icon: MessagesSquare,
      active: view === "chat",
      onSelect: () => setView("chat"),
    },
    ...(agendaEnabled
      ? [
          {
            key: "agenda",
            title: "Agenda",
            icon: Calendar,
            active: view === "agenda",
            onSelect: () => setView("agenda"),
          } satisfies BottomTabItem,
        ]
      : []),
  ];

  return (
    <div className="app-bg flex h-[100dvh] flex-col">
      <header className="ios-blur-bar flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <img src="/favicon-64x64.png" alt="Éden" className="h-7 w-7 rounded-md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{clientName}</p>
          <p className="text-xs text-muted-foreground">Portal · IA WhatsApp</p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Toggle no header — só desktop (no mobile vira tab bar embaixo). */}
          <div className="mr-1 hidden rounded-lg border border-border p-0.5 md:flex">
            <ToggleBtn
              active={view === "metrics"}
              onClick={() => setView("metrics")}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Métricas"
            />
            <ToggleBtn
              active={view === "chat"}
              onClick={() => setView("chat")}
              icon={<MessagesSquare className="h-4 w-4" />}
              label="Histórico"
            />
            {agendaEnabled && (
              <ToggleBtn
                active={view === "agenda"}
                onClick={() => setView("agenda")}
                icon={<Calendar className="h-4 w-4" />}
                label="Agenda"
              />
            )}
          </div>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {view === "metrics" && <PortalDashboard />}
        {view === "chat" && <PortalChat />}
        {view === "agenda" && <PortalAgenda />}
      </div>

      {/* Tab bar inferior estilo iOS — só mobile. */}
      <BottomTabBar floating={false} className="md:hidden" items={tabItems} />
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
