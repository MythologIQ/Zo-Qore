/**
 * Reveal Service Tests
 *
 * Tests for reveal service operations.
 *
 * @module tests/reveal.service.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import { RevealService } from "../zo/reveal/service";
import type { ClusterCandidate } from "../zo/genesis/types";
import type { RevealEvent } from "../zo/reveal/types";

describe("Reveal Service", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;
  let service: RevealService;

  const testProjectId = "test-project-reveal";
  const testSessionId = "test-session-reveal";

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");

    storage = new ProjectTabStorage(db);
    service = new RevealService(db);

    // Create test project
    await storage.createProject({
      id: testProjectId,
      name: "Test Project for Reveal",
      state: "REVEAL",
    });

    // Create test genesis session
    await storage.createGenesisSession({
      id: testSessionId,
      projectId: testProjectId,
      rawInput: "Test raw input for reveal testing",
    });

    // Create test thoughts
    await storage.createThought({
      id: "thought-1",
      sessionId: testSessionId,
      content: "First test thought",
    });
    await storage.createThought({
      id: "thought-2",
      sessionId: testSessionId,
      content: "Second test thought",
    });
    await storage.createThought({
      id: "thought-3",
      sessionId: testSessionId,
      content: "Third test thought",
    });
  });

  afterAll(async () => {
    db.close();
  });

  describe("loadRevealView", () => {
    it("loads reveal view from clustering results", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "cluster-1",
          thoughtIds: ["thought-1", "thought-2"],
          centroid: [0.1, 0.2],
          coherenceScore: 0.9,
          theme: "Testing",
          suggestedName: "Test Cluster",
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);

      expect(view.sessionId).toBe(testSessionId);
      expect(view.projectId).toBe(testProjectId);
      expect(view.state).toBe("interactive");
      expect(view.clusters).toHaveLength(1);
      expect(view.clusters[0].name).toBe("Test Cluster");
      expect(view.clusters[0].theme).toBe("Testing");
      expect(view.clusters[0].thoughtIds).toContain("thought-1");
      expect(view.clusters[0].thoughtIds).toContain("thought-2");
    });

    it("uses default name when suggestedName not provided", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "cluster-no-name",
          thoughtIds: ["thought-1"],
          centroid: [0.1],
          coherenceScore: 0.8,
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);

      expect(view.clusters[0].name).toBe("Cluster 1");
    });

    it("identifies outlier thoughts", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "cluster-partial",
          thoughtIds: ["thought-1"],
          centroid: [0.1],
          coherenceScore: 0.8,
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);

      // thought-2 and thought-3 should be outliers
      expect(view.outliers.length).toBeGreaterThanOrEqual(2);
      expect(view.outliers.some((t) => t.id === "thought-2")).toBe(true);
      expect(view.outliers.some((t) => t.id === "thought-3")).toBe(true);
    });

    it("throws for non-existent session", async () => {
      await expect(
        service.loadRevealView("non-existent-session", [])
      ).rejects.toThrow("Session not found");
    });
  });

  describe("renameCluster", () => {
    it("renames cluster and marks as edited", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "cluster-rename-test",
          thoughtIds: ["thought-1"],
          centroid: [0.1],
          coherenceScore: 0.8,
          suggestedName: "Original Name",
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);

      service.renameCluster(view, "cluster-rename-test", "New Name");

      expect(view.clusters[0].name).toBe("New Name");
      expect(view.clusters[0].isUserEdited).toBe(true);
    });
  });

  describe("moveThought", () => {
    it("moves thought between clusters", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "source-cluster",
          thoughtIds: ["thought-1"],
          centroid: [0.1],
          coherenceScore: 0.8,
        },
        {
          id: "target-cluster",
          thoughtIds: ["thought-2"],
          centroid: [0.2],
          coherenceScore: 0.8,
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);

      service.moveThought(view, "thought-1", "target-cluster");

      // Check thought moved
      const movedThought = view.thoughts.find((t) => t.id === "thought-1");
      expect(movedThought?.clusterId).toBe("target-cluster");

      // Check cluster thoughtIds updated
      const sourceCluster = view.clusters.find((c) => c.id === "source-cluster");
      const targetCluster = view.clusters.find((c) => c.id === "target-cluster");

      expect(sourceCluster?.thoughtIds).not.toContain("thought-1");
      expect(targetCluster?.thoughtIds).toContain("thought-1");
    });
  });

  describe("updatePosition", () => {
    it("updates cluster position", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "position-test-cluster",
          thoughtIds: ["thought-1"],
          centroid: [0.1],
          coherenceScore: 0.8,
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);
      const originalX = view.clusters[0].position.x;
      const originalY = view.clusters[0].position.y;

      service.updatePosition(view, "position-test-cluster", { x: 500, y: 300 });

      expect(view.clusters[0].position.x).toBe(500);
      expect(view.clusters[0].position.y).toBe(300);
      expect(view.clusters[0].position.x).not.toBe(originalX);
    });
  });

  describe("confirmOrganization", () => {
    it("persists clusters to storage", async () => {
      const candidates: ClusterCandidate[] = [
        {
          id: "persist-cluster-1",
          thoughtIds: ["thought-1"],
          centroid: [0.1],
          coherenceScore: 0.85,
          theme: "Persist Theme",
          suggestedName: "Persist Cluster",
        },
      ];

      const view = await service.loadRevealView(testSessionId, candidates);
      const persistedClusters = await service.confirmOrganization(view);

      expect(persistedClusters).toHaveLength(1);
      expect(persistedClusters[0].id).toBe("persist-cluster-1");
      expect(persistedClusters[0].name).toBe("Persist Cluster");

      // Verify project state updated
      const project = await storage.getProject(testProjectId);
      expect(project?.state).toBe("EXPLORING");
    });
  });

  describe("Event emission", () => {
    it("emits reveal_started event", async () => {
      const events: RevealEvent[] = [];
      service.onEvent((e) => events.push(e));

      await service.loadRevealView(testSessionId, []);

      expect(events.some((e) => e.type === "reveal_started")).toBe(true);
    });

    it("emits clusters_loaded event", async () => {
      const events: RevealEvent[] = [];
      service.onEvent((e) => events.push(e));

      const candidates: ClusterCandidate[] = [
        { id: "c1", thoughtIds: [], centroid: [], coherenceScore: 0.8 },
        { id: "c2", thoughtIds: [], centroid: [], coherenceScore: 0.8 },
      ];

      await service.loadRevealView(testSessionId, candidates);

      const loadedEvent = events.find((e) => e.type === "clusters_loaded");
      expect(loadedEvent).toBeDefined();
      if (loadedEvent?.type === "clusters_loaded") {
        expect(loadedEvent.clusterCount).toBe(2);
      }
    });

    it("emits cluster_renamed event", async () => {
      const events: RevealEvent[] = [];
      service.onEvent((e) => events.push(e));

      const view = await service.loadRevealView(testSessionId, [
        { id: "rename-event-test", thoughtIds: [], centroid: [], coherenceScore: 0.8 },
      ]);

      service.renameCluster(view, "rename-event-test", "Event Test Name");

      const renameEvent = events.find((e) => e.type === "cluster_renamed");
      expect(renameEvent).toBeDefined();
      if (renameEvent?.type === "cluster_renamed") {
        expect(renameEvent.clusterId).toBe("rename-event-test");
        expect(renameEvent.name).toBe("Event Test Name");
      }
    });

    it("allows unsubscribing from events", async () => {
      const events: RevealEvent[] = [];
      const unsubscribe = service.onEvent((e) => events.push(e));

      await service.loadRevealView(testSessionId, []);
      const countBefore = events.length;

      unsubscribe();

      await service.loadRevealView(testSessionId, []);
      expect(events.length).toBe(countBefore);
    });
  });
});
