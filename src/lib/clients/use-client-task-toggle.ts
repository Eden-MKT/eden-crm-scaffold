import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import {
  completeTask,
  type TaskCompletion,
  taskKeys,
  uncompleteTask,
} from "@/lib/clients/task-queries";

export function useClientTaskToggle(clientId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskKey, done }: { taskKey: string; done: boolean }) => {
      if (done) {
        await uncompleteTask(clientId, taskKey);
      } else {
        await completeTask(clientId, taskKey, user?.email ?? null);
      }
    },
    onMutate: async ({ taskKey, done }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.byClient(clientId) });
      await queryClient.cancelQueries({ queryKey: taskKeys.all });

      const previousClient = queryClient.getQueryData<TaskCompletion[]>(
        taskKeys.byClient(clientId),
      );
      const previousAll = queryClient.getQueryData<TaskCompletion[]>(taskKeys.all);

      const patch = (list: TaskCompletion[]): TaskCompletion[] => {
        if (done) {
          return list.filter((c) => !(c.clientId === clientId && c.taskKey === taskKey));
        }
        if (list.some((c) => c.clientId === clientId && c.taskKey === taskKey)) {
          return list;
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
      };

      queryClient.setQueryData<TaskCompletion[]>(taskKeys.byClient(clientId), (old) =>
        patch(old ?? []),
      );
      queryClient.setQueryData<TaskCompletion[]>(taskKeys.all, (old) => patch(old ?? []));

      return { previousClient, previousAll };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousClient !== undefined) {
        queryClient.setQueryData(taskKeys.byClient(clientId), ctx.previousClient);
      }
      if (ctx?.previousAll !== undefined) {
        queryClient.setQueryData(taskKeys.all, ctx.previousAll);
      }
      toast.error("Não foi possível atualizar a tarefa.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.byClient(clientId) });
    },
  });
}
