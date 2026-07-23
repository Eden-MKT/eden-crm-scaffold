import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { fetchPortalMetrics, portalKeys } from "@/lib/portal/queries";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { BottomTabBar, type BottomTabItem } from "@/components/layout/bottom-tab-bar";
import { PortalPanelDashboard } from "./portal-panel-dashboard";
import { PortalLeads } from "./portal-leads";
import { PortalFollowups } from "./portal-followups";
import { PortalAgenda } from "./portal-agenda";
import { PortalChat } from "./portal-chat";
import { PortalConfig } from "./portal-config";

type PortalView = "dashboard" | "leads" | "followups" | "agenda" | "chat" | "config";

const NAV: { key: PortalView; title: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", title: "Dashboard", icon: LayoutDashboard },
  { key: "leads", title: "Leads", icon: Users },
  { key: "followups", title: "Follow-ups", icon: CalendarClock },
  { key: "agenda", title: "Agenda", icon: CalendarDays },
  { key: "chat", title: "Chat & Histórico", icon: MessagesSquare },
  { key: "config", title: "Configurações", icon: Settings },
];

// Itens que ficam no drawer "Mais" da tab bar mobile.
const MORE_VIEWS: PortalView[] = ["agenda", "config"];

// Shell do portal do cliente — espelho visual do painel de gestão (sidebar
// desktop + tab bar mobile), travado nos dados do próprio cliente.
export function PortalHome() {
  const { signOut, user } = useAuth();
  const [view, setView] = useState<PortalView>("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);

  // Nome do cliente + gate da agenda (cache compartilhado com o dashboard).
  const { data } = useQuery({
    queryKey: portalKeys.metrics(),
    queryFn: fetchPortalMetrics,
  });
  const clientName = data?.client?.name ?? "Seu negócio";
  const agendaEnabled = data?.metrics?.agendaEnabled === true;

  // Agenda sempre visível — o toggle da IA controla só o agendamento automático.
  const nav = NAV;
  const moreItems = nav.filter((n) => MORE_VIEWS.includes(n.key));

  const userEmail = user?.email ?? "";
  const avatarUrl = (user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url;
  const initial = ((user?.user_metadata as { name?: string } | undefined)?.name || userEmail || "?")
    .charAt(0)
    .toUpperCase();

  const tabItems: BottomTabItem[] = [
    {
      key: "dashboard",
      title: "Dashboard",
      icon: LayoutDashboard,
      active: view === "dashboard",
      onSelect: () => setView("dashboard"),
    },
    {
      key: "leads",
      title: "Leads",
      icon: Users,
      active: view === "leads",
      onSelect: () => setView("leads"),
    },
    {
      key: "followups",
      title: "FUPs",
      icon: CalendarClock,
      active: view === "followups",
      onSelect: () => setView("followups"),
    },
    {
      key: "chat",
      title: "Chat",
      icon: MessagesSquare,
      active: view === "chat",
      onSelect: () => setView("chat"),
    },
    {
      key: "more",
      title: "Mais",
      icon: Menu,
      active: MORE_VIEWS.includes(view),
      onSelect: () => setMoreOpen(true),
    },
  ];

  return (
    <div className="app-bg flex h-[100dvh] w-full text-foreground">
      {/* Sidebar — só desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="/favicon-64x64.png" alt="Éden" className="h-8 w-8 rounded-md" />
          <div className="min-w-0 flex flex-col leading-tight">
            <span className="truncate font-semibold">{clientName}</span>
            <span className="text-xs text-muted-foreground">Painel IA</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => {
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                className={cn(
                  "relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-accent/20 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Avatar className="h-8 w-8 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{userEmail}</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => void signOut()}
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra fina: marca + título da view (mobile) e ações. */}
        <header className="ios-blur-bar flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <img
            src="/favicon-64x64.png"
            alt=""
            className="h-7 w-7 rounded-md md:hidden"
            aria-hidden
          />
          <p className="truncate text-sm font-semibold leading-tight md:hidden">
            {NAV.find((n) => n.key === view)?.title}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {view === "dashboard" && <PortalPanelDashboard />}
          {view === "leads" && <PortalLeads />}
          {view === "followups" && <PortalFollowups />}
          {view === "agenda" && <PortalAgenda />}
          {view === "chat" && <PortalChat />}
          {view === "config" && <PortalConfig />}
        </div>

        <BottomTabBar floating={false} className="md:hidden" items={tabItems} />
      </div>

      {/* Drawer "Mais" da tab bar mobile — agenda (quando ativa) + config. */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Mais opções</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-1 px-4 pb-8">
            {moreItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setView(item.key);
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                  view === item.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.title}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
