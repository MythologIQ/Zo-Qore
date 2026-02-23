/**
 * Planning Contracts - Project Container
 * 
 * The project is the top-level container for all planning artifacts.
 * Tracks pipeline state and integrity.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Pipeline state for each view.
 * Used to track progress through the planning workflow.
 */
export interface PipelineState {
  /** Void view state */
  void: 'empty' | 'active';
  
  /** Reveal view state */
  reveal: 'empty' | 'active';
  
  /** Constellation view state */
  constellation: 'empty' | 'active';
  
  /** Path view state */
  path: 'empty' | 'active';
  
  /** Risk view state */
  risk: 'empty' | 'active';
  
  /** Autonomy view state */
  autonomy: 'empty' | 'active';
}

/**
 * A Qore project container.
 * Holds all planning artifacts for a single project.
 */
export interface QoreProject {
  /** Unique identifier (UUID) */
  projectId: string;
  
  /** Human-readable project name */
  name: string;
  
  /** Project description */
  description: string;
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  
  /** Actor who created this project */
  createdBy: string;
  
  /** Current state of each pipeline view */
  pipelineState: PipelineState;
  
  /** SHA-256 checksum of serialized project state */
  checksum: string;
}

/**
 * Request to create a new project
 */
export interface CreateProjectRequest {
  name: string;
  description: string;
  createdBy: string;
}

/**
 * Request to update a project
 */
export interface UpdateProjectRequest {
  projectId: string;
  name?: string;
  description?: string;
}

/**
 * Filter options for listing projects
 */
export interface ListProjectsFilter {
  createdBy?: string;
  hasActivePipeline?: boolean;
  since?: string;
  until?: string;
}

// ─────────────────────────────────────────────────────────────
// Cross-view Type References
// ─────────────────────────────────────────────────────────────

/**
 * Type reference for VoidThought (avoids circular imports)
 */
export type VoidThoughtRef = {
  thoughtId: string;
  projectId: string;
  content: string;
  source: 'text' | 'voice';
  capturedAt: string;
  capturedBy: string;
  tags: string[];
  status: 'raw' | 'claimed';
};

/**
 * Type reference for RevealCluster (avoids circular imports)
 */
export type RevealClusterRef = {
  clusterId: string;
  projectId: string;
  label: string;
  thoughtIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'formed';
};

/**
 * Type reference for ConstellationMap (avoids circular imports)
 */
export type ConstellationMapRef = {
  constellationId: string;
  projectId: string;
  nodes: Array<{
    nodeId: string;
    clusterId: string;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    edgeId: string;
    fromNodeId: string;
    toNodeId: string;
    relationship: string;
    weight: number;
  }>;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'mapped';
};

/**
 * Type reference for PathPhase (avoids circular imports)
 */
export type PathPhaseRef = {
  phaseId: string;
  projectId: string;
  ordinal: number;
  name: string;
  objective: string;
  sourceClusterIds: string[];
  tasks: Array<{
    taskId: string;
    phaseId: string;
    title: string;
    description: string;
    acceptance: string[];
    status: 'pending' | 'in-progress' | 'done' | 'blocked';
  }>;
  status: 'planned' | 'active' | 'complete' | 'blocked';
  createdAt: string;
  updatedAt: string;
};

/**
 * Type reference for RiskEntry (avoids circular imports)
 */
export type RiskEntryRef = {
  riskId: string;
  projectId: string;
  phaseId: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
  owner: string;
  status: 'identified' | 'mitigated' | 'accepted' | 'realized';
  createdAt: string;
  updatedAt: string;
};

/**
 * Type reference for AutonomyConfig (avoids circular imports)
 */
export type AutonomyConfigRef = {
  autonomyId: string;
  projectId: string;
  guardrails: Array<{
    guardrailId: string;
    rule: string;
    enforcement: 'block' | 'warn' | 'log';
    policyRef?: string;
  }>;
  approvalGates: Array<{
    gateId: string;
    trigger: string;
    approver: string;
    timeout: number;
  }>;
  allowedActions: string[];
  blockedActions: string[];
  victorMode: 'support' | 'challenge' | 'mixed' | 'red-flag';
  status: 'draft' | 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
};

// ─────────────────────────────────────────────────────────────
// Aggregate Types
// ─────────────────────────────────────────────────────────────

/**
 * Project summary for listings
 */
export interface ProjectSummary {
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  pipelineState: PipelineState;
  thoughtCount: number;
  clusterCount: number;
  phaseCount: number;
  riskCount: number;
}

/**
 * Full project state including all artifacts
 */
export interface FullProjectState {
  project: QoreProject;
  thoughts: VoidThoughtRef[];
  clusters: RevealClusterRef[];
  constellation: ConstellationMapRef | null;
  phases: PathPhaseRef[];
  risks: RiskEntryRef[];
  autonomy: AutonomyConfigRef | null;
}
