/**
 * Planning Contracts - Action Types
 * 
 * Defines action type constants for planning operations.
 * Follows existing action classification patterns.
 */

// ─────────────────────────────────────────────────────────────
// Project Actions
// ─────────────────────────────────────────────────────────────

export const PROJECT_ACTIONS = {
  CREATE: 'planning:project:create',
  READ: 'planning:project:read',
  UPDATE: 'planning:project:update',
  DELETE: 'planning:project:delete',
  LIST: 'planning:project:list',
} as const;

// ─────────────────────────────────────────────────────────────
// Void Actions
// ─────────────────────────────────────────────────────────────

export const VOID_ACTIONS = {
  CREATE_THOUGHT: 'planning:void:create-thought',
  LIST_THOUGHTS: 'planning:void:list-thoughts',
  UPDATE_THOUGHT: 'planning:void:update-thought',
  DELETE_THOUGHT: 'planning:void:delete-thought',
} as const;

// ─────────────────────────────────────────────────────────────
// Reveal Actions
// ─────────────────────────────────────────────────────────────

export const REVEAL_ACTIONS = {
  CREATE_CLUSTER: 'planning:reveal:create-cluster',
  LIST_CLUSTERS: 'planning:reveal:list-clusters',
  UPDATE_CLUSTER: 'planning:reveal:update-cluster',
  DELETE_CLUSTER: 'planning:reveal:delete-cluster',
  CLAIM_THOUGHTS: 'planning:reveal:claim-thoughts',
} as const;

// ─────────────────────────────────────────────────────────────
// Constellation Actions
// ─────────────────────────────────────────────────────────────

export const CONSTELLATION_ACTIONS = {
  SAVE_MAP: 'planning:constellation:save-map',
  READ_MAP: 'planning:constellation:read-map',
  CLEAR_MAP: 'planning:constellation:clear-map',
} as const;

// ─────────────────────────────────────────────────────────────
// Path Actions
// ─────────────────────────────────────────────────────────────

export const PATH_ACTIONS = {
  CREATE_PHASE: 'planning:path:create-phase',
  LIST_PHASES: 'planning:path:list-phases',
  UPDATE_PHASE: 'planning:path:update-phase',
  DELETE_PHASE: 'planning:path:delete-phase',
  CREATE_TASK: 'planning:path:create-task',
  UPDATE_TASK_STATUS: 'planning:path:update-task-status',
  REORDER_PHASES: 'planning:path:reorder-phases',
} as const;

// ─────────────────────────────────────────────────────────────
// Risk Actions
// ─────────────────────────────────────────────────────────────

export const RISK_ACTIONS = {
  CREATE_ENTRY: 'planning:risk:create-entry',
  LIST_ENTRIES: 'planning:risk:list-entries',
  UPDATE_ENTRY: 'planning:risk:update-entry',
  DELETE_ENTRY: 'planning:risk:delete-entry',
} as const;

// ─────────────────────────────────────────────────────────────
// Autonomy Actions
// ─────────────────────────────────────────────────────────────

export const AUTONOMY_ACTIONS = {
  SAVE_CONFIG: 'planning:autonomy:save-config',
  READ_CONFIG: 'planning:autonomy:read-config',
  ACTIVATE: 'planning:autonomy:activate',
  SUSPEND: 'planning:autonomy:suspend',
} as const;

// ─────────────────────────────────────────────────────────────
// Integrity Actions
// ─────────────────────────────────────────────────────────────

export const INTEGRITY_ACTIONS = {
  CHECK: 'planning:integrity:check',
  VERIFY_CHECKSUM: 'planning:integrity:verify-checksum',
  REPAIR: 'planning:integrity:repair',
} as const;

// ─────────────────────────────────────────────────────────────
// Export Actions
// ─────────────────────────────────────────────────────────────

export const EXPORT_ACTIONS = {
  EXPORT_JSON: 'planning:export:json',
  EXPORT_MARKDOWN: 'planning:export:markdown',
  IMPORT_JSON: 'planning:import:json',
} as const;

// ─────────────────────────────────────────────────────────────
// Aggregate Types
// ─────────────────────────────────────────────────────────────

/**
 * All planning action types
 */
export type PlanningAction =
  | typeof PROJECT_ACTIONS[keyof typeof PROJECT_ACTIONS]
  | typeof VOID_ACTIONS[keyof typeof VOID_ACTIONS]
  | typeof REVEAL_ACTIONS[keyof typeof REVEAL_ACTIONS]
  | typeof CONSTELLATION_ACTIONS[keyof typeof CONSTELLATION_ACTIONS]
  | typeof PATH_ACTIONS[keyof typeof PATH_ACTIONS]
  | typeof RISK_ACTIONS[keyof typeof RISK_ACTIONS]
  | typeof AUTONOMY_ACTIONS[keyof typeof AUTONOMY_ACTIONS]
  | typeof INTEGRITY_ACTIONS[keyof typeof INTEGRITY_ACTIONS]
  | typeof EXPORT_ACTIONS[keyof typeof EXPORT_ACTIONS];

/**
 * Check if an action is a planning action
 */
export function isPlanningAction(action: string): action is PlanningAction {
  return action.startsWith('planning:');
}
