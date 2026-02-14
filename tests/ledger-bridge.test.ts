/**
 * Ledger Bridge Tests
 *
 * Tests for createLedgerRequest producing valid LedgerAppendRequest.
 *
 * @module tests/ledger-bridge.test
 */

import { describe, it, expect } from "vitest";
import {
  createLedgerRequest,
  PROJECT_TAB_AGENT_DID,
  type ProjectTabTransitionPayload,
} from "../zo/project-tab/ledger-bridge";

describe("Ledger Bridge", () => {
  it("creates valid LedgerAppendRequest with correct eventType", () => {
    const request = createLedgerRequest(
      "project",
      "proj-123",
      "proj-123",
      "PLANNING",
      "EXECUTING"
    );

    // Must use SYSTEM_EVENT per audit requirements
    expect(request.eventType).toBe("SYSTEM_EVENT");
  });

  it("includes required agentDid field", () => {
    const request = createLedgerRequest(
      "task",
      "task-456",
      "proj-123",
      "pending",
      "in_progress"
    );

    expect(request.agentDid).toBe(PROJECT_TAB_AGENT_DID);
    expect(request.agentDid).toBe("did:myth:project-tab:storage");
  });

  it("contains all transition fields in payload", () => {
    const request = createLedgerRequest(
      "milestone",
      "ms-789",
      "proj-123",
      "upcoming",
      "achieved"
    );

    const payload = request.payload as unknown as ProjectTabTransitionPayload;

    expect(payload.transitionType).toBe("milestone.state_changed");
    expect(payload.entityType).toBe("milestone");
    expect(payload.entityId).toBe("ms-789");
    expect(payload.projectId).toBe("proj-123");
    expect(payload.previousValue).toBe("upcoming");
    expect(payload.newValue).toBe("achieved");
  });

  it("generates correct transitionType for each entity", () => {
    const entityTypes = ["project", "task", "sprint", "milestone", "risk"] as const;

    for (const entityType of entityTypes) {
      const request = createLedgerRequest(
        entityType,
        "id-123",
        "proj-123",
        "old",
        "new"
      );

      const payload = request.payload as unknown as ProjectTabTransitionPayload;
      expect(payload.transitionType).toBe(`${entityType}.state_changed`);
    }
  });

  it("includes optional context when provided", () => {
    const request = createLedgerRequest(
      "task",
      "task-123",
      "proj-123",
      "pending",
      "completed",
      { reason: "Manual completion", completedBy: "user-456" }
    );

    const payload = request.payload as unknown as ProjectTabTransitionPayload;
    expect(payload.context).toEqual({
      reason: "Manual completion",
      completedBy: "user-456",
    });
  });

  it("omits context when not provided", () => {
    const request = createLedgerRequest(
      "sprint",
      "sprint-123",
      "proj-123",
      "planned",
      "active"
    );

    const payload = request.payload as unknown as ProjectTabTransitionPayload;
    expect(payload.context).toBeUndefined();
  });

  it("returns proper Record<string, unknown> compatible payload", () => {
    const request = createLedgerRequest(
      "risk",
      "risk-123",
      "proj-123",
      "identified",
      "mitigated"
    );

    // Payload should be assignable to Record<string, unknown>
    expect(typeof request.payload).toBe("object");
    expect(request.payload).not.toBeNull();

    // Access fields as Record<string, unknown>
    const payload = request.payload as Record<string, unknown>;
    expect(payload["transitionType"]).toBe("risk.state_changed");
    expect(payload["entityType"]).toBe("risk");
  });
});
