/**
 * Kanban Generator
 *
 * Generates task drafts from path phases.
 *
 * @module zo/kanban/generator
 */

import type { PathPhase } from "../path/types.js";
import type { Cluster, TaskStatus, TaskAssignee } from "../project-tab/types.js";
import type { TaskDraft, KanbanGenerationOptions, TaskOrderingScore } from "./types.js";

const DEFAULT_OPTIONS: KanbanGenerationOptions = {
  defaultAssignee: "agent",
  tasksPerSprint: 5,
};

/**
 * Generate task drafts from path phases.
 * Tasks are ordered by cluster connection count (high first).
 */
export function generateTasksFromPhase(
  phase: PathPhase,
  clusters: Cluster[],
  projectId: string,
  options: Partial<KanbanGenerationOptions> = {}
): TaskDraft[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tasks: TaskDraft[] = [];

  const orderedClusterIds = orderClustersByConnections(phase.clusterIds, clusters);

  for (const clusterId of orderedClusterIds) {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) continue;

    tasks.push({
      projectId,
      phaseId: phase.id,
      clusterId,
      title: `Implement: ${cluster.name}`,
      description: `Work derived from cluster: ${cluster.theme}`,
      dependencies: [],
      status: "pending" as TaskStatus,
      assignee: opts.defaultAssignee,
      guardrailIds: [],
    });
  }

  return tasks;
}

/**
 * Order cluster IDs by connection count (descending).
 */
export function orderClustersByConnections(
  clusterIds: string[],
  clusters: Cluster[]
): string[] {
  const scores: TaskOrderingScore[] = clusterIds.map((id) => {
    const cluster = clusters.find((c) => c.id === id);
    return {
      clusterId: id,
      connectionCount: cluster?.connections.length ?? 0,
      hasRisks: false,
    };
  });

  scores.sort((a, b) => b.connectionCount - a.connectionCount);
  return scores.map((s) => s.clusterId);
}

/**
 * Distribute tasks across sprints evenly.
 */
export function assignTasksToSprints(
  taskCount: number,
  sprints: PathPhase["sprints"],
  tasksPerSprint: number = 5
): Map<string, number[]> {
  const assignments = new Map<string, number[]>();
  if (sprints.length === 0 || taskCount === 0) return assignments;

  let currentSprint = 0;
  let currentCount = 0;

  for (let i = 0; i < taskCount; i++) {
    if (currentCount >= tasksPerSprint && currentSprint < sprints.length - 1) {
      currentSprint++;
      currentCount = 0;
    }

    const sprintId = sprints[currentSprint].id;
    const existing = assignments.get(sprintId) ?? [];
    existing.push(i);
    assignments.set(sprintId, existing);
    currentCount++;
  }

  return assignments;
}
