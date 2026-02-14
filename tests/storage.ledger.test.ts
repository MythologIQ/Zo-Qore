/**
 * Storage Ledger Callback Tests
 *
 * Tests for verifying ledger callback invocation on state changes.
 *
 * @module tests/storage.ledger.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import type { LedgerAppendRequest } from "../ledger/engine/LedgerManager";
import type { ProjectTabTransitionPayload } from "../zo/project-tab/ledger-bridge";

describe("Storage Ledger Callback", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;
  let capturedRequests: LedgerAppendRequest[];
  let mockCallback: (request: LedgerAppendRequest) => Promise<void>;

  const testProjectId = `test-ledger-${Date.now()}`;
  const testPhaseId = `test-phase-ledger-${Date.now()}`;

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");
    storage = new ProjectTabStorage(db);

    // Set up mock callback to capture requests
    capturedRequests = [];
    mockCallback = vi.fn(async (request: LedgerAppendRequest) => {
      capturedRequests.push(request);
    });
    storage.setLedgerCallback(mockCallback);

    // Create test project
    await storage.createProject({
      id: testProjectId,
      name: "Test Project for Ledger",
      state: "EMPTY",
    });

    // Create test phase
    await storage.createPhase({
      id: testPhaseId,
      projectId: testProjectId,
      name: "Test Phase",
      description: "Phase for ledger tests",
      clusterIds: [],
      dependencies: [],
    });

    // Create test cluster
    await storage.createCluster({
      id: "ledger-cluster-1",
      projectId: testProjectId,
      name: "Test Cluster",
      theme: "Test",
      thoughtIds: [],
      connections: [],
    });
  });

  afterAll(async () => {
    db.close();
  });

  it("emits ledger event on updateProjectState", async () => {
    capturedRequests = [];

    await storage.updateProjectState(testProjectId, "GENESIS");

    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0].eventType).toBe("SYSTEM_EVENT");

    const payload = capturedRequests[0].payload as unknown as ProjectTabTransitionPayload;
    expect(payload.entityType).toBe("project");
    expect(payload.entityId).toBe(testProjectId);
    expect(payload.previousValue).toBe("EMPTY");
    expect(payload.newValue).toBe("GENESIS");
  });

  it("emits ledger event on updateTaskStatus", async () => {
    // Create a task
    await storage.createTask({
      id: "ledger-task-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      clusterId: "ledger-cluster-1",
      title: "Ledger Test Task",
      description: "Test",
      dependencies: [],
      status: "pending",
      assignee: "human",
      guardrailIds: [],
    });

    capturedRequests = [];

    await storage.updateTaskStatus("ledger-task-1", "in_progress");

    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0].eventType).toBe("SYSTEM_EVENT");

    const payload = capturedRequests[0].payload as unknown as ProjectTabTransitionPayload;
    expect(payload.entityType).toBe("task");
    expect(payload.entityId).toBe("ledger-task-1");
    expect(payload.previousValue).toBe("pending");
    expect(payload.newValue).toBe("in_progress");
    expect(payload.projectId).toBe(testProjectId);
  });

  it("emits ledger event on updateSprintStatus", async () => {
    // Create a sprint
    await storage.createSprint({
      id: "ledger-sprint-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      name: "Ledger Test Sprint",
      goal: "Test ledger",
      startDate: "2026-02-01T00:00:00Z",
      endDate: "2026-02-14T23:59:59Z",
      status: "planned",
      taskIds: [],
    });

    capturedRequests = [];

    await storage.updateSprintStatus("ledger-sprint-1", "active");

    expect(capturedRequests.length).toBe(1);

    const payload = capturedRequests[0].payload as unknown as ProjectTabTransitionPayload;
    expect(payload.entityType).toBe("sprint");
    expect(payload.previousValue).toBe("planned");
    expect(payload.newValue).toBe("active");
  });

  it("emits ledger event on updateMilestoneStatus", async () => {
    // Create a milestone
    await storage.createMilestone({
      id: "ledger-milestone-1",
      projectId: testProjectId,
      phaseId: testPhaseId,
      name: "Ledger Test Milestone",
      description: "Test",
      targetDate: "2026-03-01T00:00:00Z",
      status: "upcoming",
      criteriaTaskIds: [],
    });

    capturedRequests = [];

    await storage.updateMilestoneStatus("ledger-milestone-1", "achieved", "2026-02-28T00:00:00Z");

    expect(capturedRequests.length).toBe(1);

    const payload = capturedRequests[0].payload as unknown as ProjectTabTransitionPayload;
    expect(payload.entityType).toBe("milestone");
    expect(payload.previousValue).toBe("upcoming");
    expect(payload.newValue).toBe("achieved");
  });

  it("emits ledger event on updateRisk status change", async () => {
    // Create a risk
    await storage.createRisk({
      id: "ledger-risk-1",
      projectId: testProjectId,
      description: "Test risk for ledger",
      likelihood: "medium",
      impact: "high",
      avoidance: "Avoid it",
      mitigation: "Mitigate it",
      contingency: "Handle it",
      status: "identified",
    });

    capturedRequests = [];

    await storage.updateRisk("ledger-risk-1", { status: "mitigated" });

    expect(capturedRequests.length).toBe(1);

    const payload = capturedRequests[0].payload as unknown as ProjectTabTransitionPayload;
    expect(payload.entityType).toBe("risk");
    expect(payload.previousValue).toBe("identified");
    expect(payload.newValue).toBe("mitigated");
  });

  it("does not emit ledger event on risk update without status change", async () => {
    capturedRequests = [];

    // Update only description, not status
    await storage.updateRisk("ledger-risk-1", { description: "Updated description" });

    expect(capturedRequests.length).toBe(0);
  });

  it("provides agentDid in all ledger requests", async () => {
    capturedRequests = [];

    await storage.updateProjectState(testProjectId, "REVEAL");

    expect(capturedRequests[0].agentDid).toBe("did:myth:project-tab:storage");
  });

  it("works without ledger callback set", async () => {
    // Create storage without callback
    const storageNoCallback = new ProjectTabStorage(db);

    // Create project
    await storageNoCallback.createProject({
      id: "no-callback-project",
      name: "No Callback Project",
      state: "EMPTY",
    });

    // Should not throw
    await expect(
      storageNoCallback.updateProjectState("no-callback-project", "GENESIS")
    ).resolves.not.toThrow();
  });
});
