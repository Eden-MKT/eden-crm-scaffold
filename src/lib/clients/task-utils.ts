import type { TaskCompletion } from "@/lib/clients/task-queries";

/** Mapa clientId → conjunto de task_keys concluídas. */
export function buildCompletionsMap(
  completions: TaskCompletion[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!map.has(c.clientId)) {
      map.set(c.clientId, new Set());
    }
    map.get(c.clientId)!.add(c.taskKey);
  }
  return map;
}
