/**
 * Planning Rules for Victor
 *
 * Extends Victor's rule engine with planning-specific evaluation.
 * Each rule evaluates a planning artifact and returns a stance.
 */

import type { FullProjectState } from '@mythologiq/qore-contracts';

export type PlanningVictorStance = 'support' | 'challenge' | 'mixed' | 'red-flag';

export interface PlanningRuleContext {
  projectState: FullProjectState;
  action: string;
}

export interface PlanningRuleResult {
  ruleId: string;
  ruleName: string;
  stance: PlanningVictorStance;
  allowed: boolean;
  finding: string;
  requiresAttention: boolean;
}

/**
 * Does every phase have acceptance criteria?
 */
function hasAcceptanceCriteria(context: PlanningRuleContext): PlanningRuleResult {
  const { projectState } = context;
  const phases = projectState.phases ?? [];

  if (phases.length === 0) {
    return {
      ruleId: 'PL-VIC-01',
      ruleName: 'Phase Acceptance Criteria',
      stance: 'mixed',
      allowed: true,
      finding: 'No phases defined yet - criteria check not applicable',
      requiresAttention: false,
    };
  }

  const phasesWithoutCriteria = phases.filter(
    (phase) => !phase.tasks || phase.tasks.length === 0 || phase.tasks.every((t) => !t.acceptance || t.acceptance.length === 0)
  );

  if (phasesWithoutCriteria.length > 0) {
    return {
      ruleId: 'PL-VIC-01',
      ruleName: 'Phase Acceptance Criteria',
      stance: 'challenge',
      allowed: true,
      finding: `${phasesWithoutCriteria.length} phase(s) missing acceptance criteria: ${phasesWithoutCriteria.map((p) => p.name).join(', ')}`,
      requiresAttention: true,
    };
  }

  return {
    ruleId: 'PL-VIC-01',
    ruleName: 'Phase Acceptance Criteria',
    stance: 'support',
    allowed: true,
    finding: `All ${phases.length} phases have acceptance criteria defined`,
    requiresAttention: false,
  };
}

/**
 * Are risk mitigations specific (not vague)?
 */
function hasSpecificMitigations(context: PlanningRuleContext): PlanningRuleResult {
  const { projectState } = context;
  const risks = projectState.risks ?? [];

  if (risks.length === 0) {
    return {
      ruleId: 'PL-VIC-02',
      ruleName: 'Risk Mitigation Specificity',
      stance: 'mixed',
      allowed: true,
      finding: 'No risks defined yet - mitigation check not applicable',
      requiresAttention: false,
    };
  }

  const vagueTerms = ['monitor', 'watch', 'handle', 'manage', 'consider', 'review', 'assess'];
  const vagueRisks = risks.filter((risk) => {
    const mitigationLower = risk.mitigation.toLowerCase();
    return vagueTerms.some((term) => mitigationLower.includes(term) && risk.mitigation.length < 50);
  });

  if (vagueRisks.length > 0) {
    return {
      ruleId: 'PL-VIC-02',
      ruleName: 'Risk Mitigation Specificity',
      stance: 'challenge',
      allowed: true,
      finding: `${vagueRisks.length} risk(s) have vague mitigations: ${vagueRisks.map((r) => r.description.slice(0, 30)).join(', ')}`,
      requiresAttention: true,
    };
  }

  return {
    ruleId: 'PL-VIC-02',
    ruleName: 'Risk Mitigation Specificity',
    stance: 'support',
    allowed: true,
    finding: `All ${risks.length} risk mitigations are specific and actionable`,
    requiresAttention: false,
  };
}

/**
 * Is there phase-cluster traceability?
 */
function hasTraceability(context: PlanningRuleContext): PlanningRuleResult {
  const { projectState } = context;
  const phases = projectState.phases ?? [];
  const clusters = projectState.clusters ?? [];

  if (phases.length === 0) {
    return {
      ruleId: 'PL-VIC-03',
      ruleName: 'Phase-Cluster Traceability',
      stance: 'mixed',
      allowed: true,
      finding: 'No phases defined yet - traceability check not applicable',
      requiresAttention: false,
    };
  }

  if (clusters.length === 0) {
    return {
      ruleId: 'PL-VIC-03',
      ruleName: 'Phase-Cluster Traceability',
      stance: 'challenge',
      allowed: true,
      finding: 'No clusters exist - cannot establish traceability',
      requiresAttention: true,
    };
  }

  const clusterIds = new Set(clusters.map((c) => c.clusterId));
  const phasesWithoutClusters = phases.filter(
    (phase) => !phase.sourceClusterIds || phase.sourceClusterIds.length === 0
  );

  const phasesWithInvalidClusters = phases.filter((phase) =>
    phase.sourceClusterIds?.some((id) => !clusterIds.has(id))
  );

  if (phasesWithoutClusters.length > 0 || phasesWithInvalidClusters.length > 0) {
    return {
      ruleId: 'PL-VIC-03',
      ruleName: 'Phase-Cluster Traceability',
      stance: 'challenge',
      allowed: true,
      finding: `${phasesWithoutClusters.length} phases have no cluster sources, ${phasesWithInvalidClusters.length} reference invalid clusters`,
      requiresAttention: true,
    };
  }

  return {
    ruleId: 'PL-VIC-03',
    ruleName: 'Phase-Cluster Traceability',
    stance: 'support',
    allowed: true,
    finding: `All ${phases.length} phases trace to valid clusters`,
    requiresAttention: false,
  };
}

