import { Bot, Calendar, ChartPie, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { MarkeiView } from "./markei-home";

const ITEMS: { key: MarkeiView; title: string; icon: typeof Bot }[] = [
  { key: "ias", title: "Minhas IAs", icon: Bot },
  { key: "agenda", title: "Agenda", icon: Calendar },
  { key: "analytics", title: "Analytics", icon: ChartPie },
  { key: "settings", title: "Configurações", icon: Settings },
];

interface MarkeiMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: MarkeiView;
  onSelect: (view: MarkeiView) => void;
}

// Drawer "Mais" da tab bar mobile — itens que não cabem nas 5 abas.
export function MarkeiMoreDrawer({ open, onOpenChange, active, onSelect }: MarkeiMoreDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Mais opções</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-1 px-4 pb-8">
          {ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelect(item.key);
                onOpenChange(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                active === item.key
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
  );
}
