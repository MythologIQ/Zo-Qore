/**
 * Planning Policy Index
 *
 * Exports all planning policies and registration utilities.
 */

export {
  PLANNING_POLICIES,
  PLANNING_POLICY_IDS,
  type PlanningPolicyId,
  type PlanningPolicy,
  type PlanningPolicyContext,
  type PolicyEvaluationResult,
  enforceVoidContentPolicy,
  enforceRevealClustersPolicy,
  enforceConstellationMappingPolicy,
  enforcePathPhasesPolicy,
  enforceRiskEntriesPolicy,
  enforceGuardrailsPolicy,
  enforceReferenceIntegrityPolicy,
  enforcePhaseOrdinalsPolicy,
} from './planning-policies.js';

/**
 * Registration function for policy engine
 * This can be called at startup to register planning policies
 */
export function registerPlanningPolicies(): void {
  // Planning policies are stateless functions that can be directly evaluated
  // Registration with a policy engine would happen here if one existed
}