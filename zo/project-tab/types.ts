/**
 * Project Tab Types
 *
 * Type definitions for the Zo Project Tab feature, covering project lifecycle,
 * genesis sessions, thought clustering, risk management, guardrails, tasks,
 * and prompt governance.
 *
 * @module zo/project-tab/types
 */

// ============================================================================
// Project States
// ============================================================================

/**
 * Represents the lifecycle state of a project.
 *
 * State progression:
 * - `EMPTY` - Initial state, no content captured
 * - `GENESIS` - Voice/text capture session active
 * - `REVEAL` - AI processing and thought extraction
 * - `EXPLORING` - User reviewing extracted thoughts
 * - `ORGANIZED` - Thoughts clustered into themes
 * - `PLANNING` - Phases and dependencies defined
 * - `READY` - Plan validated, ready for execution
 * - `EXECUTING` - Active task execution in progress
 */
export type ProjectState =
  | 'EMPTY'
  | 'GENESIS'
  | 'REVEAL'
  | 'EXPLORING'
  | 'ORGANIZED'
  | 'PLANNING'
  | 'READY'
  | 'EXECUTING';

// ============================================================================
// Core Entities
// ============================================================================

/**
 * A project represents a bounded initiative with its own lifecycle,
 * thoughts, clusters, phases, and governance configuration.
 */
export interface Project {
  /** Unique identifier for the project */
  readonly id: string;

  /** Human-readable project name */
  name: string;

  /** Current lifecycle state of the project */
  state: ProjectState;

  /** ISO 8601 timestamp of project creation */
  readonly createdAt: string;

  /** ISO 8601 timestamp of last modification */
  updatedAt: string;

  /** Workspace folder path mapped to this project */
  folderPath?: string;

  /** Parent project ID for branched (sub) projects */
  parentId?: string | null;

  /** Whether this project is the currently active one */
  isActive?: boolean;
}

/**
 * Audio artifact metadata captured during a genesis session.
 */
export interface AudioArtifact {
  /** Unique identifier for the audio artifact */
  readonly id: string;

  /** Storage path or URL to the audio file */
  readonly path: string;

  /** Duration of the audio in seconds */
  readonly durationSeconds: number;

  /** MIME type of the audio file (e.g., 'audio/webm', 'audio/mp4') */
  readonly mimeType: string;

  /** ISO 8601 timestamp when the audio was captured */
  readonly capturedAt: string;
}

/**
 * A genesis session captures the initial brain dump of ideas,
 * either through voice recording or text input.
 */
export interface GenesisSession {
  /** Unique identifier for the session */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** ISO 8601 timestamp of session creation */
  readonly createdAt: string;

  /** Raw text input or transcription from the session */
  rawInput: string;

  /** Optional audio recordings from voice capture */
  audioArtifacts?: AudioArtifact[];

  /**
   * Whether the session content is protected from AI training.
   * When true, content should not be used for model improvement.
   */
  isProtected: boolean;
}

/**
 * A thought represents a discrete idea or concept extracted
 * from a genesis session's raw input.
 */
export interface Thought {
  /** Unique identifier for the thought */
  readonly id: string;

  /** Reference to the parent genesis session */
  readonly sessionId: string;

  /** The extracted thought content */
  content: string;

  /**
   * Reference to the vector embedding for similarity search.
   * Undefined if embedding has not yet been computed.
   */
  embeddingId?: string;

  /** ISO 8601 timestamp when the thought was extracted */
  readonly timestamp: string;

  /**
   * If this thought was reframed from another, the original thought ID.
   * Enables tracking of thought evolution.
   */
  reframedFrom?: string;
}

/**
 * 2D position coordinates for visual layout of clusters.
 */
export interface ClusterPosition {
  /** X coordinate in the visualization space */
  x: number;

  /** Y coordinate in the visualization space */
  y: number;
}

/**
 * Connection metadata between two clusters.
 */
export interface ClusterConnection {
  /** ID of the connected cluster */
  targetClusterId: string;

  /** Strength of the connection (0.0 to 1.0) */
  strength: number;

