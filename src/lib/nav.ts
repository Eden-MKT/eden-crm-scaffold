import {
  Bot,
  Calendar,
  ChartColumn,
  LayoutDashboard,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: "/" | "/clientes" | "/agenda" | "/financeiro" | "/ia-whatsapp" | "/gestao";
  icon: LucideIcon;
}

export const MAIN_NAV: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Agenda", url: "/agenda", icon: Calendar },
  { title: "IA WhatsApp", url: "/ia-whatsapp", icon: Bot },
  { title: "Financeiro", url: "/financeiro", icon: Wallet },
  { title: "Gestão", url: "/gestao", icon: ChartColumn },
];

export function isNavActive(pathname: string, url: string): boolean {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}