/**
 * Are autonomy guardrails meaningful (not "allow everything")?
 */
function hasMeaningfulGuardrails(context: PlanningRuleContext): PlanningRuleResult {
  const { projectState } = context;
  const autonomy = projectState.autonomy;

  if (!autonomy) {
    return {
      ruleId: 'PL-VIC-04',
      ruleName: 'Meaningful Guardrails',
      stance: 'red-flag',
      allowed: false,
      finding: 'No autonomy configuration - cannot activate autonomy without guardrails',
      requiresAttention: true,
    };
  }

  if (!autonomy.guardrails || autonomy.guardrails.length === 0) {
    return {
      ruleId: 'PL-VIC-04',
      ruleName: 'Meaningful Guardrails',
      stance: 'red-flag',
      allowed: false,
      finding: 'Autonomy has no guardrails defined - blocking activation',
      requiresAttention: true,
    };
  }

  const hasBlockEnforcement = autonomy.guardrails.some((g) => g.enforcement === 'block');
  const hasWarnEnforcement = autonomy.guardrails.some((g) => g.enforcement === 'warn');

  if (!hasBlockEnforcement && !hasWarnEnforcement) {
    return {
      ruleId: 'PL-VIC-04',
      ruleName: 'Meaningful Guardrails',
      stance: 'challenge',
      allowed: true,
      finding: 'All guardrails use "log" enforcement only - no proactive protection',
      requiresAttention: true,
    };
  }

  if (autonomy.blockedActions.length === 0 && autonomy.allowedActions.length === 0) {
    return {
      ruleId: 'PL-VIC-04',
      ruleName: 'Meaningful Guardrails',
      stance: 'challenge',
      allowed: true,
      finding: 'No action restrictions defined - guardrails may be too permissive',
      requiresAttention: true,
    };
  }

  return {
    ruleId: 'PL-VIC-04',
    ruleName: 'Meaningful Guardrails',
    stance: 'support',
    allowed: true,
    finding: `Autonomy has ${autonomy.guardrails.length} meaningful guardrail(s) with enforcement`,
    requiresAttention: false,
  };
}

/**
 * Are risks assessed before autonomy activation?
 */
function hasRiskReviewBeforeAutonomy(context: PlanningRuleContext): PlanningRuleResult {
  const { projectState } = context;
  const autonomy = projectState.autonomy;
  const risks = projectState.risks ?? [];

  if (!autonomy || autonomy.status !== 'active') {
    return {
      ruleId: 'PL-VIC-05',
      ruleName: 'Risk Review Before Autonomy',
      stance: 'mixed',
      allowed: true,
      finding: 'Autonomy not active - check not applicable',
      requiresAttention: false,
    };
  }

  if (risks.length === 0) {
    return {
      ruleId: 'PL-VIC-05',
      ruleName: 'Risk Review Before Autonomy',
      stance: 'red-flag',
      allowed: false,
      finding: 'Autonomy active with no risk assessment - blocking for safety',
      requiresAttention: true,
    };
  }

  const unmitigatedRisks = risks.filter((r) => r.status === 'identified');
  if (unmitigatedRisks.length > 0) {
    return {
      ruleId: 'PL-VIC-05',
      ruleName: 'Risk Review Before Autonomy',
      stance: 'challenge',
      allowed: true,
      finding: `${unmitigatedRisks.length} risks still identified (not mitigated)`,
      requiresAttention: true,
    };
  }

  return {
    ruleId: 'PL-VIC-05',
    ruleName: 'Risk Review Before Autonomy',
    stance: 'support',
    allowed: true,
    finding: 'All risks have been mitigated or accepted',
    requiresAttention: false,
  };
}

export const PLANNING_RULES = [
  hasAcceptanceCriteria,
  hasSpecificMitigations,
  hasTraceability,
  hasMeaningfulGuardrails,
  hasRiskReviewBeforeAutonomy,
];

export function evaluatePlanningRules(context: PlanningRuleContext): {
  results: PlanningRuleResult[];
  overallStance: PlanningVictorStance;
  overallAllowed: boolean;
  needsAttention: boolean;
} {
  const results = PLANNING_RULES.map((rule) => rule(context));

  let overallStance: PlanningVictorStance = 'support';
  let overallAllowed = true;
  let needsAttention = false;

  if (results.some((r) => r.stance === 'red-flag')) {
    overallStance = 'red-flag';
    overallAllowed = false;
    needsAttention = true;
  } else if (results.some((r) => r.stance === 'challenge')) {
    overallStance = 'challenge';
    needsAttention = results.some((r) => r.requiresAttention);
  } else if (results.some((r) => r.stance === 'mixed')) {
    overallStance = 'mixed';
  }

  return {
    results,
    overallStance,
    overallAllowed,
    needsAttention,
  };
}