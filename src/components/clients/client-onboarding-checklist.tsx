import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { tasksForStage } from "@/lib/clients/onboarding-tasks";
import { STAGE_MAP, type Stage } from "@/lib/clients/stages";
import {
  completeTask,
  fetchTaskCompletions,
  taskKeys,
  uncompleteTask,
} from "@/lib/clients/task-queries";
import { cn } from "@/lib/utils";

interface ClientOnboardingChecklistProps {
  clientId: string;
  stage: Stage;
}

export function ClientOnboardingChecklist({ clientId, stage }: ClientOnboardingChecklistProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tasks = tasksForStage(stage);
  const stageConfig = STAGE_MAP[stage];

  const { data: completions = [], isLoading } = useQuery({
    queryKey: taskKeys.byClient(clientId),
    queryFn: () => fetchTaskCompletions(clientId),
  });

  const completedKeys = new Set(completions.map((c) => c.taskKey));

  const toggleMutation = useMutation({
    mutationFn: async ({ taskKey, done }: { taskKey: string; done: boolean }) => {
      if (done) {
        await uncompleteTask(clientId, taskKey);
      } else {
        await completeTask(clientId, taskKey, user?.email ?? null);
      }
    },
    onMutate: async ({ taskKey, done }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.byClient(clientId) });
      const previous = queryClient.getQueryData(taskKeys.byClient(clientId));
      queryClient.setQueryData(taskKeys.byClient(clientId), (old: typeof completions | undefined) => {
        const list = old ?? [];
        if (done) {
          return list.filter((c) => c.taskKey !== taskKey);
        }
        return [
          ...list,
          {
            id: `optimistic-${taskKey}`,
            clientId,
            taskKey,
            completedAt: new Date().toISOString(),
            completedBy: user?.email ?? null,
          },
        ];
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(taskKeys.byClient(clientId), ctx.previous);
      }
      toast.error("Não foi possível atualizar a tarefa.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma subtarefa definida para esta etapa.
      </p>
    );
  }

  const doneCount = tasks.filter((t) => completedKeys.has(t.key)).length;

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
                  onClick={() => toggleMutation.mutate({ taskKey: task.key, done })}
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
                      done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
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
