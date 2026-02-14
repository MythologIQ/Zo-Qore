/**
 * Milestone Storage Tests
 *
 * Tests for Milestone CRUD operations and criteria tracking.
 *
 * @module tests/milestone.storage.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import type { Milestone, MilestoneStatus } from "../zo/project-tab/types";

describe("Milestone Storage", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;

  const testProjectId = "test-project-milestone";
  const testPhaseId = "test-phase-milestone";

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");
    storage = new ProjectTabStorage(db);

    // Create test project
    await storage.createProject({
      id: testProjectId,
      name: "Test Project for Milestones",
      state: "PLANNING",
    });

    // Create test phase
    await storage.createPhase({
      id: testPhaseId,
      projectId: testProjectId,
      name: "Test Phase",
      description: "Phase for milestone tests",
      clusterIds: [],
      dependencies: [],
    });
  });

  afterAll(async () => {
    db.close();
  });

  it("creates and retrieves a milestone", async () => {
    const milestone: Milestone = {
      id: "milestone-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      name: "MVP Release",
      description: "First minimum viable product release",
      targetDate: "2026-03-01T00:00:00Z",
      status: "upcoming",
      criteriaTaskIds: [],
    };

    const created = await storage.createMilestone(milestone);
    expect(created.id).toBe("milestone-1");
    expect(created.name).toBe("MVP Release");

    const retrieved = await storage.getMilestone("milestone-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("MVP Release");
    expect(retrieved?.description).toBe("First minimum viable product release");
    expect(retrieved?.status).toBe("upcoming");
  });

  it("creates milestone without phase", async () => {
    const milestone: Milestone = {
      id: "milestone-standalone",
      projectId: testProjectId,
      name: "Global Launch",
      description: "Worldwide product launch",
      targetDate: "2026-06-01T00:00:00Z",
      status: "upcoming",
      criteriaTaskIds: [],
    };

    const created = await storage.createMilestone(milestone);
    expect(created.id).toBe("milestone-standalone");
    expect(created.phaseId).toBeUndefined();

    const retrieved = await storage.getMilestone("milestone-standalone");
    expect(retrieved?.phaseId).toBeUndefined();
  });

  it("updates milestone status", async () => {
    await storage.updateMilestoneStatus("milestone-1", "achieved", "2026-02-28T00:00:00Z");

    const milestone = await storage.getMilestone("milestone-1");
    expect(milestone?.status).toBe("achieved");
    // Timestamp format may vary, check date part
    expect(milestone?.achievedDate).toContain("2026-02-28");
  });

  it("adds milestone criteria", async () => {
    // Create a test cluster first
    await storage.createCluster({
      id: "milestone-cluster-1",
      projectId: testProjectId,
      name: "Test Cluster",
      theme: "Test",
      thoughtIds: [],
      connections: [],
    });

    // Create a test task
    await storage.createTask({
      id: "milestone-task-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      clusterId: "milestone-cluster-1",
      title: "Task for milestone",
      description: "Test task",
      dependencies: [],
      status: "pending",
      assignee: "human",
      guardrailIds: [],
    });

    // Add task as criteria
    await storage.addMilestoneCriteria("milestone-1", "milestone-task-1");

    const milestone = await storage.getMilestone("milestone-1");
    expect(milestone?.criteriaTaskIds).toContain("milestone-task-1");
  });

  it("lists milestones for a project", async () => {
    const milestones = await storage.listMilestonesForProject(testProjectId);
    expect(milestones.length).toBeGreaterThanOrEqual(2);
    expect(milestones.some((m) => m.id === "milestone-1")).toBe(true);
    expect(milestones.some((m) => m.id === "milestone-standalone")).toBe(true);
  });

  it("returns null for non-existent milestone", async () => {
    const milestone = await storage.getMilestone("non-existent-milestone");
    expect(milestone).toBeNull();
  });
});
