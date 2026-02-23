/**
 * Planning Contracts - Path View
 * 
 * Path is the execution planning interface.
 * Phases define ordered execution steps with tasks.
 */

/**
 * A task within a phase.
 * Atomic unit of execution planning.
 */
export interface PathTask {
  /** Unique identifier for this task */
  taskId: string;
  
  /** Phase this task belongs to */
  phaseId: string;
  
  /** Task title */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Verification criteria for completion */
  acceptance: string[];
  
  /** Current task status */
  status: 'pending' | 'in-progress' | 'done' | 'blocked';
}

/**
 * An execution phase in the Path view.
 * Groups related tasks with a shared objective.
 */
export interface PathPhase {
  /** Unique identifier (UUID) */
  phaseId: string;
  
  /** Project this phase belongs to */
  projectId: string;
  
  /** Execution order (0-indexed) */
  ordinal: number;
  
  /** Phase name */
  name: string;
  
  /** What this phase aims to achieve */
  objective: string;
  
  /** Which constellation clusters feed into this phase */
  sourceClusterIds: string[];
  
  /** Tasks within this phase */
  tasks: PathTask[];
  
  /** Current phase status */
  status: 'planned' | 'active' | 'complete' | 'blocked';
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Request to create a new phase
 */
export interface CreatePhaseRequest {
  projectId: string;
  name: string;
  objective: string;
  sourceClusterIds: string[];
  ordinal?: number;
}

/**
 * Request to update a phase
 */
export interface UpdatePhaseRequest {
  phaseId: string;
  name?: string;
  objective?: string;
  status?: 'planned' | 'active' | 'complete' | 'blocked';
}

/**
 * Request to create a task within a phase
 */
export interface CreateTaskRequest {
  phaseId: string;
  title: string;
  description: string;
  acceptance: string[];
}

/**
 * Request to update a task's status
 */
export interface UpdateTaskStatusRequest {
  taskId: string;
  status: 'pending' | 'in-progress' | 'done' | 'blocked';
}
