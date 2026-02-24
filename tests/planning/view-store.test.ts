import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createViewStore, ViewType } from "../../runtime/planning/ViewStore";
import type { RevealCluster, PathPhase } from "@mythologiq/qore-contracts";

describe("ViewStore", () => {
  let basePath: string;
  const projectId = "test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "view-store-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("write and read for reveal", () => {
    it("writes clusters data atomically", async () => {
      const store = createViewStore(basePath, projectId, "reveal");
      const clusters: { clusters: RevealCluster[] } = {
        clusters: [
          {
            clusterId: "cluster-1",
            projectId,
            label: "Test Cluster",
            thoughtIds: ["thought-1"],
            notes: "Test notes",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: "draft",
          },
        ],
      };

      const result = await store.write(clusters);

      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].label).toBe("Test Cluster");
    });

    it("reads clusters data", async () => {
      const store = createViewStore(basePath, projectId, "reveal");
      const clusters: { clusters: RevealCluster[] } = {
        clusters: [
          {
            clusterId: "cluster-1",
            projectId,
            label: "Test Cluster",
            thoughtIds: [],
            notes: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: "draft",
          },
        ],
      };

      await store.write(clusters);
      const result = await store.read<{ clusters: RevealCluster[] }>();

      expect(result).not.toBeNull();
      expect(result?.clusters).toHaveLength(1);
    });

    it("returns null when file doesn't exist", async () => {
      const store = createViewStore(basePath, projectId, "reveal");

      const result = await store.read();

      expect(result).toBeNull();
    });
  });

  describe("write and read for path", () => {
    it("writes phases data atomically", async () => {
      const store = createViewStore(basePath, projectId, "path");
      const phases: { phases: PathPhase[] } = {
        phases: [
          {
            phaseId: "phase-1",
            projectId,
            ordinal: 1,
            name: "Phase 1",
            objective: "Complete first objective",
            sourceClusterIds: ["cluster-1"],
            tasks: [],
            status: "planned",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const result = await store.write(phases);

      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].name).toBe("Phase 1");
    });

    it("reads phases data", async () => {
      const store = createViewStore(basePath, projectId, "path");
      const phases: { phases: PathPhase[] } = {
        phases: [
          {
            phaseId: "phase-1",
            projectId,
            ordinal: 1,
            name: "Phase 1",
            objective: "",
            sourceClusterIds: [],
            tasks: [],
            status: "planned",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      await store.write(phases);
      const result = await store.read<{ phases: PathPhase[] }>();

      expect(result).not.toBeNull();
      expect(result?.phases).toHaveLength(1);
    });
  });

  describe("exists", () => {
    it("returns false when data file doesn't exist", async () => {
      const store = createViewStore(basePath, projectId, "reveal");

      const result = await store.exists();

      expect(result).toBe(false);
    });

    it("returns true when data file exists", async () => {
      const store = createViewStore(basePath, projectId, "reveal");
      const clusters: { clusters: RevealCluster[] } = { clusters: [] };

      await store.write(clusters);
      const result = await store.exists();

      expect(result).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes view data", async () => {
      const store = createViewStore(basePath, projectId, "reveal");
      const clusters: { clusters: RevealCluster[] } = { clusters: [] };

      await store.write(clusters);
      await store.delete();

      const result = await store.exists();
      expect(result).toBe(false);
    });
  });

  describe("all view types", () => {
    it("handles reveal view type", async () => {
      const store = createViewStore(basePath, projectId, "reveal");
      expect(store).toBeDefined();
    });

    it("handles constellation view type", async () => {
      const store = createViewStore(basePath, projectId, "constellation");
      expect(store).toBeDefined();
    });

    it("handles path view type", async () => {
      const store = createViewStore(basePath, projectId, "path");
      expect(store).toBeDefined();
    });

    it("handles risk view type", async () => {
      const store = createViewStore(basePath, projectId, "risk");
      expect(store).toBeDefined();
    });

    it("handles autonomy view type", async () => {
      const store = createViewStore(basePath, projectId, "autonomy");
      expect(store).toBeDefined();
    });
  });

  describe("atomic write", () => {
    it("writes to temp file then renames", async () => {
      const store = createViewStore(basePath, projectId, "reveal");
      const data = { clusters: [] as RevealCluster[] };

      await store.write(data);

      const exists = await store.exists();
      expect(exists).toBe(true);
    });

    it("overwrites existing data", async () => {
      const store = createViewStore(basePath, projectId, "reveal");

      await store.write({ clusters: [] });
      await store.write({
        clusters: [
          {
            clusterId: "cluster-1",
            projectId,
            label: "New Cluster",
            thoughtIds: [],
            notes: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: "draft",
          },
        ],
      });

      const result = await store.read<{ clusters: RevealCluster[] }>();
      expect(result?.clusters).toHaveLength(1);
      expect(result?.clusters[0].label).toBe("New Cluster");
    });
  });
});