  /** Optional label describing the relationship */
  label?: string;
}

/**
 * A cluster groups related thoughts under a common theme.
 * Clusters can be positioned in 2D space and connected to each other.
 */
export interface Cluster {
  /** Unique identifier for the cluster */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** User-editable cluster name */
  name: string;

  /** AI-generated or user-defined theme description */
  theme: string;

  /** IDs of thoughts belonging to this cluster */
  thoughtIds: string[];

  /** Optional 2D position for visualization */
  position?: ClusterPosition;

  /** Connections to other related clusters */
  connections: ClusterConnection[];
}

/**
 * A phase represents a temporal segment of project execution,
 * containing clusters of work with dependencies on other phases.
 */
export interface Phase {
  /** Unique identifier for the phase */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Human-readable phase name */
  name: string;

  /** Detailed description of the phase scope and objectives */
  description: string;

  /** IDs of clusters included in this phase */
  clusterIds: string[];

  /** IDs of phases that must complete before this phase can start */
  dependencies: string[];

  /** Optional planned start date (ISO 8601) */
  startDate?: string;

  /** Optional planned end date (ISO 8601) */
  endDate?: string;
}

// ============================================================================
// Sprint Management
// ============================================================================

/**
 * Status of a sprint within its lifecycle.
 */
export type SprintStatus = 'planned' | 'active' | 'completed' | 'cancelled';

/**
 * A sprint represents a time-boxed iteration within a phase.
 */
export interface Sprint {
  /** Unique identifier for the sprint */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Reference to the parent phase */
  readonly phaseId: string;

  /** Sprint name (e.g., "Sprint 1", "Week 12") */
  name: string;

  /** Sprint goal or objective */
  goal: string;

  /** Planned start date (ISO 8601) */
  startDate: string;

  /** Planned end date (ISO 8601) */
  endDate: string;

  /** Current sprint status */
  status: SprintStatus;

  /** IDs of tasks assigned to this sprint */
  taskIds: string[];
}

// ============================================================================
// Milestone Management
// ============================================================================

/**
 * Status of a milestone.
 */
export type MilestoneStatus = 'upcoming' | 'achieved' | 'missed' | 'at_risk';

/**
 * A milestone represents a significant checkpoint or deliverable.
 */
export interface Milestone {
  /** Unique identifier for the milestone */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Optional reference to a phase */
  phaseId?: string;

  /** Milestone name */
  name: string;

  /** Description of what this milestone represents */
  description: string;

  /** Target date (ISO 8601) */
  targetDate: string;

  /** Actual completion date if achieved (ISO 8601) */
  achievedDate?: string;

  /** Current milestone status */
  status: MilestoneStatus;

  /** IDs of tasks that must complete for milestone achievement */
  criteriaTaskIds: string[];
}

// ============================================================================
// Risk Management
// ============================================================================

/**
 * Qualitative assessment of how likely a risk is to materialize.
 */
export type RiskLikelihood = 'low' | 'medium' | 'high';

/**
 * Qualitative assessment of the impact if a risk materializes.
 */
export type RiskImpact = 'low' | 'medium' | 'high';

/**
 * Current status of a risk in its lifecycle.
 *
 * - `identified` - Risk has been documented but not yet addressed
 * - `mitigated` - Mitigation measures have been applied
 * - `accepted` - Risk has been acknowledged and accepted without mitigation
 * - `resolved` - Risk is no longer relevant or has been eliminated
 */
export type RiskStatus = 'identified' | 'mitigated' | 'accepted' | 'resolved';

/**
 * A risk represents a potential negative outcome that could affect
 * the project, with associated avoidance, mitigation, and contingency strategies.
 */
export interface Risk {
  /** Unique identifier for the risk */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Description of the risk scenario */
  description: string;

  /** Assessed likelihood of the risk materializing */
  likelihood: RiskLikelihood;

  /** Assessed impact if the risk materializes */
  impact: RiskImpact;

  /** Strategy to prevent the risk from occurring */
  avoidance: string;

