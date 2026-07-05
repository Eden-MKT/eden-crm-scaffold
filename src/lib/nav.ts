import { Bot, LayoutDashboard, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: "/" | "/clientes" | "/financeiro" | "/ia-whatsapp";
  icon: LucideIcon;
}

export const MAIN_NAV: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "IA WhatsApp", url: "/ia-whatsapp", icon: Bot },
  { title: "Financeiro", url: "/financeiro", icon: Wallet },
];

export function isNavActive(pathname: string, url: string): boolean {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}
