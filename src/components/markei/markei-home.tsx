import { useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Calendar,
  CalendarClock,
  ChartPie,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { resolveTeamMember, teamAvatarUrl } from "@/lib/team";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BottomTabBar, type BottomTabItem } from "@/components/layout/bottom-tab-bar";
import { MarkeiDashboard } from "./markei-dashboard";
import { MarkeiIas } from "./markei-ias";
import { MarkeiLeads } from "./markei-leads";
import { MarkeiFollowups } from "./markei-followups";
import { MarkeiAnalytics } from "./markei-analytics";
import { MarkeiChat } from "./markei-chat";
import { MarkeiAgenda } from "./markei-agenda";
import { MarkeiSettings } from "./markei-settings";
import { MarkeiMoreDrawer } from "./markei-more-drawer";

export type MarkeiView =
  | "dashboard"
  | "ias"
  | "leads"
  | "followups"
  | "agenda"
  | "analytics"
  | "chat"
  | "settings";

export const MARKEI_VIEWS: MarkeiView[] = [
  "dashboard",
  "ias",
  "leads",
  "followups",
  "agenda",
  "analytics",
  "chat",
  "settings",
];

const NAV: { key: MarkeiView; title: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", title: "Dashboard", icon: LayoutDashboard },
  { key: "ias", title: "Minhas IAs", icon: Bot },
  { key: "leads", title: "Leads", icon: Users },
  { key: "followups", title: "Follow-ups", icon: CalendarClock },
  { key: "agenda", title: "Agenda", icon: Calendar },
  { key: "analytics", title: "Analytics", icon: ChartPie },
  { key: "chat", title: "Chat & Histórico", icon: MessagesSquare },
  { key: "settings", title: "Configurações", icon: Settings },
];

const MORE_VIEWS: MarkeiView[] = ["ias", "agenda", "analytics", "settings"];

const routeApi = getRouteApi("/gestao");

// Shell do painel de gestão da Éden: sidebar própria (desktop) + tab bar
// (mobile). Somente visualização + interação limitada (chat, follow-ups, IA).
export function MarkeiHome() {
  const { signOut, user } = useAuth();
  const { view = "dashboard" } = routeApi.useSearch();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const setView = (next: MarkeiView) => {
    navigate({ to: "/gestao", search: { view: next }, replace: false });
  };

  const userName =
    (user?.user_metadata as { name?: string } | undefined)?.name ?? user?.email ?? "";

  const teamMember = resolveTeamMember(user?.email);
  const userAvatarUrl =
    (user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ||
    (teamMember ? teamAvatarUrl(teamMember) : undefined);

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
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-4 transition-opacity hover:opacity-80"
          title="Voltar ao CRM"
        >
          <img src="/favicon-64x64.png" alt="Éden" className="h-8 w-8 rounded-md" />
          <div className="flex flex-col leading-tight">
            <span className="font-semibold">Éden</span>
            <span className="text-xs text-muted-foreground">Dashboard IA</span>
          </div>
        </Link>
        <div className="px-3 pb-1">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao CRM
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => {
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
            {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt="" />}
            <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">
              {(userName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="min-w-0 truncate text-xs text-muted-foreground">{userName}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra fina só com marca (mobile) e ações — o título de cada view é
            responsabilidade da própria página, senão duplica. */}
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
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground md:hidden"
              title="Voltar ao CRM"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {view === "dashboard" && <MarkeiDashboard />}
          {view === "ias" && <MarkeiIas />}
          {view === "leads" && <MarkeiLeads />}
          {view === "followups" && <MarkeiFollowups />}
          {view === "agenda" && <MarkeiAgenda />}
          {view === "analytics" && <MarkeiAnalytics />}
          {view === "chat" && <MarkeiChat />}
          {view === "settings" && <MarkeiSettings />}
        </div>

        <BottomTabBar floating={false} className="md:hidden" items={tabItems} />
      </div>

      <MarkeiMoreDrawer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        active={view}
        onSelect={setView}
      />
    </div>
  );
}
