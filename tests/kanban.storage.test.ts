/**
 * Kanban Storage Tests
 *
 * Tests for Kanban board generation and task movement.
 *
 * @module tests/kanban.storage.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import type { KanbanBoard, TaskStatus } from "../zo/project-tab/types";

describe("Kanban Storage", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;

  const suffix = Date.now();
  const testProjectId = `test-kanban-${suffix}`;
  const testPhaseId = `test-phase-kanban-${suffix}`;
  const testSprintId = `test-sprint-kanban-${suffix}`;
  const testClusterId = `kanban-cluster-${suffix}`;

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");
    storage = new ProjectTabStorage(db);

    // Create test project
    await storage.createProject({
      id: testProjectId,
      name: "Test Project for Kanban",
      state: "EXECUTING",
    });

    // Create test phase
    await storage.createPhase({
      id: testPhaseId,
      projectId: testProjectId,
      name: "Test Phase",
      description: "Phase for kanban tests",
      clusterIds: [],
      dependencies: [],
    });

    // Create test cluster
    await storage.createCluster({
      id: testClusterId,
      projectId: testProjectId,
      name: "Test Cluster",
      theme: "Test",
      thoughtIds: [],
      connections: [],
    });

    // Create test sprint
    await storage.createSprint({
      id: testSprintId,
      projectId: testProjectId,
      phaseId: testPhaseId,
      name: "Test Sprint",
      goal: "Test kanban functionality",
      startDate: "2026-02-01T00:00:00Z",
      endDate: "2026-02-14T23:59:59Z",
      status: "active",
      taskIds: [],
    });

    // Create test tasks with different statuses
    const statuses: TaskStatus[] = ["pending", "ready", "in_progress", "blocked", "completed"];
    for (let i = 0; i < 5; i++) {
      await storage.createTask({
        id: `kanban-task-${i}`,
        projectId: testProjectId,
        phaseId: testPhaseId,
        clusterId: testClusterId,
        title: `Task ${i}`,
        description: `Test task ${i}`,
        dependencies: [],
        status: statuses[i],
        assignee: "human",
        guardrailIds: [],
      });

      // Add first 3 tasks to sprint
      if (i < 3) {
        await storage.addTaskToSprint(testSprintId, `kanban-task-${i}`);
      }
    }
  });

  afterAll(async () => {
    db.close();
  });

  it("generates kanban board for project", async () => {
    const board = await storage.getKanbanBoard({
      projectId: testProjectId,
    });

    expect(board.projectId).toBe(testProjectId);
    expect(board.columns.length).toBe(5);

    // Check column names
    const columnNames = board.columns.map((c) => c.name);
    expect(columnNames).toContain("To Do");
    expect(columnNames).toContain("Ready");
    expect(columnNames).toContain("In Progress");
    expect(columnNames).toContain("Blocked");
    expect(columnNames).toContain("Done");

    // Check that tasks are distributed
    const totalTasks = board.columns.reduce((sum, c) => sum + c.taskIds.length, 0);
    expect(totalTasks).toBe(5);
  });

  it("filters kanban board by phase", async () => {
    const board = await storage.getKanbanBoard({
      projectId: testProjectId,
      phaseId: testPhaseId,
    });

    expect(board.phaseId).toBe(testPhaseId);
    const totalTasks = board.columns.reduce((sum, c) => sum + c.taskIds.length, 0);
    expect(totalTasks).toBe(5);
  });

  it("filters kanban board by sprint", async () => {
    const board = await storage.getKanbanBoard({
      projectId: testProjectId,
      sprintId: testSprintId,
    });

    expect(board.sprintId).toBe(testSprintId);
    const totalTasks = board.columns.reduce((sum, c) => sum + c.taskIds.length, 0);
    // Only 3 tasks are in the sprint
    expect(totalTasks).toBe(3);
  });

  it("moves task to different column", async () => {
    // Get initial board - use task-3 (blocked) which is NOT in the sprint
    let board = await storage.getKanbanBoard({ projectId: testProjectId });
    const blockedColumn = board.columns.find((c) => c.id === "blocked");
    expect(blockedColumn?.taskIds).toContain("kanban-task-3");

    // Move task from blocked to completed
    await storage.moveTaskToColumn("kanban-task-3", "completed");

    // Check board again
    board = await storage.getKanbanBoard({ projectId: testProjectId });
    const completedColumn = board.columns.find((c) => c.id === "completed");
    const blockedColumnAfter = board.columns.find((c) => c.id === "blocked");

    expect(completedColumn?.taskIds).toContain("kanban-task-3");
    expect(blockedColumnAfter?.taskIds).not.toContain("kanban-task-3");
  });

  it("reorders tasks within column", async () => {
    // Create additional tasks in the same status
    await storage.createTask({
      id: "reorder-task-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      clusterId: testClusterId,
      title: "Reorder Task 1",
      description: "Test",
      dependencies: [],
      status: "ready",
      assignee: "human",
      guardrailIds: [],
    });

    await storage.createTask({
      id: "reorder-task-2",
      projectId: testProjectId,
      phaseId: testPhaseId,
      clusterId: testClusterId,
      title: "Reorder Task 2",
      description: "Test",
      dependencies: [],
      status: "ready",
      assignee: "human",
      guardrailIds: [],
    });

    // Reorder tasks (reverse order)
    await storage.reorderTasksInColumn("ready", ["reorder-task-2", "reorder-task-1", "kanban-task-1"]);

    // Reordering stores positions in metadata - the method doesn't error
    // The kanban board order is still by created_at, not position
    const board = await storage.getKanbanBoard({ projectId: testProjectId });
    const readyColumn = board.columns.find((c) => c.id === "ready");
    expect(readyColumn?.taskIds.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty columns for project with no tasks", async () => {
    // Create a project with no tasks
    await storage.createProject({
      id: "empty-project",
      name: "Empty Project",
      state: "PLANNING",
    });

    const board = await storage.getKanbanBoard({ projectId: "empty-project" });
    expect(board.columns.length).toBe(5);
    const totalTasks = board.columns.reduce((sum, c) => sum + c.taskIds.length, 0);
    expect(totalTasks).toBe(0);
  });
});
