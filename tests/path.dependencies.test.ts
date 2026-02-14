/**
 * Path Dependencies Tests
 *
 * Tests for dependency graph analysis.
 */

import { describe, it, expect } from "vitest";
import {
  buildDependencyGraph,
  detectCycles,
  findCriticalPath,
} from "../zo/path/dependencies.js";
import type { PathPhase } from "../zo/path/types.js";

describe("path.dependencies", () => {
  const mockPhases: PathPhase[] = [
    {
      id: "p1",
      name: "Phase 1",
      description: "Desc 1",
      clusterIds: ["c1"],
      dependencies: [],
      dependents: ["p2"],
      startDate: "2026-01-01",
      endDate: "2026-01-14",
      durationDays: 14,
      sprints: [],
      milestones: [],
      riskCount: 0,
    },
    {
      id: "p2",
      name: "Phase 2",
      description: "Desc 2",
      clusterIds: ["c2"],
      dependencies: ["p1"],
      dependents: [],
      startDate: "2026-01-15",
      endDate: "2026-01-28",
      durationDays: 14,
      sprints: [],
      milestones: [],
      riskCount: 0,
    },
  ];

  describe("buildDependencyGraph", () => {
    it("builds nodes from phases", () => {
      const graph = buildDependencyGraph(mockPhases);
      expect(graph.nodes.size).toBe(2);
    });

    it("builds edges from dependencies", () => {
      const graph = buildDependencyGraph(mockPhases);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({ from: "p1", to: "p2" });
    });

    it("handles empty phases", () => {
      const graph = buildDependencyGraph([]);
      expect(graph.nodes.size).toBe(0);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe("detectCycles", () => {
    it("returns empty array for acyclic graph", () => {
      const graph = buildDependencyGraph(mockPhases);
      const cycle = detectCycles(graph);
      expect(cycle).toHaveLength(0);
    });

    it("detects cycle in graph", () => {
      const cyclicPhases: PathPhase[] = [
        { ...mockPhases[0], dependencies: ["p2"] },
        { ...mockPhases[1], dependencies: ["p1"] },
      ];
      const graph = buildDependencyGraph(cyclicPhases);
      const cycle = detectCycles(graph);
      expect(cycle.length).toBeGreaterThan(0);
    });
  });

  describe("findCriticalPath", () => {
    it("returns critical path for linear graph", () => {
      const path = findCriticalPath(mockPhases);
      expect(path).toContain("p1");
      expect(path).toContain("p2");
    });

    it("returns empty array for empty input", () => {
      const path = findCriticalPath([]);
      expect(path).toHaveLength(0);
    });

    it("handles single phase", () => {
      const singlePhase = { ...mockPhases[0], dependents: [] };
      const path = findCriticalPath([singlePhase]);
      expect(path).toContain("p1");
    });
  });
});
