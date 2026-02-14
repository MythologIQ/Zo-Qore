/**
 * Sprint Storage Tests
 *
 * Tests for Sprint CRUD operations and task associations.
 *
 * @module tests/sprint.storage.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import type { Sprint, SprintStatus } from "../zo/project-tab/types";

describe("Sprint Storage", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;

  const testProjectId = "test-project-sprint";
  const testPhaseId = "test-phase-sprint";

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");
    storage = new ProjectTabStorage(db);

    // Create test project
    await storage.createProject({
      id: testProjectId,
      name: "Test Project for Sprints",
      state: "PLANNING",
    });

    // Create test phase
    await storage.createPhase({
      id: testPhaseId,
      projectId: testProjectId,
      name: "Test Phase",
      description: "Phase for sprint tests",
      clusterIds: [],
      dependencies: [],
    });
  });

  afterAll(async () => {
    db.close();
  });

  it("creates and retrieves a sprint", async () => {
    const sprint: Sprint = {
      id: "sprint-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      name: "Sprint 1",
      goal: "Complete initial features",
      startDate: "2026-02-01T00:00:00Z",
      endDate: "2026-02-14T23:59:59Z",
      status: "planned",
      taskIds: [],
    };

    const created = await storage.createSprint(sprint);
    expect(created.id).toBe("sprint-1");
    expect(created.name).toBe("Sprint 1");

    const retrieved = await storage.getSprint("sprint-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("Sprint 1");
    expect(retrieved?.goal).toBe("Complete initial features");
    expect(retrieved?.status).toBe("planned");
  });

  it("updates sprint status", async () => {
    await storage.updateSprintStatus("sprint-1", "active");

    const sprint = await storage.getSprint("sprint-1");
    expect(sprint?.status).toBe("active");
  });

  it("adds and removes tasks from sprint", async () => {
    // Create a test cluster first
    await storage.createCluster({
      id: "sprint-cluster-1",
      projectId: testProjectId,
      name: "Test Cluster",
      theme: "Test",
      thoughtIds: [],
      connections: [],
    });

    // Create a test task
    await storage.createTask({
      id: "sprint-task-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      clusterId: "sprint-cluster-1",
      title: "Task for sprint",
      description: "Test task",
      dependencies: [],
      status: "pending",
      assignee: "human",
      guardrailIds: [],
    });

    // Add task to sprint
    await storage.addTaskToSprint("sprint-1", "sprint-task-1");

    let sprint = await storage.getSprint("sprint-1");
    expect(sprint?.taskIds).toContain("sprint-task-1");

    // Remove task from sprint
    await storage.removeTaskFromSprint("sprint-1", "sprint-task-1");

    sprint = await storage.getSprint("sprint-1");
    expect(sprint?.taskIds).not.toContain("sprint-task-1");
  });

  it("lists sprints for a phase", async () => {
    // Create another sprint
    const sprint2: Sprint = {
      id: "sprint-2",
      projectId: testProjectId,
      phaseId: testPhaseId,
      name: "Sprint 2",
      goal: "Complete more features",
      startDate: "2026-02-15T00:00:00Z",
      endDate: "2026-02-28T23:59:59Z",
      status: "planned",
      taskIds: [],
    };

    await storage.createSprint(sprint2);

    const sprints = await storage.listSprintsForPhase(testPhaseId);
    expect(sprints.length).toBeGreaterThanOrEqual(2);
    expect(sprints.some((s) => s.id === "sprint-1")).toBe(true);
    expect(sprints.some((s) => s.id === "sprint-2")).toBe(true);
  });

  it("returns null for non-existent sprint", async () => {
    const sprint = await storage.getSprint("non-existent-sprint");
    expect(sprint).toBeNull();
  });
});
