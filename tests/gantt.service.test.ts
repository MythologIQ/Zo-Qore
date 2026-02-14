/**
 * Gantt Service Tests
 *
 * Tests for Gantt chart service operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GanttService } from "../zo/gantt/service.js";
import type { PathState } from "../zo/path/types.js";

describe("gantt.service", () => {
  let service: GanttService;
  let mockPathState: PathState;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GanttService();
    mockPathState = {
      projectId: "proj-1",
      phases: [
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
          sprints: [
            { id: "s1", name: "Sprint 1", goal: "Goal", startDate: "2026-01-01", endDate: "2026-01-07", status: "planned", taskCount: 3 },
          ],
          milestones: [
            { id: "m1", name: "Milestone 1", targetDate: "2026-01-14", status: "upcoming" },
          ],
          riskCount: 0,
        },
      ],
      criticalPath: ["p1"],
      totalDurationDays: 14,
      hasScheduleConflicts: false,
    };
  });

  describe("onEvent", () => {
    it("registers event handler", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      const state = service.buildGanttState(mockPathState);
      service.selectBar(state, "p1");

      expect(handler).toHaveBeenCalledWith({ type: "bar_selected", barId: "p1" });
    });

    it("returns unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = service.onEvent(handler);

      unsubscribe();
      const state = service.buildGanttState(mockPathState);
      service.selectBar(state, "p1");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("buildGanttState", () => {
    it("creates state from path state", () => {
      const state = service.buildGanttState(mockPathState);
      expect(state.projectId).toBe("proj-1");
    });

    it("creates bars for phases", () => {
      const state = service.buildGanttState(mockPathState);
      const phaseBars = state.bars.filter((b) => b.type === "phase");
      expect(phaseBars).toHaveLength(1);
    });

    it("creates bars for sprints", () => {
      const state = service.buildGanttState(mockPathState);
      const sprintBars = state.bars.filter((b) => b.type === "sprint");
      expect(sprintBars).toHaveLength(1);
    });

    it("creates bars for milestones", () => {
      const state = service.buildGanttState(mockPathState);
      const milestoneBars = state.bars.filter((b) => b.type === "milestone");
      expect(milestoneBars).toHaveLength(1);
    });

    it("marks critical path bars", () => {
      const state = service.buildGanttState(mockPathState);
      const p1Bar = state.bars.find((b) => b.id === "p1");
      expect(p1Bar?.isOnCriticalPath).toBe(true);
    });
  });

  describe("selectBar", () => {
    it("sets selected bar ID", () => {
      const state = service.buildGanttState(mockPathState);
      service.selectBar(state, "p1");
      expect(state.selectedBarId).toBe("p1");
    });
  });

  describe("deselectBar", () => {
    it("clears selected bar ID", () => {
      const state = service.buildGanttState(mockPathState);
      state.selectedBarId = "p1";
      service.deselectBar(state);
      expect(state.selectedBarId).toBeNull();
    });
  });

  describe("setScale", () => {
    it("changes viewport scale", () => {
      const state = service.buildGanttState(mockPathState);
      service.setScale(state, "day");
      expect(state.viewport.scale).toBe("day");
      expect(state.viewport.pixelsPerDay).toBe(60);
    });

    it("emits viewport_changed event", () => {
      const handler = vi.fn();
      service.onEvent(handler);

      const state = service.buildGanttState(mockPathState);
      service.setScale(state, "month");

      expect(handler).toHaveBeenCalledWith({ type: "viewport_changed", scale: "month" });
    });
  });
});
