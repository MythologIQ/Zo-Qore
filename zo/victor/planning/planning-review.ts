/**
 * Planning Review for Victor
 *
 * Provides review capabilities for planning artifacts using Victor's stance system.
 */

import type { FullProjectState, PlanningAction } from '@mythologiq/qore-contracts';
import {
  evaluatePlanningRules,
  type PlanningRuleResult,
  type PlanningVictorStance,
} from './planning-rules.js';

export interface PlanningReviewResult {
  stance: PlanningVictorStance;
  allowed: boolean;
  findings: PlanningRuleResult[];
  requiresAttention: boolean;
  canActivateAutonomy: boolean;
  summary: string;
}

/**
 * Review planning project state and return Victor's stance
 */
export function reviewPlanningProject(projectState: FullProjectState): PlanningReviewResult {
  const { results, overallStance, overallAllowed, needsAttention } = evaluatePlanningRules({
    projectState,
    action: 'review',
  });

  const canActivateAutonomy = overallAllowed && 
    !results.some((r) => r.ruleId === 'PL-VIC-04' && r.stance === 'red-flag');

  const findings = results.map((r): PlanningRuleResult => ({
    ruleId: r.ruleId,
    ruleName: r.ruleName,
    stance: r.stance,
    allowed: r.allowed,
    finding: r.finding,
    requiresAttention: r.requiresAttention,
  }));

  let summary = '';
  switch (overallStance) {
    case 'support':
      summary = 'Planning artifacts are well-formed and ready for execution';
      break;
    case 'challenge':
      summary = 'Planning has issues that should be addressed before execution';
      break;
    case 'mixed':
      summary = 'Planning is partially complete; some aspects need attention';
      break;
    case 'red-flag':
      summary = 'CRITICAL: Planning has blocking issues that prevent execution';
      break;
  }

  return {
    stance: overallStance,
    allowed: overallAllowed,
    findings,
    requiresAttention: needsAttention,
    canActivateAutonomy,
    summary,
  };
}

/**
 * Check if a specific action is allowed based on planning review
 */
export function checkPlanningAction(
  action: PlanningAction,
  projectState: FullProjectState
): { allowed: boolean; reason: string } {
  if (action.includes('autonomy:activate')) {
    const review = reviewPlanningProject(projectState);
    if (!review.canActivateAutonomy) {
      const guardrailIssue = review.findings.find(
        (f) => f.ruleId === 'PL-VIC-04' && f.stance === 'red-flag'
      );
      return {
        allowed: false,
        reason: guardrailIssue?.finding || 'Autonomy cannot be activated due to planning issues',
      };
    }
  }

  if (action.includes('path:create') || action.includes('path:update')) {
    const review = reviewPlanningProject(projectState);
    const acceptanceIssue = review.findings.find(
      (f) => f.ruleId === 'PL-VIC-01' && f.stance === 'challenge'
    );
    if (acceptanceIssue) {
      return {
        allowed: true,
        reason: `Warning: ${acceptanceIssue.finding}`,
      };
    }
  }

  return { allowed: true, reason: 'Action passes planning review' };
}

/**
 * Generate a Victor-style review report
 */
export function generatePlanningReviewReport(projectState: FullProjectState): string {
  const review = reviewPlanningProject(projectState);

  let report = `# Planning Review Report\n\n`;
  report += `## Stance: ${review.stance.toUpperCase()}\n\n`;
  report += `**${review.summary}**\n\n`;
  report += `---\n\n`;
  report += `## Findings\n\n`;

  for (const finding of review.findings) {
    const icon = finding.stance === 'support' ? '✅' :
                 finding.stance === 'challenge' ? '⚠️' :
                 finding.stance === 'mixed' ? '🤔' : '🚫';
    report += `### ${icon} ${finding.ruleName}\n`;
    report += `**${finding.ruleId}**: ${finding.finding}\n\n`;
  }

  report += `---\n\n`;
  report += `## Autonomy Readiness\n`;
  report += `Can Activate: ${review.canActivateAutonomy ? '✅ Yes' : '🚫 No'}\n`;
  report += `Requires Attention: ${review.requiresAttention ? '⚠️ Yes' : '✅ No'}\n`;

  return report;
}