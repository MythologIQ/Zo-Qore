/**
 * Constellation Types Tests
 *
 * Type validation and default value tests.
 */

import { describe, it, expect } from "vitest";
import type {
  ConstellationView,
  ViewportState,
  HierarchicalCluster,
  SpatialCluster,
  ConstellationState,
  ConstellationEvent,
} from "../zo/constellation/types.js";

describe("constellation.types", () => {
  describe("ConstellationView", () => {
    it("accepts 'hierarchical' as a valid view", () => {
      const view: ConstellationView = "hierarchical";
      expect(view).toBe("hierarchical");
    });

    it("accepts 'spatial' as a valid view", () => {
      const view: ConstellationView = "spatial";
      expect(view).toBe("spatial");
    });
  });

  describe("ViewportState", () => {
    it("creates a valid viewport state", () => {
      const viewport: ViewportState = {
        x: 100,
        y: 200,
        scale: 1.5,
        velocityX: 10,
        velocityY: -5,
      };
      expect(viewport.x).toBe(100);
      expect(viewport.y).toBe(200);
      expect(viewport.scale).toBe(1.5);
    });

    it("allows zero velocities", () => {
      const viewport: ViewportState = {
        x: 0,
        y: 0,
        scale: 1,
        velocityX: 0,
        velocityY: 0,
      };
      expect(viewport.velocityX).toBe(0);
      expect(viewport.velocityY).toBe(0);
    });
  });

  describe("HierarchicalCluster", () => {
    it("creates a valid hierarchical cluster", () => {
      const cluster: HierarchicalCluster = {
        id: "cluster-1",
        name: "Authentication",
        theme: "User identity management",
        thoughtIds: ["t1", "t2", "t3"],
        coherenceScore: 0.85,
        isExpanded: false,
        connections: ["cluster-2"],
      };
      expect(cluster.id).toBe("cluster-1");
      expect(cluster.thoughtIds).toHaveLength(3);
      expect(cluster.isExpanded).toBe(false);
    });

    it("allows empty connections array", () => {
      const cluster: HierarchicalCluster = {
        id: "cluster-2",
        name: "Isolated",
        theme: "No connections",
        thoughtIds: [],
        coherenceScore: 0.5,
        isExpanded: true,
        connections: [],
      };
      expect(cluster.connections).toHaveLength(0);
    });
  });

  describe("SpatialCluster", () => {
    it("creates a valid spatial cluster with position", () => {
      const cluster: SpatialCluster = {
        id: "cluster-1",
        name: "Core Features",
        theme: "Main functionality",
        thoughtIds: ["t1", "t2"],
        position: { x: 150, y: 300 },
        velocity: { x: 0, y: 0 },
        coherenceScore: 0.9,
        connections: [],
      };
      expect(cluster.position.x).toBe(150);
      expect(cluster.position.y).toBe(300);
    });

    it("allows non-zero velocity", () => {
      const cluster: SpatialCluster = {
        id: "cluster-2",
        name: "Moving",
        theme: "Animated",
        thoughtIds: [],
        position: { x: 0, y: 0 },
        velocity: { x: 5, y: -3 },
        coherenceScore: 0.7,
        connections: [],
      };
      expect(cluster.velocity.x).toBe(5);
      expect(cluster.velocity.y).toBe(-3);
    });
  });

  describe("ConstellationState", () => {
    it("creates a valid constellation state", () => {
      const state: ConstellationState = {
        projectId: "proj-1",
        view: "hierarchical",
        clusters: [],
        spatialClusters: [],
        thoughts: [],
        viewport: { x: 0, y: 0, scale: 1, velocityX: 0, velocityY: 0 },
        selectedClusterId: null,
        focusedClusterId: null,
      };
      expect(state.projectId).toBe("proj-1");
      expect(state.view).toBe("hierarchical");
      expect(state.selectedClusterId).toBeNull();
    });

    it("allows selected and focused cluster IDs", () => {
      const state: ConstellationState = {
        projectId: "proj-2",
        view: "spatial",
        clusters: [],
        spatialClusters: [],
        thoughts: [{ id: "t1", content: "Test", clusterId: "c1" }],
        viewport: { x: 100, y: 200, scale: 1, velocityX: 0, velocityY: 0 },
        selectedClusterId: "c1",
        focusedClusterId: "c1",
      };
      expect(state.selectedClusterId).toBe("c1");
      expect(state.focusedClusterId).toBe("c1");
    });
  });

  describe("ConstellationEvent", () => {
    it("creates view_changed event", () => {
      const event: ConstellationEvent = { type: "view_changed", view: "spatial" };
      expect(event.type).toBe("view_changed");
      if (event.type === "view_changed") {
        expect(event.view).toBe("spatial");
      }
    });

    it("creates cluster_expanded event", () => {
      const event: ConstellationEvent = { type: "cluster_expanded", clusterId: "c1" };
      expect(event.type).toBe("cluster_expanded");
    });

    it("creates clusters_merged event", () => {
      const event: ConstellationEvent = {
        type: "clusters_merged",
        sourceId: "c1",
        targetId: "c2",
      };
      expect(event.type).toBe("clusters_merged");
      if (event.type === "clusters_merged") {
        expect(event.sourceId).toBe("c1");
        expect(event.targetId).toBe("c2");
      }
    });
  });
});
