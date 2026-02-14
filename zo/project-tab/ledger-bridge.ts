/**
 * Ledger Bridge for Project Tab
 *
 * Bridges the Project Tab storage layer to the Qore Ledger system,
 * enabling audit trail of state transitions for critical entities.
 *
 * Uses the correct LedgerManager.appendEntry() API with SYSTEM_EVENT type
 * per audit requirements (PHASE3_AUDIT_REPORT.md violations V1-V4).
 *
 * @module zo/project-tab/ledger-bridge
 */

import type { LedgerAppendRequest } from "../../ledger/engine/LedgerManager";

/** Agent DID for Project Tab storage operations */
export const PROJECT_TAB_AGENT_DID = "did:myth:project-tab:storage";

/**
 * Entity types that can trigger ledger events.
 */
export type LedgerEntityType =
  | "project"
  | "task"
  | "sprint"
  | "milestone"
  | "risk";

/**
 * Payload structure for Project Tab state transitions.
 * Stored in LedgerEntry.payload field.
 */
export interface ProjectTabTransitionPayload {
  /** Type of transition (e.g., 'project.state_changed') */
  transitionType: string;

  /** Entity type that changed */
  entityType: LedgerEntityType;

  /** Entity ID that changed */
  entityId: string;

  /** Project ID for scoping */
  projectId: string;

  /** Previous state value */
  previousValue: string;

  /** New state value */
  newValue: string;

  /** Optional additional context */
  context?: Record<string, unknown>;
}

/**
 * Create a LedgerAppendRequest for a Project Tab state transition.
 * Uses SYSTEM_EVENT as the event type per contract requirements.
 *
 * @param entityType - Type of entity that changed
 * @param entityId - ID of the entity that changed
 * @param projectId - Project ID for scoping
 * @param previousValue - Previous state value
 * @param newValue - New state value
 * @param context - Optional additional context
 * @returns A properly formed LedgerAppendRequest
 */
export function createLedgerRequest(
  entityType: LedgerEntityType,
  entityId: string,
  projectId: string,
  previousValue: string,
  newValue: string,
  context?: Record<string, unknown>
): LedgerAppendRequest {
  const payload: ProjectTabTransitionPayload = {
    transitionType: `${entityType}.state_changed`,
    entityType,
    entityId,
    projectId,
    previousValue,
    newValue,
    ...(context && { context }),
  };

  return {
    eventType: "SYSTEM_EVENT",
    agentDid: PROJECT_TAB_AGENT_DID,
    // Cast through unknown to satisfy Record<string, unknown> constraint
    payload: payload as unknown as Record<string, unknown>,
  };
}

/**
 * Type for ledger callback that matches LedgerManager.appendEntry signature.
 * Used by ProjectTabStorage to emit ledger events without direct coupling.
 */
export type LedgerCallback = (request: LedgerAppendRequest) => Promise<void>;
