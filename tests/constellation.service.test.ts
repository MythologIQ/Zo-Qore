/**
 * Constellation Service Tests
 *
 * Service operation tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConstellationService } from "../zo/constellation/service.js";
import type { ConstellationState, ConstellationEvent } from "../zo/constellation/types.js";

// Mock DuckDBClient
const mockDb = {
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
};

describe("constellation.service", () => {
  let service: ConstellationService;
  let mockState: ConstellationState;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConstellationService(mockDb as any);
    mockState = {
      projectId: "proj-1",
      view: "hierarchical",
      clusters: [
        {
          id: "c1",
          name: "Cluster 1",
          theme: "Theme 1",
          thoughtIds: ["t1", "t2"],
          coherenceScore: 0.8,
          isExpanded: false,
          connections: [],
        },
        {
          id: "c2",
          name: "Cluster 2",
          theme: "Theme 2",
          thoughtIds: ["t3"],
          coherenceScore: 0.7,
          isExpanded: false,
          connections: [],
        },
      ],
      spatialClusters: [
        {
          id: "c1",
          name: "Cluster 1",
          theme: "Theme 1",
          thoughtIds: ["t1", "t2"],
          position: { x: 100, y: 100 },
          velocity: { x: 0, y: 0 },
          coherenceScore: 0.8,
          connections: [],
        },
        {
          id: "c2",
          name: "Cluster 2",
          theme: "Theme 2",
          thoughtIds: ["t3"],
          position: { x: 200, y: 200 },
          velocity: { x: 0, y: 0 },
          coherenceScore: 0.7,
          connections: [],
        },
      ],
      thoughts: [
        { id: "t1", content: "Thought 1", clusterId: "c1" },
        { id: "t2", content: "Thought 2", clusterId: "c1" },
        { id: "t3", content: "Thought 3", clusterId: "c2" },
      ],
      viewport: { x: 0, y: 0, scale: 1, velocityX: 0, velocityY: 0 },
      selectedClusterId: null,
      focusedClusterId: null,
    };
  });

  describe("onEvent", () => {
    it("registers event handler", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      service.switchView(mockState, "spatial");

      expect(handler).toHaveBeenCalledWith({ type: "view_changed", view: "spatial" });
    });

    it("returns unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = service.onEvent(handler);

      unsubscribe();
      service.switchView(mockState, "spatial");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("switchView", () => {
    it("changes view mode to spatial", () => {
      service.switchView(mockState, "spatial");
      expect(mockState.view).toBe("spatial");
    });

    it("changes view mode to hierarchical", () => {
      mockState.view = "spatial";
      service.switchView(mockState, "hierarchical");
      expect(mockState.view).toBe("hierarchical");
    });

    it("emits view_changed event", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      service.switchView(mockState, "spatial");

      expect(handler).toHaveBeenCalledWith({ type: "view_changed", view: "spatial" });
    });
  });

  describe("toggleCluster", () => {
    it("expands collapsed cluster", () => {
      service.toggleCluster(mockState, "c1");
      expect(mockState.clusters[0].isExpanded).toBe(true);
    });

    it("collapses expanded cluster", () => {
      mockState.clusters[0].isExpanded = true;
      service.toggleCluster(mockState, "c1");
      expect(mockState.clusters[0].isExpanded).toBe(false);
    });

    it("emits cluster_expanded event", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      service.toggleCluster(mockState, "c1");

      expect(handler).toHaveBeenCalledWith({ type: "cluster_expanded", clusterId: "c1" });
    });

    it("emits cluster_collapsed event", () => {
      mockState.clusters[0].isExpanded = true;
      const handler = vi.fn();
      service.onEvent(handler);

      service.toggleCluster(mockState, "c1");

      expect(handler).toHaveBeenCalledWith({ type: "cluster_collapsed", clusterId: "c1" });
    });

    it("does nothing for non-existent cluster", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      service.toggleCluster(mockState, "non-existent");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("focusCluster", () => {
    it("sets focused cluster ID", () => {
      service.focusCluster(mockState, "c1");
      expect(mockState.focusedClusterId).toBe("c1");
    });

    it("centers viewport on cluster", () => {
      service.focusCluster(mockState, "c1");
      expect(mockState.viewport.x).toBe(-100);
      expect(mockState.viewport.y).toBe(-100);
    });

    it("resets viewport velocity", () => {
      mockState.viewport.velocityX = 10;
      mockState.viewport.velocityY = 10;

      service.focusCluster(mockState, "c1");

      expect(mockState.viewport.velocityX).toBe(0);
      expect(mockState.viewport.velocityY).toBe(0);
    });

    it("emits cluster_focused event", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      service.focusCluster(mockState, "c1");

      expect(handler).toHaveBeenCalledWith({ type: "cluster_focused", clusterId: "c1" });
    });

    it("does nothing for non-existent cluster", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      service.focusCluster(mockState, "non-existent");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("mergeClusters", () => {
    beforeEach(() => {
      // Mock storage methods
      mockDb.queryOne.mockResolvedValue({
        id: "c1",
        project_id: "proj-1",
        name: "Cluster 1",
        description: "Theme 1",
        metadata: "{}",
      });
      mockDb.query.mockResolvedValue([]);
      mockDb.execute.mockResolvedValue(undefined);
    });

    it("merges thoughts into target cluster", async () => {
      await service.mergeClusters(mockState, "c1", "c2");
      expect(mockState.clusters[0].thoughtIds).toContain("t1");
      expect(mockState.clusters[0].thoughtIds).toContain("t2");
    });

    it("removes source cluster from state", async () => {
      await service.mergeClusters(mockState, "c1", "c2");
      expect(mockState.clusters.find((c) => c.id === "c1")).toBeUndefined();
      expect(mockState.spatialClusters.find((c) => c.id === "c1")).toBeUndefined();
    });

    it("emits clusters_merged event", async () => {
      const handler = vi.fn();
      service.onEvent(handler);

      await service.mergeClusters(mockState, "c1", "c2");

      expect(handler).toHaveBeenCalledWith({
        type: "clusters_merged",
        sourceId: "c1",
        targetId: "c2",
      });
    });
  });

  describe("createConnection", () => {
    beforeEach(() => {
      mockDb.execute.mockResolvedValue(undefined);
    });

    it("adds connection to source cluster", async () => {
      await service.createConnection(mockState, "c1", "c2");
      expect(mockState.clusters[0].connections).toContain("c2");
    });

    it("does not duplicate existing connection", async () => {
      mockState.clusters[0].connections = ["c2"];
      await service.createConnection(mockState, "c1", "c2");
      expect(mockState.clusters[0].connections.filter((c) => c === "c2")).toHaveLength(1);
    });

    it("emits connection_created event", async () => {
      const handler = vi.fn();
      service.onEvent(handler);

      await service.createConnection(mockState, "c1", "c2");

      expect(handler).toHaveBeenCalledWith({
        type: "connection_created",
        fromId: "c1",
        toId: "c2",
      });
    });
  });
});