  /** Strategy to reduce the impact if the risk occurs */
  mitigation: string;

  /** Actions to take if the risk materializes despite mitigation */
  contingency: string;

  /** Optional reference to an automated guardrail enforcing this risk control */
  guardrailId?: string;

  /** Current status of the risk */
  status: RiskStatus;
}

// ============================================================================
// Guardrails
// ============================================================================

/**
 * Type of gate enforcement for a guardrail.
 *
 * - `human_approval` - Requires explicit human approval before proceeding
 * - `staged_execution` - Executes in stages with checkpoints
 * - `validation` - Requires automated validation to pass
 * - `block` - Unconditionally blocks the action
 */
export type GateType = 'human_approval' | 'staged_execution' | 'validation' | 'block';

/**
 * Condition expression for guardrail activation.
 * Uses a simple expression language for matching.
 */
export interface GuardrailCondition {
  /** Field or property to evaluate */
  field: string;

  /** Comparison operator */
  operator: 'equals' | 'contains' | 'matches' | 'greater_than' | 'less_than';

  /** Value to compare against */
  value: string | number | boolean;
}

/**
 * A guardrail enforces governance policies by gating specific actions
 * based on pattern matching and conditions.
 */
export interface Guardrail {
  /** Unique identifier for the guardrail */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Reference to the risk this guardrail addresses */
  riskId: string;

  /**
   * Pattern to match against policy evaluation context.
   * Supports glob-style patterns (e.g., 'file.write:path/to/dir')
   */
  policyPattern: string;

  /** Type of gate to apply when the pattern matches */
  gateType: GateType;

  /** Additional conditions that must be met for the guardrail to activate */
  conditions: GuardrailCondition[];
}

// ============================================================================
// Tasks
// ============================================================================

/**
 * Current execution status of a task.
 *
 * - `pending` - Task has been created but prerequisites not met
 * - `ready` - All dependencies satisfied, task can be started
 * - `in_progress` - Task is actively being worked on
 * - `blocked` - Task is blocked by an issue or guardrail
 * - `completed` - Task has been finished successfully
 */
export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'blocked' | 'completed';

/**
 * Indicates whether a task should be performed by a human or an AI agent.
 */
export type TaskAssignee = 'human' | 'agent';

/**
 * A task represents a discrete unit of work within a phase,
 * with dependencies, status tracking, and governance controls.
 */
export interface Task {
  /** Unique identifier for the task */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Reference to the phase containing this task */
  readonly phaseId: string;

  /** Reference to the cluster this task originated from */
  readonly clusterId: string;

  /** Brief title describing the task */
  title: string;

  /** Detailed description of what the task entails */
  description: string;

  /** IDs of tasks that must complete before this task can start */
  dependencies: string[];

  /** Current execution status */
  status: TaskStatus;

  /** Whether the task is assigned to a human or AI agent */
  assignee: TaskAssignee;

  /** IDs of guardrails that apply to this task's execution */
  guardrailIds: string[];
}

// ============================================================================
// Kanban Views
// ============================================================================

/**
 * Kanban column definition.
 */
export interface KanbanColumn {
  /** Column ID (typically matches TaskStatus) */
  id: string;

  /** Display name for the column */
  name: string;

  /** Number of tasks in WIP limit (0 = no limit) */
  wipLimit: number;

  /** Tasks in this column, ordered by position */
  taskIds: string[];
}

/**
 * Kanban board view for a phase or sprint.
 */
export interface KanbanBoard {
  /** Reference to project */
  projectId: string;

  /** Optional reference to phase */
  phaseId?: string;

  /** Optional reference to sprint */
  sprintId?: string;

  /** Columns in display order */
  columns: KanbanColumn[];
}

// ============================================================================
// Prompt Governance
// ============================================================================

/**
 * Sensitivity level for prompt injection detection.
 *
 * - `strict` - Maximum sensitivity, may produce false positives
 * - `standard` - Balanced detection suitable for most use cases
 * - `permissive` - Lower sensitivity, fewer false positives but may miss attacks
 */
