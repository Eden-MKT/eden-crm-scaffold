import { supabase } from "@/integrations/supabase/client";

export interface TaskCompletion {
  id: string;
  clientId: string;
  taskKey: string;
  completedAt: string;
  completedBy: string | null;
}

export const taskKeys = {
  all: ["client-tasks"] as const,
  byClient: (clientId: string) => [...taskKeys.all, clientId] as const,
};

function mapCompletion(row: {
  id: string;
  client_id: string;
  task_key: string;
  completed_at: string;
  completed_by: string | null;
}): TaskCompletion {
  return {
    id: row.id,
    clientId: row.client_id,
    taskKey: row.task_key,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
  };
}

export async function fetchTaskCompletions(clientId: string): Promise<TaskCompletion[]> {
  const { data, error } = await supabase
    .from("client_task_completions")
    .select("id, client_id, task_key, completed_at, completed_by")
    .eq("client_id", clientId);

  if (error) throw error;
  return (data ?? []).map(mapCompletion);
}

export async function fetchAllTaskCompletions(): Promise<TaskCompletion[]> {
  const { data, error } = await supabase
    .from("client_task_completions")
    .select("id, client_id, task_key, completed_at, completed_by");

  if (error) throw error;
  return (data ?? []).map(mapCompletion);
}

export async function completeTask(
  clientId: string,
  taskKey: string,
  completedBy?: string | null,
): Promise<void> {
  const { error } = await supabase.from("client_task_completions").insert({
    client_id: clientId,
    task_key: taskKey,
    completed_by: completedBy ?? null,
  });

  if (error) throw error;
}

export async function uncompleteTask(clientId: string, taskKey: string): Promise<void> {
  const { error } = await supabase
    .from("client_task_completions")
    .delete()
    .eq("client_id", clientId)
    .eq("task_key", taskKey);

  if (error) throw error;
}
