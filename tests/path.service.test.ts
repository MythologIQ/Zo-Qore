/**
 * Path Service Tests
 *
 * Tests for path service operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PathService } from "../zo/path/service.js";
import type { PathEvent } from "../zo/path/types.js";

// Mock DuckDBClient
const mockDb = {
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
};

describe("path.service", () => {
  let service: PathService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PathService(mockDb as any);
  });

  describe("onEvent", () => {
    it("registers event handler", async () => {
      const handler = vi.fn();
      service.onEvent(handler);

      mockDb.query.mockResolvedValue([]);
      await service.generatePath("proj-1");

      expect(handler).toHaveBeenCalledWith({ type: "path_regenerated", projectId: "proj-1" });
    });

    it("returns unsubscribe function", async () => {
      const handler = vi.fn();
      const unsubscribe = service.onEvent(handler);

      unsubscribe();
      mockDb.query.mockResolvedValue([]);
      await service.generatePath("proj-1");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("generatePath", () => {
    beforeEach(() => {
      mockDb.query.mockResolvedValue([]);
    });

    it("returns path state for project", async () => {
      const state = await service.generatePath("proj-1");
      expect(state.projectId).toBe("proj-1");
    });

    it("returns empty phases when no clusters", async () => {
      const state = await service.generatePath("proj-1");
      expect(state.phases).toHaveLength(0);
    });

    it("generates phases from clusters", async () => {
      mockDb.query.mockResolvedValueOnce([
        { id: "c1", project_id: "proj-1", name: "Cluster 1", description: "Theme 1", metadata: "{}" },
      ]);
      mockDb.query.mockResolvedValueOnce([]); // risks

      const state = await service.generatePath("proj-1");
      expect(state.phases).toHaveLength(1);
    });
  });

  describe("addDependency", () => {
    it("adds dependency and emits event", async () => {
      const handler = vi.fn();
      service.onEvent(handler);
      mockDb.execute.mockResolvedValue(undefined);

      await service.addDependency("p1", "p2");

      expect(handler).toHaveBeenCalledWith({ type: "dependency_added", fromId: "p1", toId: "p2" });
    });
  });

  describe("updatePhaseDates", () => {
    it("updates dates and emits event", async () => {
      const handler = vi.fn();
      service.onEvent(handler);
      mockDb.execute.mockResolvedValue(undefined);

      await service.updatePhaseDates("p1", "2026-01-01", "2026-01-14");

      expect(handler).toHaveBeenCalledWith({ type: "phase_updated", phaseId: "p1" });
    });
  });
});
