import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BottomTabItem {
  key: string;
  title: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}

interface BottomTabBarProps {
  items: BottomTabItem[];
  /** Classes extras no <nav> (ex.: md:hidden). */
  className?: string;
  /** true (default): flutuante fixo. false: em fluxo (rodapé de um flex column). */
  floating?: boolean;
}

// Tab bar inferior estilo iOS — genérica (CRM e portal).
export function BottomTabBar({ items, className, floating = true }: BottomTabBarProps) {
  return (
    <nav
      className={cn(floating ? "fixed inset-x-0 bottom-0 z-50" : "shrink-0", className)}
      aria-label="Navegação principal"
    >
      <div
        className={cn(
          "ios-blur-bar pb-safe",
          floating ? "mx-3 mb-3 rounded-2xl border shadow-lg" : "border-t",
        )}
      >
        <div className="flex items-stretch justify-around px-1 py-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onSelect}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "press-scale flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors",
                  item.active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", item.active && "stroke-[2.5px]")} />
                <span className="truncate text-[10px] font-medium leading-none">{item.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
