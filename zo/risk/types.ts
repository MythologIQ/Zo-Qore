/**
 * Risk Types
 *
 * Type definitions for the risk management module.
 *
 * @module zo/risk/types
 */

import type { Risk, RiskLikelihood, RiskImpact, RiskStatus } from "../project-tab/types.js";

// ============================================================================
// Risk View Types
// ============================================================================

/** Risk with computed properties for UI */
export interface RiskView {
  id: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  avoidance: string;
  mitigation: string;
  contingency: string;
  status: RiskStatus;
  riskScore: number;
  hasGuardrail: boolean;
  guardrailId: string | null;
}

/** Risk matrix cell */
export interface RiskMatrixCell {
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  risks: RiskView[];
}

/** Complete risk state */
export interface RiskState {
  projectId: string;
  risks: RiskView[];
  matrix: RiskMatrixCell[][];
  unresolvedCount: number;
  mitigatedCount: number;
}

// ============================================================================
// Risk Proposal Types
// ============================================================================

/** Risk proposal from analysis */
export interface RiskProposal {
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  avoidance: string;
  mitigation: string;
  source: "system" | "user";
  confidence: number;
}

// ============================================================================
// Risk Events
// ============================================================================

/** Risk event types */
export type RiskEvent =
  | { type: "risk_added"; riskId: string }
  | { type: "risk_updated"; riskId: string }
  | { type: "risk_mitigated"; riskId: string }
  | { type: "guardrail_derived"; riskId: string; guardrailId: string }
  | { type: "risks_proposed"; count: number };
