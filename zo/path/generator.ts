/**
 * Path Generator
 *
 * Generates phases from constellation clusters.
 *
 * @module zo/path/generator
 */

import type { Cluster } from "../project-tab/types.js";
import type { PathPhase, PathGenerationOptions } from "./types.js";

/**
 * Generate phases from constellation clusters.
 *
 * Strategy:
 * 1. Each cluster becomes a candidate phase
 * 2. Cluster connections become phase dependencies
 * 3. Clusters with no connections become independent phases
 */
export function generatePhasesFromClusters(
  clusters: Cluster[],
  options: PathGenerationOptions = {}
): PathPhase[] {
  const defaultDuration = options.defaultPhaseDurationDays ?? 14;

  return clusters.map((cluster) => ({
    id: `phase-${cluster.id}`,
    name: cluster.name,
    description: cluster.theme,
    clusterIds: [cluster.id],
    dependencies: cluster.connections.map((c) => `phase-${c.targetClusterId}`),
    dependents: [],
    startDate: null,
    endDate: null,
    durationDays: defaultDuration,
    sprints: [],
    milestones: [],
    riskCount: 0,
  }));
}

/**
 * Compute dependents (reverse dependencies).
 */
export function computeDependents(phases: PathPhase[]): void {
  const dependentsMap = new Map<string, string[]>();

  for (const phase of phases) {
    dependentsMap.set(phase.id, []);
  }

  for (const phase of phases) {
    for (const depId of phase.dependencies) {
      const arr = dependentsMap.get(depId);
      if (arr) arr.push(phase.id);
    }
  }

  for (const phase of phases) {
    phase.dependents = dependentsMap.get(phase.id) ?? [];
  }
}

/**
 * Auto-schedule phases based on dependencies.
 * Uses forward pass scheduling from project start.
 */
export function autoSchedulePhases(
  phases: PathPhase[],
  projectStartDate: string
): void {
  const sorted = topologicalSortForScheduling(phases);
  const start = new Date(projectStartDate);
  const phaseEndDates = new Map<string, Date>();

  for (const phase of sorted) {
    let phaseStart = new Date(start);

    for (const depId of phase.dependencies) {
      const depEnd = phaseEndDates.get(depId);
      if (depEnd && depEnd > phaseStart) {
        phaseStart = new Date(depEnd);
      }
    }

    phase.startDate = phaseStart.toISOString().split("T")[0];
    const phaseEnd = new Date(phaseStart);
    phaseEnd.setDate(phaseEnd.getDate() + (phase.durationDays ?? 14));
    phase.endDate = phaseEnd.toISOString().split("T")[0];

    phaseEndDates.set(phase.id, phaseEnd);
  }
}

/**
 * Topological sort for scheduling.
 */
function topologicalSortForScheduling(phases: PathPhase[]): PathPhase[] {
  const visited = new Set<string>();
  const result: PathPhase[] = [];
  const phaseMap = new Map(phases.map((p) => [p.id, p]));

  function visit(phase: PathPhase): void {
    if (visited.has(phase.id)) return;
    visited.add(phase.id);

    for (const depId of phase.dependencies) {
      const dep = phaseMap.get(depId);
      if (dep) visit(dep);
    }
    result.push(phase);
  }

  for (const phase of phases) {
    visit(phase);
  }

  return result;
}
