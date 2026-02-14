/**
 * Path Dependencies
 *
 * Dependency graph analysis utilities.
 *
 * @module zo/path/dependencies
 */

import type { PathPhase, DependencyGraph } from "./types.js";

/**
 * Build dependency graph from phases.
 */
export function buildDependencyGraph(phases: PathPhase[]): DependencyGraph {
  const nodes = new Map<string, PathPhase>();
  const edges: Array<{ from: string; to: string }> = [];

  for (const phase of phases) {
    nodes.set(phase.id, phase);
    for (const depId of phase.dependencies) {
      edges.push({ from: depId, to: phase.id });
    }
  }

  return { nodes, edges };
}

/**
 * Detect cycles in dependency graph.
 * Returns array of phase IDs forming a cycle, or empty if none.
 */
export function detectCycles(graph: DependencyGraph): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const id of graph.nodes.keys()) {
    color.set(id, WHITE);
    parent.set(id, null);
  }

  const adjacency = buildAdjacencyList(graph);

  for (const startId of graph.nodes.keys()) {
    if (color.get(startId) !== WHITE) continue;

    const cycle = dfsDetectCycle(startId, color, parent, adjacency);
    if (cycle.length > 0) return cycle;
  }

  return [];
}

function buildAdjacencyList(graph: DependencyGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const id of graph.nodes.keys()) {
    adjacency.set(id, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }
  return adjacency;
}

function dfsDetectCycle(
  nodeId: string,
  color: Map<string, number>,
  parent: Map<string, string | null>,
  adjacency: Map<string, string[]>
): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  color.set(nodeId, GRAY);

  for (const neighbor of adjacency.get(nodeId) ?? []) {
    if (color.get(neighbor) === GRAY) {
      return reconstructCycle(nodeId, neighbor, parent);
    }
    if (color.get(neighbor) === WHITE) {
      parent.set(neighbor, nodeId);
      const result = dfsDetectCycle(neighbor, color, parent, adjacency);
      if (result.length > 0) return result;
    }
  }

  color.set(nodeId, BLACK);
  return [];
}

function reconstructCycle(
  current: string,
  cycleStart: string,
  parent: Map<string, string | null>
): string[] {
  const cycle = [cycleStart];
  let curr = current;
  while (curr !== cycleStart) {
    cycle.unshift(curr);
    curr = parent.get(curr) ?? "";
  }
  return cycle;
}

/**
 * Find critical path (longest path through graph).
 */
export function findCriticalPath(phases: PathPhase[]): string[] {
  if (phases.length === 0) return [];

  const phaseMap = new Map(phases.map((p) => [p.id, p]));
  const distances = new Map<string, number>();
  const predecessors = new Map<string, string | null>();

  for (const phase of phases) {
    distances.set(phase.id, 0);
    predecessors.set(phase.id, null);
  }

  const sorted = topologicalSortForCriticalPath(phases);

  for (const phase of sorted) {
    const currentDist = distances.get(phase.id) ?? 0;
    const phaseDuration = phase.durationDays ?? 0;

    for (const depId of phase.dependents) {
      const newDist = currentDist + phaseDuration;
      if (newDist > (distances.get(depId) ?? 0)) {
        distances.set(depId, newDist);
        predecessors.set(depId, phase.id);
      }
    }
  }

  const endNodeId = findEndNode(phases, phaseMap, distances);
  return backtrackPath(endNodeId, predecessors);
}

function findEndNode(
  phases: PathPhase[],
  phaseMap: Map<string, PathPhase>,
  distances: Map<string, number>
): string | null {
  let maxDist = 0;
  let endNodeId: string | null = null;

  for (const [id, dist] of distances) {
    const phase = phaseMap.get(id);
    if (phase && phase.dependents.length === 0) {
      const totalDist = dist + (phase.durationDays ?? 0);
      if (totalDist > maxDist) {
        maxDist = totalDist;
        endNodeId = id;
      }
    }
  }

  return endNodeId;
}

function backtrackPath(
  endNodeId: string | null,
  predecessors: Map<string, string | null>
): string[] {
  const path: string[] = [];
  let curr = endNodeId;
  while (curr) {
    path.unshift(curr);
    curr = predecessors.get(curr) ?? null;
  }
  return path;
}

function topologicalSortForCriticalPath(phases: PathPhase[]): PathPhase[] {
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
