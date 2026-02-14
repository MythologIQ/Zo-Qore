/**
 * Kanban Types
 *
 * Type definitions for Kanban generation.
 *
 * @module zo/kanban/types
 */

import type { Task, TaskStatus, TaskAssignee } from "../project-tab/types.js";

/** Task draft for generation (before ID assignment) */
export type TaskDraft = Omit<Task, "id">;

/** Kanban generation options */
export interface KanbanGenerationOptions {
  defaultAssignee: TaskAssignee;
  tasksPerSprint: number;
}

/** Generated tasks with sprint assignments */
export interface GeneratedTasks {
  projectId: string;
  phaseId: string;
  tasks: TaskDraft[];
  sprintAssignments: Map<string, number[]>;
}

/** Task ordering score (higher = more connections = process first) */
export interface TaskOrderingScore {
  clusterId: string;
  connectionCount: number;
  hasRisks: boolean;
}
