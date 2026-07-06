import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LogOut, MessagesSquare } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { fetchPortalMetrics, portalKeys } from "@/lib/portal/queries";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PortalDashboard } from "./portal-dashboard";
import { PortalChat } from "./portal-chat";

type View = "metrics" | "chat";

export function PortalHome() {
  const { signOut } = useAuth();
  const [view, setView] = useState<View>("metrics");

  // Nome do cliente para o cabeçalho (cache compartilhado com o dashboard).
  const { data } = useQuery({
    queryKey: portalKeys.metrics(),
    queryFn: fetchPortalMetrics,
  });
  const clientName = data?.client?.name ?? "Seu negócio";

  return (
    <div className="app-bg flex h-[100dvh] flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur-sm">
        <img src="/favicon-64x64.png" alt="Éden" className="h-7 w-7 rounded-md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{clientName}</p>
          <p className="text-xs text-muted-foreground">Portal · IA WhatsApp</p>
        </div>

        {/* Toggle Métricas | Histórico */}
        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 flex rounded-lg border border-border p-0.5">
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
          </div>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {view === "metrics" ? <PortalDashboard /> : <PortalChat />}
      </div>
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
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
