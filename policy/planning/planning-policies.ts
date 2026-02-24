/**
 * Planning Policies
 *
 * Enforces pipeline sequencing and data integrity constraints.
 * These policies are evaluated before any planning mutation.
 *
 * PL-POL-01: Void must contain thoughts before Reveal can form clusters
 * PL-POL-02: Reveal must have formed clusters before Constellation can map
 * PL-POL-03: Constellation must have mapped relationships before Path can define phases
 * PL-POL-04: Path must have at least one phase before Risk can assess
 * PL-POL-05: Risk must have at least one entry before Autonomy can activate
 * PL-POL-06: Autonomy guardrails cannot be empty when activating
 * PL-POL-07: All cluster→constellation→path references must be valid
 * PL-POL-08: Phase ordinals must be sequential without gaps
 */

import {
  type FullProjectState,
  type PlanningAction,
  REVEAL_ACTIONS,
  CONSTELLATION_ACTIONS,
  PATH_ACTIONS,
  RISK_ACTIONS,
  AUTONOMY_ACTIONS,
} from '@mythologiq/qore-contracts';
import type { RevealClusterRef, PathPhaseRef, AutonomyConfigRef } from '@mythologiq/qore-contracts';

export interface PolicyEvaluationResult {
  allowed: boolean;
  policyId: string;
  reason: string;
}

export interface PlanningPolicyContext {
  projectState: FullProjectState;
  action: PlanningAction;
  actorId: string;
}

export type PlanningPolicy = (context: PlanningPolicyContext) => PolicyEvaluationResult;

const {
  CREATE_CLUSTER,
  UPDATE_CLUSTER,
  DELETE_CLUSTER,
  CLAIM_THOUGHTS,
} = REVEAL_ACTIONS;

const {
  SAVE_MAP,
  CLEAR_MAP,
} = CONSTELLATION_ACTIONS;

const {
  CREATE_PHASE,
  UPDATE_PHASE,
  DELETE_PHASE,
  CREATE_TASK,
  UPDATE_TASK_STATUS,
  REORDER_PHASES,
} = PATH_ACTIONS;

const {
  CREATE_ENTRY,
  UPDATE_ENTRY,
  DELETE_ENTRY,
} = RISK_ACTIONS;

const {
  SAVE_CONFIG,
  ACTIVATE,
} = AUTONOMY_ACTIONS;

/**
 * PL-POL-01: Void must contain thoughts before Reveal can form clusters
 */
export function enforceVoidContentPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isRevealAction = [
    CREATE_CLUSTER,
    UPDATE_CLUSTER,
    DELETE_CLUSTER,
    CLAIM_THOUGHTS,
  ].includes(action as typeof CREATE_CLUSTER);

  if (!isRevealAction) {
    return { allowed: true, policyId: 'PL-POL-01', reason: 'Not a Reveal action' };
  }

  const thoughts = projectState.thoughts ?? [];
  if (thoughts.length === 0) {
    return {
      allowed: false,
      policyId: 'PL-POL-01',
      reason: 'Cannot perform Reveal operations: Void contains no thoughts. Capture thoughts first.',
    };
  }

  return { allowed: true, policyId: 'PL-POL-01', reason: 'Void contains thoughts' };
}

/**
 * PL-POL-02: Reveal must have formed clusters before Constellation can map
 */
export function enforceRevealClustersPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isConstellationAction = [
    SAVE_MAP,
    CLEAR_MAP,
  ].includes(action as typeof SAVE_MAP);

  if (!isConstellationAction) {
    return { allowed: true, policyId: 'PL-POL-02', reason: 'Not a Constellation action' };
  }

  const clusters = projectState.clusters ?? [];
  const formedClusters = clusters.filter((c: RevealClusterRef) => c.status === 'formed');

  if (formedClusters.length === 0) {
    return {
      allowed: false,
      policyId: 'PL-POL-02',
      reason: 'Cannot create Constellation: No clusters in formed status. Form clusters in Reveal first.',
    };
  }

  return { allowed: true, policyId: 'PL-POL-02', reason: 'Reveal has formed clusters' };
}

/**
 * PL-POL-03: Constellation must have mapped relationships before Path can define phases
 */
export function enforceConstellationMappingPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isPathAction = [
    CREATE_PHASE,
    UPDATE_PHASE,
    DELETE_PHASE,
    CREATE_TASK,
    UPDATE_TASK_STATUS,
    REORDER_PHASES,
  ].includes(action as typeof CREATE_PHASE);

  if (!isPathAction) {
    return { allowed: true, policyId: 'PL-POL-03', reason: 'Not a Path action' };
  }

  const constellation = projectState.constellation;
  if (!constellation || !constellation.nodes || constellation.nodes.length === 0) {
    return {
      allowed: false,
      policyId: 'PL-POL-03',
      reason: 'Cannot create Path phases: Constellation has no nodes. Map relationships in Constellation first.',
    };
  }

  return { allowed: true, policyId: 'PL-POL-03', reason: 'Constellation has mapped nodes' };
}

/**
 * PL-POL-04: Path must have at least one phase before Risk can assess
 */
