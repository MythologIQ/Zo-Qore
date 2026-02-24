/**
 * Planning Governance
 *
 * Handles DecisionRequest construction and policy evaluation for planning mutations.
 * This is the gateway that ensures all planning operations pass through policy checks
 * before being committed to the store.
 */

import { randomUUID } from 'crypto';
import {
  type FullProjectState,
  type PlanningAction,
} from '@mythologiq/qore-contracts';
import { planningLogger } from './Logger.js';
import { StoreIntegrity } from './StoreIntegrity.js';
import { ProjectStore } from './ProjectStore.js';
import {
  PLANNING_POLICIES,
  type PlanningPolicyContext,
  type PolicyEvaluationResult,
} from '../../policy/planning/planning-policies.js';

export interface DecisionRequest {
  requestId: string;
  actorId: string;
  projectId: string;
  action: PlanningAction;
  payload?: Record<string, unknown>;
  timestamp: string;
  projectState: FullProjectState;
}

export interface DecisionResponse {
  requestId: string;
  allowed: boolean;
  reason?: string;
  policyResults: PolicyEvaluationResult[];
  timestamp: string;
}

/**
 * Build a DecisionRequest for a planning action
 */
export function buildPlanningDecisionRequest(
  actorId: string,
  projectId: string,
  action: PlanningAction,
  projectState: FullProjectState,
  payload?: Record<string, unknown>
): DecisionRequest {
  return {
    requestId: randomUUID(),
    actorId,
    projectId,
    action,
    payload,
    timestamp: new Date().toISOString(),
    projectState,
  };
}

/**
 * Evaluate a DecisionRequest against all planning policies
 */
export function evaluatePlanningDecision(request: DecisionRequest): DecisionResponse {
  const policyContext: PlanningPolicyContext = {
    projectState: request.projectState,
    action: request.action,
    actorId: request.actorId,
  };

  const policyResults: PolicyEvaluationResult[] = [];

  for (const policy of PLANNING_POLICIES) {
    const result = policy(policyContext);
    policyResults.push(result);

    if (!result.allowed) {
      planningLogger.warn('Planning policy denied', {
        requestId: request.requestId,
        action: request.action,
        policyId: result.policyId,
        reason: result.reason,
      });

      return {
        requestId: request.requestId,
        allowed: false,
        reason: `[${result.policyId}] ${result.reason}`,
        policyResults,
        timestamp: new Date().toISOString(),
      };
    }
  }

  planningLogger.info('Planning policies passed', {
    requestId: request.requestId,
    action: request.action,
    policiesEvaluated: policyResults.length,
  });

  return {
    requestId: request.requestId,
    allowed: true,
    reason: `All ${policyResults.length} policies passed`,
    policyResults,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Planning Governance Controller
 *
 * Wraps store operations with policy evaluation.
 * All mutations should go through this controller.
 */
export class PlanningGovernance {
  private readonly projectStore: ProjectStore;
  private readonly storeIntegrity: StoreIntegrity;

  constructor(projectStore: ProjectStore, storeIntegrity: StoreIntegrity) {
    this.projectStore = projectStore;
    this.storeIntegrity = storeIntegrity;
  }

  /**
   * Evaluate an action before performing a mutation
   */
  async evaluateAction(
    actorId: string,
    action: PlanningAction,
    projectId: string,
    payload?: Record<string, unknown>
  ): Promise<DecisionResponse> {
    const projectState = await this.projectStore.getFullProjectState();

    const request = buildPlanningDecisionRequest(
      actorId,
      projectId,
      action,
      projectState,
      payload
    );

    return evaluatePlanningDecision(request);
  }

  /**
   * Execute a mutation if policies allow it
   * Returns the decision response - caller should check allowed before proceeding
   */
  async evaluateAndExecute<T>(
    actorId: string,
    action: PlanningAction,
    projectId: string,
    executeFn: () => Promise<T>,
    payload?: Record<string, unknown>
  ): Promise<{ response: DecisionResponse; result?: T }> {
    const response = await this.evaluateAction(actorId, action, projectId, payload);

    if (!response.allowed) {
      return { response };
    }

    const result = await executeFn();

    // Update checksums after mutation
    await this.storeIntegrity.updateChecksums(projectId);

    return { response, result };
  }
}

/**
 * Create a PlanningGovernance instance
 */
export function createPlanningGovernance(
  projectStore: ProjectStore,
  storeIntegrity: StoreIntegrity
): PlanningGovernance {
  return new PlanningGovernance(projectStore, storeIntegrity);
}
