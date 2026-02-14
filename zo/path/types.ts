/**
 * Path Types
 *
 * Type definitions for the path generation and visualization module.
 *
 * @module zo/path/types
 */

import type { SprintStatus, MilestoneStatus } from "../project-tab/types.js";

// ============================================================================
// Path Phase Types
// ============================================================================

/** Sprint in path context */
export interface PathSprint {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  taskCount: number;
}

/** Milestone in path context */
export interface PathMilestone {
  id: string;
  name: string;
  targetDate: string;
  status: MilestoneStatus;
}

/** Phase with computed properties for UI */
export interface PathPhase {
  id: string;
  name: string;
  description: string;
  clusterIds: string[];
  dependencies: string[];
  dependents: string[];
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  sprints: PathSprint[];
  milestones: PathMilestone[];
  riskCount: number;
}

// ============================================================================
// Path State Types
// ============================================================================

/** Complete path state */
export interface PathState {
  projectId: string;
  phases: PathPhase[];
  criticalPath: string[];
  totalDurationDays: number | null;
  hasScheduleConflicts: boolean;
}

/** Dependency graph for analysis */
export interface DependencyGraph {
  nodes: Map<string, PathPhase>;
  edges: Array<{ from: string; to: string }>;
}

/** Path generation options */
export interface PathGenerationOptions {
  defaultPhaseDurationDays?: number;
  autoSchedule?: boolean;
}

// ============================================================================
// Path Events
// ============================================================================

/** Path event types */
export type PathEvent =
  | { type: "phase_added"; phaseId: string }
  | { type: "phase_updated"; phaseId: string }
  | { type: "phase_removed"; phaseId: string }
  | { type: "dependency_added"; fromId: string; toId: string }
  | { type: "dependency_removed"; fromId: string; toId: string }
  | { type: "path_regenerated"; projectId: string };
