import { Link, useRouterState } from "@tanstack/react-router";

import { isNavActive, MAIN_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden" aria-label="Navegação principal">
      <div className="ios-blur-bar mx-3 mb-3 rounded-2xl border pb-safe shadow-lg">
        <div className="flex items-stretch justify-around px-1 py-1.5">
          {MAIN_NAV.map((item) => {
            const active = isNavActive(pathname, item.url);
            const Icon = item.icon;
            return (
              <Link
                key={item.url}
                to={item.url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press-scale flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                <span className="truncate text-[10px] font-medium leading-none">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
