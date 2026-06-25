import { STAGE_MAP, type Stage } from "@/lib/clients/stages";
import { cn } from "@/lib/utils";

interface StageBadgeProps {
  stage: Stage;
  className?: string;
}

// Indicador da etapa com a cor da etapa (ponto + label).
export function StageBadge({ stage, className }: StageBadgeProps) {
  const config = STAGE_MAP[stage];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} />
      {config.short}
    </span>
  );
}
