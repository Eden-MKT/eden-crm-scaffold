import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { MouseEvent } from "react";

import { tasksForStage } from "@/lib/clients/onboarding-tasks";
import { STAGE_MAP, type Stage } from "@/lib/clients/stages";
import { fetchTaskCompletions, taskKeys } from "@/lib/clients/task-queries";
import { useClientTaskToggle } from "@/lib/clients/use-client-task-toggle";
import { cn } from "@/lib/utils";

interface ClientOnboardingChecklistProps {
  clientId: string;
  stage: Stage;
  variant?: "drawer" | "kanban";
  /** Usado no kanban com cache compartilhado do board. */
  completedKeys?: Set<string>;
}

export function ClientOnboardingChecklist({
  clientId,
  stage,
  variant = "drawer",
  completedKeys: completedKeysProp,
}: ClientOnboardingChecklistProps) {
  const tasks = tasksForStage(stage);
  const stageConfig = STAGE_MAP[stage];
  const isKanban = variant === "kanban";

  const { data: completions = [], isLoading } = useQuery({
    queryKey: taskKeys.byClient(clientId),
    queryFn: () => fetchTaskCompletions(clientId),
    enabled: !isKanban,
  });

  const completedKeys =
    completedKeysProp ?? new Set(completions.map((c) => c.taskKey));

  const toggleMutation = useClientTaskToggle(clientId);

  const handleToggle = (e: MouseEvent, taskKey: string, done: boolean) => {
    e.stopPropagation();
    toggleMutation.mutate({ taskKey, done });
  };

  if (tasks.length === 0) {
    if (isKanban) return null;
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma subtarefa definida para esta etapa.
      </p>
    );
  }

  const doneCount = tasks.filter((t) => completedKeys.has(t.key)).length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  if (isKanban) {
    return (
      <div
        className="border-t border-border/60 px-2 py-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
            {doneCount}/{tasks.length}
          </span>
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {tasks.map((task) => {
            const done = completedKeys.has(task.key);
            return (
              <li key={task.key}>
                <button
                  type="button"
                  disabled={toggleMutation.isPending}
                  onClick={(e) => handleToggle(e, task.key, done)}
                  className={cn(
                    "flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-snug transition-colors",
                    done
                      ? "text-muted-foreground line-through opacity-70"
                      : "text-foreground hover:bg-secondary/50",
                  )}
                  title={task.label}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {done && <Check className="h-2 w-2" />}
                  </span>
                  <span className="line-clamp-2">{task.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Checklist — {stageConfig?.label}</h3>
        <span className="text-xs text-muted-foreground">
          {doneCount}/{tasks.length}
        </span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando checklist…</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const done = completedKeys.has(task.key);
            return (
              <li key={task.key}>
                <button
                  type="button"
                  disabled={toggleMutation.isPending}
                  onClick={(e) => handleToggle(e, task.key, done)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    done
                      ? "border-border/50 bg-secondary/30 text-muted-foreground line-through"
                      : "border-border hover:bg-secondary/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {done && <Check className="h-3 w-3" />}
                  </span>
                  <span>{task.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
