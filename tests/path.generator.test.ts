/**
 * Path Generator Tests
 *
 * Tests for phase generation from constellation clusters.
 */

import { describe, it, expect } from "vitest";
import {
  generatePhasesFromClusters,
  computeDependents,
  autoSchedulePhases,
} from "../zo/path/generator.js";
import type { Cluster } from "../zo/project-tab/types.js";

describe("path.generator", () => {
  const mockClusters: Cluster[] = [
    {
      id: "c1",
      projectId: "proj-1",
      name: "Cluster 1",
      theme: "Theme 1",
      thoughtIds: ["t1", "t2"],
      connections: [{ targetClusterId: "c2", strength: 0.8 }],
    },
    {
      id: "c2",
      projectId: "proj-1",
      name: "Cluster 2",
      theme: "Theme 2",
      thoughtIds: ["t3"],
      connections: [],
    },
  ];

  describe("generatePhasesFromClusters", () => {
    it("generates phase for each cluster", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      expect(phases).toHaveLength(2);
    });

    it("uses cluster name and theme", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      expect(phases[0].name).toBe("Cluster 1");
      expect(phases[0].description).toBe("Theme 1");
    });

    it("derives dependencies from connections", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      expect(phases[0].dependencies).toContain("phase-c2");
    });

    it("applies default duration", () => {
      const phases = generatePhasesFromClusters(mockClusters, { defaultPhaseDurationDays: 7 });
      expect(phases[0].durationDays).toBe(7);
    });

    it("preserves cluster traceability", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      expect(phases[0].clusterIds).toContain("c1");
    });
  });

  describe("computeDependents", () => {
    it("computes reverse dependencies", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      computeDependents(phases);
      expect(phases[1].dependents).toContain("phase-c1");
    });

    it("handles phases with no dependents", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      computeDependents(phases);
      expect(phases[0].dependents).toHaveLength(0);
    });
  });

  describe("autoSchedulePhases", () => {
    it("schedules phases with forward pass", () => {
      const phases = generatePhasesFromClusters(mockClusters);
      computeDependents(phases);
      autoSchedulePhases(phases, "2026-01-01");

      expect(phases[0].startDate).toBeDefined();
      expect(phases[0].endDate).toBeDefined();
    });
  });
});
