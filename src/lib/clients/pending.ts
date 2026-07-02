import { tasksForStage } from "@/lib/clients/onboarding-tasks";
import type { Client } from "@/lib/clients/types";
import { isStageOwnedBy, STAGE_MAP, type Stage } from "@/lib/clients/stages";
import type { TaskCompletion } from "@/lib/clients/task-queries";
import type { TeamMember } from "@/lib/team";

export interface PendingClientItem {
  client: Client;
  stageLabel: string;
  completedCount: number;
  totalCount: number;
}

export function getPendingClientsForMember(
  clients: Client[],
  completions: TaskCompletion[],
  member: TeamMember,
): PendingClientItem[] {
  if (!member) return [];

  const completionsByClient = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!completionsByClient.has(c.clientId)) {
      completionsByClient.set(c.clientId, new Set());
    }
    completionsByClient.get(c.clientId)!.add(c.taskKey);
  }

  return clients
    .filter((client) => isStageOwnedBy(client.stage, member))
    .map((client) => {
      const stage = client.stage as Stage;
      const stageTasks = tasksForStage(stage);
      const totalCount = stageTasks.length;
      const done = completionsByClient.get(client.id) ?? new Set<string>();
      const completedCount = stageTasks.filter((t) => done.has(t.key)).length;

      return {
        client,
        stageLabel: STAGE_MAP[stage]?.label ?? stage,
        completedCount,
        totalCount,
      };
    });
}
