/**
 * Planning Contracts - Autonomy View
 * 
 * Autonomy is the execution guardrails interface.
 * Defines constraints for autonomous execution.
 */

/**
 * A guardrail for autonomous execution.
 * Defines a constraint that must be respected.
 */
export interface AutonomyGuardrail {
  /** Unique identifier for this guardrail */
  guardrailId: string;
  
  /** Human-readable constraint description */
  rule: string;
  
  /** How this guardrail is enforced */
  enforcement: 'block' | 'warn' | 'log';
  
  /** Optional reference to policy definition */
  policyRef?: string;
}

/**
 * An approval gate for autonomous execution.
 * Defines conditions requiring human approval.
 */
export interface ApprovalGate {
  /** Unique identifier for this gate */
  gateId: string;
  
  /** Condition that triggers approval requirement */
  trigger: string;
  
  /** Actor or role that must approve */
  approver: string;
  
  /** Seconds before auto-block if no approval */
  timeout: number;
}

/**
 * Autonomy configuration for a project.
 * Defines guardrails for autonomous execution.
 */
export interface AutonomyConfig {
  /** Unique identifier for this config */
  autonomyId: string;
  
  /** Project this config belongs to */
  projectId: string;
  
  /** Guardrails for autonomous execution */
  guardrails: AutonomyGuardrail[];
  
  /** Approval gates requiring human intervention */
  approvalGates: ApprovalGate[];
  
  /** Action types that are allowed */
  allowedActions: string[];
  
  /** Action types that are explicitly blocked */
  blockedActions: string[];
  
  /** Victor's operating mode for this project */
  victorMode: 'support' | 'challenge' | 'mixed' | 'red-flag';
  
  /** Current autonomy status */
  status: 'draft' | 'active' | 'suspended';
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Request to save autonomy configuration
 */
export interface SaveAutonomyConfigRequest {
  projectId: string;
  guardrails: AutonomyGuardrail[];
  approvalGates: ApprovalGate[];
  allowedActions: string[];
  blockedActions: string[];
  victorMode: 'support' | 'challenge' | 'mixed' | 'red-flag';
}

/**
 * Request to activate autonomy
 */
export interface ActivateAutonomyRequest {
  projectId: string;
  confirmationCode: string;
}

/**
 * Request to suspend autonomy
 */
export interface SuspendAutonomyRequest {
  projectId: string;
  reason: string;
}