export function enforcePathPhasesPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isRiskAction = [
    CREATE_ENTRY,
    UPDATE_ENTRY,
    DELETE_ENTRY,
  ].includes(action as typeof CREATE_ENTRY);

  if (!isRiskAction) {
    return { allowed: true, policyId: 'PL-POL-04', reason: 'Not a Risk action' };
  }

  const phases = projectState.phases ?? [];
  if (phases.length === 0) {
    return {
      allowed: false,
      policyId: 'PL-POL-04',
      reason: 'Cannot create Risk entries: No phases defined. Define phases in Path first.',
    };
  }

  return { allowed: true, policyId: 'PL-POL-04', reason: 'Path has phases defined' };
}

/**
 * PL-POL-05: Risk must have at least one entry before Autonomy can activate
 */
export function enforceRiskEntriesPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isAutonomyAction = action === ACTIVATE;

  if (!isAutonomyAction) {
    return { allowed: true, policyId: 'PL-POL-05', reason: 'Not an Autonomy activation' };
  }

  const risks = projectState.risks ?? [];
  if (risks.length === 0) {
    return {
      allowed: false,
      policyId: 'PL-POL-05',
      reason: 'Cannot activate Autonomy: No risk entries. Assess risks first.',
    };
  }

  return { allowed: true, policyId: 'PL-POL-05', reason: 'Risk register has entries' };
}

/**
 * PL-POL-06: Autonomy guardrails cannot be empty when activating
 */
export function enforceGuardrailsPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isAutonomyAction = action === ACTIVATE || action === SAVE_CONFIG;

  if (!isAutonomyAction) {
    return { allowed: true, policyId: 'PL-POL-06', reason: 'Not an Autonomy configuration action' };
  }

  const config = projectState.autonomy;
  if (!config || !config.guardrails || config.guardrails.length === 0) {
    return {
      allowed: false,
      policyId: 'PL-POL-06',
      reason: 'Cannot activate Autonomy: No guardrails defined. Add guardrails before activation.',
    };
  }

  return { allowed: true, policyId: 'PL-POL-06', reason: 'Autonomy has guardrails' };
}

/**
 * PL-POL-07: All cluster→constellation→path references must be valid
 */
export function enforceReferenceIntegrityPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState } = context;

  // Get cluster IDs from Reveal
  const clusterIds = new Set(
    (projectState.clusters ?? []).map((c: RevealClusterRef) => c.clusterId)
  );

  // Check constellation nodes reference valid clusters
  const constellation = projectState.constellation;
  if (constellation?.nodes) {
    for (const node of constellation.nodes) {
      if (!clusterIds.has(node.clusterId)) {
        return {
          allowed: false,
          policyId: 'PL-POL-07',
          reason: `Constellation node ${node.nodeId} references invalid cluster ${node.clusterId}`,
        };
      }
    }
  }

  // Check path phases reference valid clusters
  const phases = projectState.phases ?? [];
  for (const phase of phases) {
    for (const clusterId of phase.sourceClusterIds ?? []) {
      if (!clusterIds.has(clusterId)) {
        return {
          allowed: false,
          policyId: 'PL-POL-07',
          reason: `Path phase ${phase.phaseId} references invalid cluster ${clusterId}`,
        };
      }
    }
  }

  return { allowed: true, policyId: 'PL-POL-07', reason: 'All references are valid' };
}

/**
 * PL-POL-08: Phase ordinals must be sequential without gaps
 */
export function enforcePhaseOrdinalsPolicy(context: PlanningPolicyContext): PolicyEvaluationResult {
  const { projectState, action } = context;
  const isPathAction = [
    CREATE_PHASE,
    UPDATE_PHASE,
    REORDER_PHASES,
  ].includes(action as typeof CREATE_PHASE);

  if (!isPathAction) {
    return { allowed: true, policyId: 'PL-POL-08', reason: 'Not a Path action affecting ordinals' };
  }

  const phases = projectState.phases ?? [];
  if (phases.length === 0) {
    return { allowed: true, policyId: 'PL-POL-08', reason: 'No phases to validate' };
  }

  const ordinals = phases.map((p: PathPhaseRef) => p.ordinal).sort((a: number, b: number) => a - b);
  for (let i = 0; i < ordinals.length; i++) {
    if (ordinals[i] !== i + 1) {
      return {
        allowed: false,
        policyId: 'PL-POL-08',
        reason: `Phase ordinals are not sequential. Expected ${i + 1}, found ${ordinals[i]}`,
      };
    }
  }

  return { allowed: true, policyId: 'PL-POL-08', reason: 'Phase ordinals are sequential' };
}

/**
 * All planning policies - evaluated in order for each mutation
 */
export const PLANNING_POLICIES: PlanningPolicy[] = [
  enforceVoidContentPolicy,
  enforceRevealClustersPolicy,
  enforceConstellationMappingPolicy,
  enforcePathPhasesPolicy,
  enforceRiskEntriesPolicy,
  enforceGuardrailsPolicy,
  enforceReferenceIntegrityPolicy,
  enforcePhaseOrdinalsPolicy,
];

/**
 * Policy IDs for explicit reference
 */
export const PLANNING_POLICY_IDS = [
  'PL-POL-01',
  'PL-POL-02',
  'PL-POL-03',
  'PL-POL-04',
  'PL-POL-05',
  'PL-POL-06',
  'PL-POL-07',
  'PL-POL-08',
] as const;

export type PlanningPolicyId = typeof PLANNING_POLICY_IDS[number];
