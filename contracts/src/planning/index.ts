/**
 * Planning Contracts - Barrel Export
 * 
 * Exports all planning-related types and constants.
 */

// View-specific types
export type {
  VoidThought,
  CreateThoughtRequest,
  UpdateThoughtRequest,
  ListThoughtsFilter,
} from './void.js';

export type {
  RevealCluster,
  CreateClusterRequest,
  UpdateClusterRequest,
  ClaimThoughtsRequest,
  ListClustersFilter,
} from './reveal.js';

export type {
  ConstellationNode,
  ConstellationEdge,
  ConstellationMap,
  SaveConstellationMapRequest,
} from './constellation.js';

export type {
  PathTask,
  PathPhase,
  CreatePhaseRequest,
  UpdatePhaseRequest,
  CreateTaskRequest,
  UpdateTaskStatusRequest,
} from './path.js';

export type {
  RiskEntry,
  CreateRiskRequest,
  UpdateRiskRequest,
  ListRisksFilter,
  RiskMatrix,
} from './risk.js';

export type {
  AutonomyGuardrail,
  ApprovalGate,
  AutonomyConfig,
  SaveAutonomyConfigRequest,
  ActivateAutonomyRequest,
  SuspendAutonomyRequest,
} from './autonomy.js';

export type {
  PipelineState,
  QoreProject,
  CreateProjectRequest,
  UpdateProjectRequest,
  ListProjectsFilter,
  ProjectSummary,
  FullProjectState,
  // Reference types for cross-view usage
  VoidThoughtRef,
  RevealClusterRef,
  ConstellationMapRef,
  PathPhaseRef,
  RiskEntryRef,
  AutonomyConfigRef,
} from './project.js';

// Action constants
export {
  PROJECT_ACTIONS,
  VOID_ACTIONS,
  REVEAL_ACTIONS,
  CONSTELLATION_ACTIONS,
  PATH_ACTIONS,
  RISK_ACTIONS,
  AUTONOMY_ACTIONS,
  INTEGRITY_ACTIONS,
  EXPORT_ACTIONS,
  isPlanningAction,
} from './actions.js';

export type { PlanningAction } from './actions.js';