export type InjectionDetectionLevel = 'strict' | 'standard' | 'permissive';

/**
 * Action to take when PII (Personally Identifiable Information) is detected.
 *
 * - `deny` - Block the prompt entirely
 * - `warn` - Allow with a warning to the user
 * - `redact` - Remove or mask the PII before processing
 * - `allow` - Allow without modification
 */
export type PIIAction = 'deny' | 'warn' | 'redact' | 'allow';

/**
 * Decision outcome for prompt governance evaluation.
 *
 * - `ALLOW` - Prompt passes all checks
 * - `DENY` - Prompt is blocked due to policy violation
 * - `ESCALATE` - Prompt requires human review before proceeding
 * - `WARN` - Prompt is allowed but with warnings logged
 */
export type PromptDecision = 'ALLOW' | 'DENY' | 'ESCALATE' | 'WARN';

/**
 * Prompt governance policy configuration for a project.
 * Controls injection detection, content filtering, and rate limiting.
 */
export interface PromptPolicy {
  /** Unique identifier for the policy */
  readonly id: string;

  /** Reference to the parent project */
  readonly projectId: string;

  /** Sensitivity level for injection detection */
  injectionDetection: InjectionDetectionLevel;

  /** Regex patterns to detect jailbreak attempts */
  jailbreakPatterns: string[];

  /** Topics that are explicitly allowed (whitelist) */
  allowedTopics: string[];

  /** Topics that are explicitly blocked (blacklist) */
  blockedTopics: string[];

  /** Action to take when PII is detected in prompts */
  piiAction: PIIAction;

  /** Maximum tokens allowed in a single prompt */
  maxTokensPerPrompt: number;

  /** Maximum total tokens allowed per hour */
  maxTokensPerHour: number;

  /** Maximum cost allowed per day (in USD) */
  maxCostPerDay: number;

  /** Maximum number of prompts allowed per minute */
  maxPromptsPerMinute: number;

  /** Cooldown period in seconds after rate limit is hit */
  cooldownSeconds: number;
}

/**
 * Type of sensitive data detected in a prompt.
 */
export type SensitiveDataType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'api_key'
  | 'password'
  | 'address'
  | 'name'
  | 'ip_address'
  | 'custom';

/**
 * Audit log entry for prompt governance decisions.
 * Provides detailed traceability for compliance and debugging.
 */
export interface PromptAuditEntry {
  /** Unique identifier for the request */
  readonly requestId: string;

  /** ISO 8601 timestamp of the request */
  readonly timestamp: string;

  /**
   * SHA-256 hash of the prompt content.
   * Enables audit without storing raw prompts.
   */
  readonly promptHash: string;

  /** Length of the prompt in tokens */
  readonly promptLengthTokens: number;

  /**
   * Injection detection score (0.0 to 1.0).
   * Higher values indicate higher likelihood of injection attempt.
   */
  readonly injectionScore: number;

  /** Whether a jailbreak pattern was matched */
  readonly jailbreakMatch: boolean;

  /** Types of sensitive data detected in the prompt */
  readonly sensitiveDataTypes: SensitiveDataType[];

  /** Final governance decision */
  readonly decision: PromptDecision;

  /** Human-readable reasons for the decision */
  readonly reasons: string[];

  /** IDs of guardrails/gates that were triggered */
  readonly gatesTriggered: string[];

  /** Reference to the project context */
  readonly projectId: string;

  /** Identifier of the actor (user or agent) who submitted the prompt */
  readonly actorId: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic identifier type for entity references.
 */
export type EntityId = string;

/**
 * ISO 8601 timestamp string.
 */
export type Timestamp = string;

/**
 * Represents an entity that can be created and updated.
 */
export interface Timestamped {
  readonly createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Represents an entity that belongs to a project.
 */
export interface ProjectScoped {
  readonly projectId: EntityId;
}

/**
 * Lookup map for entities by their ID.
 */
export type EntityMap<T extends { id: string }> = Map<EntityId, T>;

/**
 * Result type for operations that may fail.
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Async result type for async operations.
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
