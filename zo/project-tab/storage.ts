/**
 * Project Tab Storage Layer
 *
 * Provides CRUD operations for all Project Tab entities using the DuckDB client.
 * Handles mapping between TypeScript types and database schema, including
 * junction tables for many-to-many relationships.
 *
 * @module zo/project-tab/storage
 */

import { DuckDBClient } from "../storage/duckdb-client";
import {
  createLedgerRequest,
  type LedgerCallback,
  type LedgerEntityType,
} from "./ledger-bridge";
import type {
  Project,
  ProjectState,
  GenesisSession,
  Thought,
  Cluster,
  ClusterConnection,
  ClusterPosition,
  Phase,
  Sprint,
  SprintStatus,
  Milestone,
  MilestoneStatus,
  Risk,
  RiskLikelihood,
  RiskImpact,
  RiskStatus,
  Guardrail,
  GuardrailCondition,
  GateType,
  Task,
  TaskStatus,
  TaskAssignee,
  KanbanBoard,
  KanbanColumn,
  PromptPolicy,
  InjectionDetectionLevel,
  PIIAction,
  PromptAuditEntry,
  PromptDecision,
  SensitiveDataType,
} from "./types";

// ============================================================================
// Database Row Types (internal mapping to schema)
// ============================================================================

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  metadata: string | null;
}

interface GenesisSessionRow {
  id: string;
  project_id: string;
  session_type: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  context: string | null;
  summary: string | null;
  metadata: string | null;
}

interface ThoughtRow {
  id: string;
  session_id: string;
  project_id: string;
  content: string;
  thought_type: string;
  source: string | null;
  confidence: number;
  created_at: string;
  processed_at: string | null;
  status: string;
  parent_thought_id: string | null;
  metadata: string | null;
}

interface EmbeddingRow {
  id: string;
  thought_id: string;
}

interface ClusterRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  cluster_type: string;
  centroid: number[] | null;
  coherence_score: number | null;
  created_at: string;
  updated_at: string;
  status: string;
  metadata: string | null;
}

interface ClusterConnectionRow {
  id: string;
  source_cluster_id: string;
  target_cluster_id: string;
  connection_type: string;
  strength: number;
  bidirectional: boolean;
  created_at: string;
  metadata: string | null;
}

interface PhaseRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  phase_order: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  estimated_duration_hours: number | null;
  actual_duration_hours: number | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

interface RiskRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  risk_category: string;
  severity: string;
  likelihood: string;
  impact_score: number | null;
  status: string;
  mitigation_strategy: string | null;
  source_thought_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  metadata: string | null;
}

interface GuardrailRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  name: string;
  description: string | null;
  guardrail_type: string;
  rule_expression: string | null;
  enforcement_level: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

interface TaskRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  cluster_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: string;
  assignee: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  metadata: string | null;
}

interface PromptPolicyRow {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  policy_type: string;
  scope: string;
  rule_definition: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  metadata: string | null;
}

interface PromptAuditRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  policy_id: string | null;
  prompt_hash: string;
  prompt_preview: string | null;
  evaluation_result: string;
  matched_rules: string | null;
  violations: string | null;
  decision: string;
  decision_reason: string | null;
  actor_id: string | null;
  evaluated_at: string;
  response_time_ms: number | null;
  metadata: string | null;
}

interface SprintRow {
  id: string;
  project_id: string;
  phase_id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  name: string;
  description: string | null;
  target_date: string;
  achieved_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique identifier for new entities.
 */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get current ISO 8601 timestamp.
 */
function nowTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse JSON string safely, returning default value on failure.
 */
function parseJson<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Stringify value to JSON for database storage.
 */
function toJson(value: unknown): string {
  return JSON.stringify(value);
}

// ============================================================================
// ProjectTabStorage Class
// ============================================================================

/**
 * Storage layer for Project Tab entities.
 *
 * Provides CRUD operations for projects, genesis sessions, thoughts, clusters,
 * phases, risks, guardrails, tasks, and prompt governance using DuckDB.
 *
 * @example
 * ```typescript
 * const db = new DuckDBClient({ dbPath: ':memory:' });
 * await db.initialize();
 * await db.runMigrations('./zo/storage/duckdb-schema.sql');
 *
 * const storage = new ProjectTabStorage(db);
 *
 * const project = await storage.createProject({
 *   id: 'proj-123',
 *   name: 'My Project',
 *   state: 'EMPTY'
 * });
 * ```
 */
export class ProjectTabStorage {
  private ledgerCallback?: LedgerCallback;

  constructor(private db: DuckDBClient) {}

  /**
   * Set a callback to emit ledger events for state transitions.
   * The callback receives a LedgerAppendRequest ready for LedgerManager.appendEntry().
   *
   * @param callback - Function to call with ledger events
   */
  setLedgerCallback(callback: LedgerCallback): void {
    this.ledgerCallback = callback;
  }

  /**
   * Emit a ledger event if callback is configured.
   */
  private async emitLedgerEvent(
    entityType: LedgerEntityType,
    entityId: string,
    projectId: string,
    previousValue: string,
    newValue: string
  ): Promise<void> {
    if (this.ledgerCallback) {
      const request = createLedgerRequest(
        entityType,
        entityId,
        projectId,
        previousValue,
        newValue
      );
      await this.ledgerCallback(request);
    }
  }

  // ==========================================================================
  // Projects
  // ==========================================================================

  /**
   * Create a new project.
   *
   * @param project - Project data (createdAt and updatedAt are generated)
   * @returns The created project with timestamps
   */
  async createProject(
    project: Omit<Project, "createdAt" | "updatedAt">
  ): Promise<Project> {
    const now = nowTimestamp();
    const createdProject: Project = {
      ...project,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO projects (id, name, description, created_at, updated_at, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        createdProject.id,
        createdProject.name,
        null, // description not in type, but in schema
        createdProject.createdAt,
        createdProject.updatedAt,
        createdProject.state,
        null,
      ]
    );

    return createdProject;
  }

  /**
   * Get a project by ID.
   *
   * @param id - Project ID
   * @returns The project or null if not found
   */
  async getProject(id: string): Promise<Project | null> {
    const row = await this.db.queryOne<ProjectRow>(
      "SELECT * FROM projects WHERE id = ?",
      [id]
    );

    if (!row) return null;

    return this.mapRowToProject(row);
  }

  /**
   * Update a project's state.
   * Emits a ledger event for state transitions.
   *
   * @param id - Project ID
   * @param state - New project state
   */
  async updateProjectState(id: string, state: ProjectState): Promise<void> {
    // Get previous state for ledger
    const project = await this.getProject(id);
    const previousState = project?.state ?? "EMPTY";

    const now = nowTimestamp();
    await this.db.execute(
      "UPDATE projects SET status = ?, updated_at = ? WHERE id = ?",
      [state, now, id]
    );

    // Emit ledger event
    if (project) {
      await this.emitLedgerEvent("project", id, id, previousState, state);
    }
  }

  /**
   * List all projects.
   *
   * @returns Array of all projects
   */
  async listProjects(): Promise<Project[]> {
    const rows = await this.db.query<ProjectRow>(
      "SELECT * FROM projects ORDER BY created_at DESC"
    );
    return rows.map((row) => this.mapRowToProject(row));
  }

  private mapRowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      state: row.status as ProjectState,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==========================================================================
  // Genesis Sessions
  // ==========================================================================

  /**
   * Create a new genesis session.
   *
   * @param session - Session data (createdAt and isProtected are generated)
   * @returns The created session
   */
  async createGenesisSession(
    session: Omit<GenesisSession, "createdAt" | "isProtected">
  ): Promise<GenesisSession> {
    const now = nowTimestamp();
    const createdSession: GenesisSession = {
      ...session,
      createdAt: now,
      isProtected: false,
    };

    // Store audio artifacts and raw input in context JSON
    const context = {
      rawInput: createdSession.rawInput,
      audioArtifacts: createdSession.audioArtifacts || [],
    };

    await this.db.execute(
      `INSERT INTO genesis_sessions (id, project_id, session_type, started_at, status, context, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        createdSession.id,
        createdSession.projectId,
        "genesis",
        createdSession.createdAt,
        "active",
        toJson(context),
        toJson({ isProtected: createdSession.isProtected }),
      ]
    );

    return createdSession;
  }

  /**
   * Get a genesis session by ID.
   *
   * @param id - Session ID
   * @returns The session or null if not found
   */
  async getGenesisSession(id: string): Promise<GenesisSession | null> {
    const row = await this.db.queryOne<GenesisSessionRow>(
      "SELECT * FROM genesis_sessions WHERE id = ?",
      [id]
    );

    if (!row) return null;

    return this.mapRowToGenesisSession(row);
  }

  /**
   * List all genesis sessions for a project.
   *
   * @param projectId - Project ID
   * @returns Array of sessions for the project
   */
  async listGenesisSessionsForProject(
    projectId: string
  ): Promise<GenesisSession[]> {
    const rows = await this.db.query<GenesisSessionRow>(
      "SELECT * FROM genesis_sessions WHERE project_id = ? ORDER BY started_at DESC",
      [projectId]
    );
    return rows.map((row) => this.mapRowToGenesisSession(row));
  }

  private mapRowToGenesisSession(row: GenesisSessionRow): GenesisSession {
    const context = parseJson<{
      rawInput?: string;
      audioArtifacts?: GenesisSession["audioArtifacts"];
    }>(row.context, {});
    const metadata = parseJson<{ isProtected?: boolean }>(row.metadata, {});

    return {
      id: row.id,
      projectId: row.project_id,
      createdAt: row.started_at,
      rawInput: context.rawInput || row.summary || "",
      audioArtifacts: context.audioArtifacts,
      isProtected: metadata.isProtected ?? false,
    };
  }

  // ==========================================================================
  // Thoughts
  // ==========================================================================

  /**
   * Create a new thought.
   *
   * @param thought - Thought data (timestamp is generated)
   * @returns The created thought
   */
  async createThought(thought: Omit<Thought, "timestamp">): Promise<Thought> {
    const now = nowTimestamp();
    const createdThought: Thought = {
      ...thought,
      timestamp: now,
    };

    // Get project_id from session
    const session = await this.getGenesisSession(thought.sessionId);
    const projectId = session?.projectId || "";

    await this.db.execute(
      `INSERT INTO thoughts (id, session_id, project_id, content, thought_type, source, created_at, status, parent_thought_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createdThought.id,
        createdThought.sessionId,
        projectId,
        createdThought.content,
        "extracted",
        null,
        createdThought.timestamp,
        "active",
        createdThought.reframedFrom || null,
        createdThought.embeddingId
          ? toJson({ embeddingId: createdThought.embeddingId })
          : null,
      ]
    );

    return createdThought;
  }

  /**
   * Get a thought by ID.
   *
   * @param id - Thought ID
   * @returns The thought or null if not found
   */
  async getThought(id: string): Promise<Thought | null> {
    const row = await this.db.queryOne<ThoughtRow>(
      "SELECT * FROM thoughts WHERE id = ?",
      [id]
    );

    if (!row) return null;

    return this.mapRowToThought(row);
  }

  /**
   * List all thoughts for a session.
   *
   * @param sessionId - Session ID
   * @returns Array of thoughts for the session
   */
  async listThoughtsForSession(sessionId: string): Promise<Thought[]> {
    const rows = await this.db.query<ThoughtRow>(
      "SELECT * FROM thoughts WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId]
    );
    return rows.map((row) => this.mapRowToThought(row));
  }

  /**
   * Update a thought's embedding reference.
   *
   * @param id - Thought ID
   * @param embeddingId - Embedding ID to associate
   */
  async updateThoughtEmbedding(id: string, embeddingId: string): Promise<void> {
    // Get current metadata
    const thought = await this.db.queryOne<ThoughtRow>(
      "SELECT metadata FROM thoughts WHERE id = ?",
      [id]
    );
    const currentMetadata = parseJson<Record<string, unknown>>(
      thought?.metadata || null,
      {}
    );

    await this.db.execute("UPDATE thoughts SET metadata = ? WHERE id = ?", [
      toJson({ ...currentMetadata, embeddingId }),
      id,
    ]);
  }

  private mapRowToThought(row: ThoughtRow): Thought {
    const metadata = parseJson<{ embeddingId?: string }>(row.metadata, {});

    return {
      id: row.id,
      sessionId: row.session_id,
      content: row.content,
      embeddingId: metadata.embeddingId,
      timestamp: row.created_at,
      reframedFrom: row.parent_thought_id || undefined,
    };
  }

  // ==========================================================================
  // Clusters
  // ==========================================================================

  /**
   * Create a new cluster.
   *
   * @param cluster - Cluster data
   * @returns The created cluster
   */
  async createCluster(cluster: Cluster): Promise<Cluster> {
    await this.db.execute(
      `INSERT INTO clusters (id, project_id, name, description, cluster_type, created_at, updated_at, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cluster.id,
        cluster.projectId,
        cluster.name,
        cluster.theme,
        "semantic",
        nowTimestamp(),
        nowTimestamp(),
        "active",
        cluster.position ? toJson({ position: cluster.position }) : null,
      ]
    );

    // Add thoughts to cluster via junction table
    for (const thoughtId of cluster.thoughtIds) {
      await this.db.execute(
        `INSERT INTO cluster_thoughts (cluster_id, thought_id, added_at)
         VALUES (?, ?, ?)`,
        [cluster.id, thoughtId, nowTimestamp()]
      );
    }

    // Add connections
    for (const connection of cluster.connections) {
      await this.addClusterConnection(cluster.id, connection.targetClusterId);
    }

    return cluster;
  }

  /**
   * Update a cluster.
   *
   * @param id - Cluster ID
   * @param updates - Partial cluster updates
   */
  async updateCluster(id: string, updates: Partial<Cluster>): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      params.push(updates.name);
    }
    if (updates.theme !== undefined) {
      setClauses.push("description = ?");
      params.push(updates.theme);
    }
    if (updates.position !== undefined) {
      // Merge with existing metadata
      const existing = await this.db.queryOne<ClusterRow>(
        "SELECT metadata FROM clusters WHERE id = ?",
        [id]
      );
      const currentMetadata = parseJson<Record<string, unknown>>(
        existing?.metadata || null,
        {}
      );
      setClauses.push("metadata = ?");
      params.push(toJson({ ...currentMetadata, position: updates.position }));
    }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = ?");
      params.push(nowTimestamp());
      params.push(id);

      await this.db.execute(
        `UPDATE clusters SET ${setClauses.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Update thought associations if provided
    if (updates.thoughtIds !== undefined) {
      // Remove existing associations
      await this.db.execute(
        "DELETE FROM cluster_thoughts WHERE cluster_id = ?",
        [id]
      );

      // Add new associations
      for (const thoughtId of updates.thoughtIds) {
        await this.db.execute(
          `INSERT INTO cluster_thoughts (cluster_id, thought_id, added_at)
           VALUES (?, ?, ?)`,
          [id, thoughtId, nowTimestamp()]
        );
      }
    }
  }

  /**
   * List all clusters for a project.
   *
   * @param projectId - Project ID
   * @returns Array of clusters for the project
   */
  async listClustersForProject(projectId: string): Promise<Cluster[]> {
    const rows = await this.db.query<ClusterRow>(
      "SELECT * FROM clusters WHERE project_id = ? ORDER BY created_at ASC",
      [projectId]
    );

    const clusters: Cluster[] = [];
    for (const row of rows) {
      clusters.push(await this.mapRowToCluster(row));
    }
    return clusters;
  }

  /**
   * Add a connection between two clusters.
   *
   * @param sourceId - Source cluster ID
   * @param targetId - Target cluster ID
   */
  async addClusterConnection(
    sourceId: string,
    targetId: string
  ): Promise<void> {
    const connectionId = generateId();
    await this.db.execute(
      `INSERT INTO cluster_connections (id, source_cluster_id, target_cluster_id, connection_type, strength, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (source_cluster_id, target_cluster_id, connection_type) DO NOTHING`,
      [connectionId, sourceId, targetId, "related", 0.5, nowTimestamp()]
    );
  }

  /**
   * Get a single cluster by ID.
   *
   * @param id - Cluster ID
   * @returns The cluster or null if not found
   */
  async getCluster(id: string): Promise<Cluster | null> {
    const row = await this.db.queryOne<ClusterRow>(
      "SELECT * FROM clusters WHERE id = ?",
      [id]
    );
    if (!row) return null;
    return this.mapRowToCluster(row);
  }

  /**
   * Delete a cluster by ID.
   *
   * @param clusterId - Cluster ID to delete
   */
  async deleteCluster(clusterId: string): Promise<void> {
    await this.db.execute(
      "DELETE FROM cluster_thoughts WHERE cluster_id = ?",
      [clusterId]
    );
    await this.db.execute(
      "DELETE FROM cluster_connections WHERE source_cluster_id = ? OR target_cluster_id = ?",
      [clusterId, clusterId]
    );
    await this.db.execute("DELETE FROM clusters WHERE id = ?", [clusterId]);
  }

  private async mapRowToCluster(row: ClusterRow): Promise<Cluster> {
    const metadata = parseJson<{ position?: ClusterPosition }>(
      row.metadata,
      {}
    );

    // Get thought IDs from junction table
    const thoughtRows = await this.db.query<{ thought_id: string }>(
      "SELECT thought_id FROM cluster_thoughts WHERE cluster_id = ?",
      [row.id]
    );
    const thoughtIds = thoughtRows.map((r) => r.thought_id);

    // Get connections
    const connectionRows = await this.db.query<ClusterConnectionRow>(
      "SELECT * FROM cluster_connections WHERE source_cluster_id = ?",
      [row.id]
    );
    const connections: ClusterConnection[] = connectionRows.map((c) => ({
      targetClusterId: c.target_cluster_id,
      strength: c.strength,
      label: c.connection_type !== "related" ? c.connection_type : undefined,
    }));

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      theme: row.description || "",
      thoughtIds,
      position: metadata.position,
      connections,
    };
  }

  // ==========================================================================
  // Phases
  // ==========================================================================

  /**
   * Create a new phase.
   *
   * @param phase - Phase data
   * @returns The created phase
   */
  async createPhase(phase: Phase): Promise<Phase> {
    // Get next order number
    const maxOrderRow = await this.db.queryOne<{ max_order: number | null }>(
      "SELECT MAX(phase_order) as max_order FROM phases WHERE project_id = ?",
      [phase.projectId]
    );
    const nextOrder = (maxOrderRow?.max_order ?? -1) + 1;

    await this.db.execute(
      `INSERT INTO phases (id, project_id, name, description, phase_order, status, started_at, completed_at, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        phase.id,
        phase.projectId,
        phase.name,
        phase.description,
        nextOrder,
        "pending",
        phase.startDate || null,
        phase.endDate || null,
        nowTimestamp(),
        nowTimestamp(),
        null,
      ]
    );

    // Add cluster associations via junction table
    for (const clusterId of phase.clusterIds) {
      await this.db.execute(
        `INSERT INTO phase_clusters (phase_id, cluster_id, added_at)
         VALUES (?, ?, ?)`,
        [phase.id, clusterId, nowTimestamp()]
      );
    }

    // Add dependencies
    for (const dependsOnPhaseId of phase.dependencies) {
      await this.addPhaseDependency(phase.id, dependsOnPhaseId);
    }

    return phase;
  }

  /**
   * Update a phase.
   *
   * @param id - Phase ID
   * @param updates - Partial phase updates
   */
  async updatePhase(id: string, updates: Partial<Phase>): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      params.push(updates.description);
    }
    if (updates.startDate !== undefined) {
      setClauses.push("started_at = ?");
      params.push(updates.startDate);
    }
    if (updates.endDate !== undefined) {
      setClauses.push("completed_at = ?");
      params.push(updates.endDate);
    }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = ?");
      params.push(nowTimestamp());
      params.push(id);

      await this.db.execute(
        `UPDATE phases SET ${setClauses.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Update cluster associations if provided
    if (updates.clusterIds !== undefined) {
      await this.db.execute("DELETE FROM phase_clusters WHERE phase_id = ?", [
        id,
      ]);
      for (const clusterId of updates.clusterIds) {
        await this.db.execute(
          `INSERT INTO phase_clusters (phase_id, cluster_id, added_at)
           VALUES (?, ?, ?)`,
          [id, clusterId, nowTimestamp()]
        );
      }
    }
  }

  /**
   * List all phases for a project.
   *
   * @param projectId - Project ID
   * @returns Array of phases for the project
   */
  async listPhasesForProject(projectId: string): Promise<Phase[]> {
    const rows = await this.db.query<PhaseRow>(
      "SELECT * FROM phases WHERE project_id = ? ORDER BY phase_order ASC",
      [projectId]
    );

    const phases: Phase[] = [];
    for (const row of rows) {
      phases.push(await this.mapRowToPhase(row));
    }
    return phases;
  }

  /**
   * Add a dependency between phases.
   *
   * @param phaseId - Phase that depends on another
   * @param dependsOnPhaseId - Phase that must complete first
   */
  async addPhaseDependency(
    phaseId: string,
    dependsOnPhaseId: string
  ): Promise<void> {
    const depId = generateId();
    await this.db.execute(
      `INSERT INTO phase_dependencies (id, phase_id, depends_on_phase_id, dependency_type, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (phase_id, depends_on_phase_id) DO NOTHING`,
      [depId, phaseId, dependsOnPhaseId, "finish-to-start", nowTimestamp()]
    );
  }

  private async mapRowToPhase(row: PhaseRow): Promise<Phase> {
    // Get cluster IDs from junction table
    const clusterRows = await this.db.query<{ cluster_id: string }>(
      "SELECT cluster_id FROM phase_clusters WHERE phase_id = ?",
      [row.id]
    );
    const clusterIds = clusterRows.map((r) => r.cluster_id);

    // Get dependencies
    const depRows = await this.db.query<{ depends_on_phase_id: string }>(
      "SELECT depends_on_phase_id FROM phase_dependencies WHERE phase_id = ?",
      [row.id]
    );
    const dependencies = depRows.map((r) => r.depends_on_phase_id);

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || "",
      clusterIds,
      dependencies,
      startDate: row.started_at || undefined,
      endDate: row.completed_at || undefined,
    };
  }

  // ==========================================================================
  // Risks
  // ==========================================================================

  /**
   * Create a new risk.
   *
   * @param risk - Risk data
   * @returns The created risk
   */
  async createRisk(risk: Risk): Promise<Risk> {
    // Store avoidance, mitigation, contingency in metadata
    const metadata = {
      avoidance: risk.avoidance,
      mitigation: risk.mitigation,
      contingency: risk.contingency,
      guardrailId: risk.guardrailId,
    };

    await this.db.execute(
      `INSERT INTO risks (id, project_id, title, description, risk_category, severity, likelihood, status, mitigation_strategy, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        risk.id,
        risk.projectId,
        risk.description.substring(0, 100), // title from description
        risk.description,
        "general",
        risk.impact,
        risk.likelihood,
        risk.status,
        risk.mitigation,
        nowTimestamp(),
        nowTimestamp(),
        toJson(metadata),
      ]
    );

    return risk;
  }

  /**
   * Update a risk.
   *
   * @param id - Risk ID
   * @param updates - Partial risk updates
   */
  async updateRisk(id: string, updates: Partial<Risk>): Promise<void> {
    // Get previous status for ledger (only if status is being updated)
    let previousStatus: string | undefined;
    let projectId: string | undefined;
    if (updates.status !== undefined) {
      const riskRow = await this.db.queryOne<RiskRow>(
        "SELECT status, project_id FROM risks WHERE id = ?",
        [id]
      );
      previousStatus = riskRow?.status;
      projectId = riskRow?.project_id;
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      params.push(updates.description);
      setClauses.push("title = ?");
      params.push(updates.description.substring(0, 100));
    }
    if (updates.likelihood !== undefined) {
      setClauses.push("likelihood = ?");
      params.push(updates.likelihood);
    }
    if (updates.impact !== undefined) {
      setClauses.push("severity = ?");
      params.push(updates.impact);
    }
    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      params.push(updates.status);
      if (updates.status === "resolved") {
        setClauses.push("resolved_at = ?");
        params.push(nowTimestamp());
      }
    }
    if (updates.mitigation !== undefined) {
      setClauses.push("mitigation_strategy = ?");
      params.push(updates.mitigation);
    }

    // Handle metadata updates
    if (
      updates.avoidance !== undefined ||
      updates.contingency !== undefined ||
      updates.guardrailId !== undefined
    ) {
      const existing = await this.db.queryOne<RiskRow>(
        "SELECT metadata FROM risks WHERE id = ?",
        [id]
      );
      const currentMetadata = parseJson<Record<string, unknown>>(
        existing?.metadata || null,
        {}
      );

      const newMetadata = {
        ...currentMetadata,
        ...(updates.avoidance !== undefined && {
          avoidance: updates.avoidance,
        }),
        ...(updates.contingency !== undefined && {
          contingency: updates.contingency,
        }),
        ...(updates.guardrailId !== undefined && {
          guardrailId: updates.guardrailId,
        }),
      };

      setClauses.push("metadata = ?");
      params.push(toJson(newMetadata));
    }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = ?");
      params.push(nowTimestamp());
      params.push(id);

      await this.db.execute(
        `UPDATE risks SET ${setClauses.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Emit ledger event for status changes
    if (updates.status !== undefined && previousStatus !== undefined && projectId) {
      await this.emitLedgerEvent("risk", id, projectId, previousStatus, updates.status);
    }
  }

  /**
   * List all risks for a project.
   *
   * @param projectId - Project ID
   * @returns Array of risks for the project
   */
  async listRisksForProject(projectId: string): Promise<Risk[]> {
    const rows = await this.db.query<RiskRow>(
      "SELECT * FROM risks WHERE project_id = ? ORDER BY created_at ASC",
      [projectId]
    );
    return rows.map((row) => this.mapRowToRisk(row));
  }

  private mapRowToRisk(row: RiskRow): Risk {
    const metadata = parseJson<{
      avoidance?: string;
      mitigation?: string;
      contingency?: string;
      guardrailId?: string;
    }>(row.metadata, {});

    return {
      id: row.id,
      projectId: row.project_id,
      description: row.description || row.title,
      likelihood: row.likelihood as RiskLikelihood,
      impact: row.severity as RiskImpact,
      avoidance: metadata.avoidance || "",
      mitigation: row.mitigation_strategy || metadata.mitigation || "",
      contingency: metadata.contingency || "",
      guardrailId: metadata.guardrailId,
      status: row.status as RiskStatus,
    };
  }

  // ==========================================================================
  // Guardrails
  // ==========================================================================

  /**
   * Create a new guardrail.
   *
   * @param guardrail - Guardrail data
   * @returns The created guardrail
   */
  async createGuardrail(guardrail: Guardrail): Promise<Guardrail> {
    // Store conditions and policy pattern in metadata/rule_expression
    const metadata = {
      policyPattern: guardrail.policyPattern,
      conditions: guardrail.conditions,
    };

    await this.db.execute(
      `INSERT INTO guardrails (id, project_id, name, description, guardrail_type, rule_expression, enforcement_level, is_active, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        guardrail.id,
        guardrail.projectId,
        guardrail.policyPattern.substring(0, 100), // name from pattern
        `Risk: ${guardrail.riskId}`,
        guardrail.gateType,
        guardrail.policyPattern,
        guardrail.gateType,
        true,
        nowTimestamp(),
        nowTimestamp(),
        toJson(metadata),
      ]
    );

    return guardrail;
  }

  /**
   * List all guardrails for a project.
   *
   * @param projectId - Project ID
   * @returns Array of guardrails for the project
   */
  async listGuardrailsForProject(projectId: string): Promise<Guardrail[]> {
    const rows = await this.db.query<GuardrailRow>(
      "SELECT * FROM guardrails WHERE project_id = ? ORDER BY created_at ASC",
      [projectId]
    );
    return rows.map((row) => this.mapRowToGuardrail(row));
  }

  private mapRowToGuardrail(row: GuardrailRow): Guardrail {
    const metadata = parseJson<{
      policyPattern?: string;
      conditions?: GuardrailCondition[];
    }>(row.metadata, {});

    // Extract risk ID from description (stored as "Risk: {riskId}")
    const riskIdMatch = row.description?.match(/^Risk: (.+)$/);
    const riskId = riskIdMatch ? riskIdMatch[1] : "";

    return {
      id: row.id,
      projectId: row.project_id,
      riskId,
      policyPattern: metadata.policyPattern || row.rule_expression || "",
      gateType: row.guardrail_type as GateType,
      conditions: metadata.conditions || [],
    };
  }

  // ==========================================================================
  // Tasks
  // ==========================================================================

  /**
   * Create a new task.
   *
   * @param task - Task data
   * @returns The created task
   */
  async createTask(task: Task): Promise<Task> {
    await this.db.execute(
      `INSERT INTO tasks (id, project_id, phase_id, cluster_id, title, description, task_type, status, assignee, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.projectId,
        task.phaseId,
        task.clusterId,
        task.title,
        task.description,
        "standard",
        task.status,
        task.assignee,
        nowTimestamp(),
        nowTimestamp(),
        null,
      ]
    );

    // Add dependencies
    for (const dependsOnTaskId of task.dependencies) {
      await this.addTaskDependency(task.id, dependsOnTaskId);
    }

    // Add guardrails
    for (const guardrailId of task.guardrailIds) {
      await this.addTaskGuardrail(task.id, guardrailId);
    }

    return task;
  }

  /**
   * Update a task's status.
   *
   * @param id - Task ID
   * @param status - New task status
   */
  async updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
    // Get previous status for ledger
    const taskRow = await this.db.queryOne<TaskRow>(
      "SELECT status, project_id FROM tasks WHERE id = ?",
      [id]
    );
    const previousStatus = taskRow?.status ?? "pending";
    const projectId = taskRow?.project_id ?? "";

    const updates: string[] = ["status = ?", "updated_at = ?"];
    const params: unknown[] = [status, nowTimestamp()];

    if (status === "in_progress") {
      updates.push("started_at = ?");
      params.push(nowTimestamp());
    } else if (status === "completed") {
      updates.push("completed_at = ?");
      params.push(nowTimestamp());
    }

    params.push(id);
    await this.db.execute(
      `UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    // Emit ledger event
    if (taskRow) {
      await this.emitLedgerEvent("task", id, projectId, previousStatus, status);
    }
  }

  /**
   * List all tasks for a project.
   *
   * @param projectId - Project ID
   * @returns Array of tasks for the project
   */
  async listTasksForProject(projectId: string): Promise<Task[]> {
    const rows = await this.db.query<TaskRow>(
      "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC",
      [projectId]
    );

    const tasks: Task[] = [];
    for (const row of rows) {
      tasks.push(await this.mapRowToTask(row));
    }
    return tasks;
  }

  /**
   * Add a dependency between tasks.
   *
   * @param taskId - Task that depends on another
   * @param dependsOnTaskId - Task that must complete first
   */
  async addTaskDependency(
    taskId: string,
    dependsOnTaskId: string
  ): Promise<void> {
    const depId = generateId();
    await this.db.execute(
      `INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (task_id, depends_on_task_id) DO NOTHING`,
      [depId, taskId, dependsOnTaskId, "finish-to-start", nowTimestamp()]
    );
  }

  /**
   * Add a guardrail to a task.
   *
   * @param taskId - Task ID
   * @param guardrailId - Guardrail ID
   */
  async addTaskGuardrail(taskId: string, guardrailId: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO task_guardrails (task_id, guardrail_id, applied_at)
       VALUES (?, ?, ?)
       ON CONFLICT (task_id, guardrail_id) DO NOTHING`,
      [taskId, guardrailId, nowTimestamp()]
    );
  }

  private async mapRowToTask(row: TaskRow): Promise<Task> {
    // Get dependencies
    const depRows = await this.db.query<{ depends_on_task_id: string }>(
      "SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?",
      [row.id]
    );
    const dependencies = depRows.map((r) => r.depends_on_task_id);

    // Get guardrail IDs
    const guardrailRows = await this.db.query<{ guardrail_id: string }>(
      "SELECT guardrail_id FROM task_guardrails WHERE task_id = ?",
      [row.id]
    );
    const guardrailIds = guardrailRows.map((r) => r.guardrail_id);

    return {
      id: row.id,
      projectId: row.project_id,
      phaseId: row.phase_id || "",
      clusterId: row.cluster_id || "",
      title: row.title,
      description: row.description || "",
      dependencies,
      status: row.status as TaskStatus,
      assignee: (row.assignee as TaskAssignee) || "human",
      guardrailIds,
    };
  }

  // ==========================================================================
  // Sprints
  // ==========================================================================

  /**
   * Create a new sprint.
   *
   * @param sprint - Sprint data
   * @returns The created sprint
   */
  async createSprint(sprint: Sprint): Promise<Sprint> {
    await this.db.execute(
      `INSERT INTO sprints (id, project_id, phase_id, name, goal, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sprint.id,
        sprint.projectId,
        sprint.phaseId,
        sprint.name,
        sprint.goal,
        sprint.startDate,
        sprint.endDate,
        sprint.status,
        nowTimestamp(),
        nowTimestamp(),
      ]
    );

    // Add task associations
    for (const taskId of sprint.taskIds) {
      await this.addTaskToSprint(sprint.id, taskId);
    }

    return sprint;
  }

  /**
   * Get a sprint by ID.
   *
   * @param id - Sprint ID
   * @returns The sprint or null if not found
   */
  async getSprint(id: string): Promise<Sprint | null> {
    const row = await this.db.queryOne<SprintRow>(
      "SELECT * FROM sprints WHERE id = ?",
      [id]
    );

    if (!row) return null;

    return this.mapRowToSprint(row);
  }

  /**
   * Update a sprint's status.
   * Emits a ledger event for status transitions.
   *
   * @param id - Sprint ID
   * @param status - New sprint status
   */
  async updateSprintStatus(id: string, status: SprintStatus): Promise<void> {
    // Get previous status for ledger
    const sprintRow = await this.db.queryOne<SprintRow>(
      "SELECT status, project_id FROM sprints WHERE id = ?",
      [id]
    );
    const previousStatus = sprintRow?.status ?? "planned";
    const projectId = sprintRow?.project_id ?? "";

    await this.db.execute(
      "UPDATE sprints SET status = ?, updated_at = ? WHERE id = ?",
      [status, nowTimestamp(), id]
    );

    // Emit ledger event
    if (sprintRow) {
      await this.emitLedgerEvent("sprint", id, projectId, previousStatus, status);
    }
  }

  /**
   * List all sprints for a phase.
   *
   * @param phaseId - Phase ID
   * @returns Array of sprints for the phase
   */
  async listSprintsForPhase(phaseId: string): Promise<Sprint[]> {
    const rows = await this.db.query<SprintRow>(
      "SELECT * FROM sprints WHERE phase_id = ? ORDER BY start_date ASC",
      [phaseId]
    );

    const sprints: Sprint[] = [];
    for (const row of rows) {
      sprints.push(await this.mapRowToSprint(row));
    }
    return sprints;
  }

  /**
   * Add a task to a sprint.
   *
   * @param sprintId - Sprint ID
   * @param taskId - Task ID
   */
  async addTaskToSprint(sprintId: string, taskId: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO sprint_tasks (sprint_id, task_id, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT (sprint_id, task_id) DO NOTHING`,
      [sprintId, taskId, nowTimestamp()]
    );
  }

  /**
   * Remove a task from a sprint.
   *
   * @param sprintId - Sprint ID
   * @param taskId - Task ID
   */
  async removeTaskFromSprint(sprintId: string, taskId: string): Promise<void> {
    await this.db.execute(
      "DELETE FROM sprint_tasks WHERE sprint_id = ? AND task_id = ?",
      [sprintId, taskId]
    );
  }

  private async mapRowToSprint(row: SprintRow): Promise<Sprint> {
    // Get task IDs from junction table
    const taskRows = await this.db.query<{ task_id: string }>(
      "SELECT task_id FROM sprint_tasks WHERE sprint_id = ?",
      [row.id]
    );
    const taskIds = taskRows.map((r) => r.task_id);

    return {
      id: row.id,
      projectId: row.project_id,
      phaseId: row.phase_id,
      name: row.name,
      goal: row.goal || "",
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status as SprintStatus,
      taskIds,
    };
  }

  // ==========================================================================
  // Milestones
  // ==========================================================================

  /**
   * Create a new milestone.
   *
   * @param milestone - Milestone data
   * @returns The created milestone
   */
  async createMilestone(milestone: Milestone): Promise<Milestone> {
    await this.db.execute(
      `INSERT INTO milestones (id, project_id, phase_id, name, description, target_date, achieved_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        milestone.id,
        milestone.projectId,
        milestone.phaseId || null,
        milestone.name,
        milestone.description,
        milestone.targetDate,
        milestone.achievedDate || null,
        milestone.status,
        nowTimestamp(),
        nowTimestamp(),
      ]
    );

    // Add criteria task associations
    for (const taskId of milestone.criteriaTaskIds) {
      await this.addMilestoneCriteria(milestone.id, taskId);
    }

    return milestone;
  }

  /**
   * Get a milestone by ID.
   *
   * @param id - Milestone ID
   * @returns The milestone or null if not found
   */
  async getMilestone(id: string): Promise<Milestone | null> {
    const row = await this.db.queryOne<MilestoneRow>(
      "SELECT * FROM milestones WHERE id = ?",
      [id]
    );

    if (!row) return null;

    return this.mapRowToMilestone(row);
  }

  /**
   * Update a milestone's status.
   *
   * @param id - Milestone ID
   * @param status - New milestone status
   * @param achievedDate - Optional achieved date (for 'achieved' status)
   */
  async updateMilestoneStatus(
    id: string,
    status: MilestoneStatus,
    achievedDate?: string
  ): Promise<void> {
    // Get previous status for ledger
    const milestoneRow = await this.db.queryOne<MilestoneRow>(
      "SELECT status, project_id FROM milestones WHERE id = ?",
      [id]
    );
    const previousStatus = milestoneRow?.status ?? "upcoming";
    const projectId = milestoneRow?.project_id ?? "";

    const updates: string[] = ["status = ?", "updated_at = ?"];
    const params: unknown[] = [status, nowTimestamp()];

    if (achievedDate) {
      updates.push("achieved_date = ?");
      params.push(achievedDate);
    }

    params.push(id);
    await this.db.execute(
      `UPDATE milestones SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    // Emit ledger event
    if (milestoneRow) {
      await this.emitLedgerEvent("milestone", id, projectId, previousStatus, status);
    }
  }

  /**
   * List all milestones for a project.
   *
   * @param projectId - Project ID
   * @returns Array of milestones for the project
   */
  async listMilestonesForProject(projectId: string): Promise<Milestone[]> {
    const rows = await this.db.query<MilestoneRow>(
      "SELECT * FROM milestones WHERE project_id = ? ORDER BY target_date ASC",
      [projectId]
    );

    const milestones: Milestone[] = [];
    for (const row of rows) {
      milestones.push(await this.mapRowToMilestone(row));
    }
    return milestones;
  }

  /**
   * Add a task as milestone criteria.
   *
   * @param milestoneId - Milestone ID
   * @param taskId - Task ID
   */
  async addMilestoneCriteria(
    milestoneId: string,
    taskId: string
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO milestone_criteria (milestone_id, task_id, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT (milestone_id, task_id) DO NOTHING`,
      [milestoneId, taskId, nowTimestamp()]
    );
  }

  private async mapRowToMilestone(row: MilestoneRow): Promise<Milestone> {
    // Get criteria task IDs from junction table
    const taskRows = await this.db.query<{ task_id: string }>(
      "SELECT task_id FROM milestone_criteria WHERE milestone_id = ?",
      [row.id]
    );
    const criteriaTaskIds = taskRows.map((r) => r.task_id);

    // DuckDB may return timestamps as Date objects or strings
    const formatDate = (val: unknown): string | undefined => {
      if (!val) return undefined;
      if (val instanceof Date) return val.toISOString();
      if (typeof val === "string") return val;
      return undefined;
    };

    return {
      id: row.id,
      projectId: row.project_id,
      phaseId: row.phase_id || undefined,
      name: row.name,
      description: row.description || "",
      targetDate: formatDate(row.target_date) || row.target_date,
      achievedDate: formatDate(row.achieved_date),
      status: row.status as MilestoneStatus,
      criteriaTaskIds,
    };
  }

  // ==========================================================================
  // Kanban Views
  // ==========================================================================

  /**
   * Get Kanban board view for a phase or sprint.
   * Groups tasks by status and orders by created_at within each column.
   *
   * @param options - Filter options for the board
   * @returns Kanban board with columns and tasks
   */
  async getKanbanBoard(options: {
    projectId: string;
    phaseId?: string;
    sprintId?: string;
  }): Promise<KanbanBoard> {
    // Define column mappings from TaskStatus to display names
    const columnDefs: Array<{ id: TaskStatus; name: string }> = [
      { id: "pending", name: "To Do" },
      { id: "ready", name: "Ready" },
      { id: "in_progress", name: "In Progress" },
      { id: "blocked", name: "Blocked" },
      { id: "completed", name: "Done" },
    ];

    // Build query based on filters
    let query = "SELECT * FROM tasks WHERE project_id = ?";
    const params: unknown[] = [options.projectId];

    if (options.phaseId) {
      query += " AND phase_id = ?";
      params.push(options.phaseId);
    }

    // If filtering by sprint, get task IDs from sprint_tasks junction
    let sprintTaskIds: string[] | null = null;
    if (options.sprintId) {
      const sprintTaskRows = await this.db.query<{ task_id: string }>(
        "SELECT task_id FROM sprint_tasks WHERE sprint_id = ?",
        [options.sprintId]
      );
      sprintTaskIds = sprintTaskRows.map((r) => r.task_id);
    }

    query += " ORDER BY created_at ASC";
    const taskRows = await this.db.query<TaskRow>(query, params);

    // Group tasks by status
    const tasksByStatus = new Map<TaskStatus, string[]>();
    for (const def of columnDefs) {
      tasksByStatus.set(def.id, []);
    }

    for (const row of taskRows) {
      // Filter by sprint if specified
      if (sprintTaskIds !== null && !sprintTaskIds.includes(row.id)) {
        continue;
      }

      const status = row.status as TaskStatus;
      const taskIds = tasksByStatus.get(status);
      if (taskIds) {
        taskIds.push(row.id);
      }
    }

    // Build columns
    const columns: KanbanColumn[] = columnDefs.map((def) => ({
      id: def.id,
      name: def.name,
      wipLimit: 0, // No WIP limits by default
      taskIds: tasksByStatus.get(def.id) || [],
    }));

    return {
      projectId: options.projectId,
      phaseId: options.phaseId,
      sprintId: options.sprintId,
      columns,
    };
  }

  /**
   * Move a task to a different column (update status).
   *
   * @param taskId - Task ID
   * @param newStatus - New task status
   */
  async moveTaskToColumn(taskId: string, newStatus: TaskStatus): Promise<void> {
    await this.updateTaskStatus(taskId, newStatus);
  }

  /**
   * Reorder tasks within a column.
   * Stores position in task metadata.
   *
   * @param status - Column status to reorder
   * @param taskIds - Ordered list of task IDs
   */
  async reorderTasksInColumn(
    status: TaskStatus,
    taskIds: string[]
  ): Promise<void> {
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];

      // Get current metadata
      const task = await this.db.queryOne<TaskRow>(
        "SELECT metadata FROM tasks WHERE id = ?",
        [taskId]
      );
      const currentMetadata = parseJson<Record<string, unknown>>(
        task?.metadata || null,
        {}
      );

      await this.db.execute(
        "UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?",
        [toJson({ ...currentMetadata, kanbanPosition: i }), nowTimestamp(), taskId]
      );
    }
  }

  // ==========================================================================
  // Prompt Policies
  // ==========================================================================

  /**
   * Create a new prompt policy.
   *
   * @param policy - Policy data
   * @returns The created policy
   */
  async createPromptPolicy(policy: PromptPolicy): Promise<PromptPolicy> {
    const ruleDefinition = {
      injectionDetection: policy.injectionDetection,
      jailbreakPatterns: policy.jailbreakPatterns,
      allowedTopics: policy.allowedTopics,
      blockedTopics: policy.blockedTopics,
      piiAction: policy.piiAction,
      maxTokensPerPrompt: policy.maxTokensPerPrompt,
      maxTokensPerHour: policy.maxTokensPerHour,
      maxCostPerDay: policy.maxCostPerDay,
      maxPromptsPerMinute: policy.maxPromptsPerMinute,
      cooldownSeconds: policy.cooldownSeconds,
    };

    await this.db.execute(
      `INSERT INTO prompt_policies (id, project_id, name, description, policy_type, scope, rule_definition, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        policy.id,
        policy.projectId,
        `Policy for ${policy.projectId}`,
        null,
        "prompt_governance",
        "project",
        toJson(ruleDefinition),
        true,
        nowTimestamp(),
        nowTimestamp(),
      ]
    );

    return policy;
  }

  /**
   * Get the prompt policy for a project.
   *
   * @param projectId - Project ID
   * @returns The policy or null if not found
   */
  async getPromptPolicyForProject(
    projectId: string
  ): Promise<PromptPolicy | null> {
    const row = await this.db.queryOne<PromptPolicyRow>(
      "SELECT * FROM prompt_policies WHERE project_id = ? AND is_active = true ORDER BY priority DESC LIMIT 1",
      [projectId]
    );

    if (!row) return null;

    return this.mapRowToPromptPolicy(row);
  }

  /**
   * Update a prompt policy.
   *
   * @param id - Policy ID
   * @param updates - Partial policy updates
   */
  async updatePromptPolicy(
    id: string,
    updates: Partial<PromptPolicy>
  ): Promise<void> {
    // Get current policy to merge rule definition
    const existing = await this.db.queryOne<PromptPolicyRow>(
      "SELECT rule_definition FROM prompt_policies WHERE id = ?",
      [id]
    );
    const currentRules = parseJson<Record<string, unknown>>(
      existing?.rule_definition || null,
      {}
    );

    const newRules = {
      ...currentRules,
      ...(updates.injectionDetection !== undefined && {
        injectionDetection: updates.injectionDetection,
      }),
      ...(updates.jailbreakPatterns !== undefined && {
        jailbreakPatterns: updates.jailbreakPatterns,
      }),
      ...(updates.allowedTopics !== undefined && {
        allowedTopics: updates.allowedTopics,
      }),
      ...(updates.blockedTopics !== undefined && {
        blockedTopics: updates.blockedTopics,
      }),
      ...(updates.piiAction !== undefined && { piiAction: updates.piiAction }),
      ...(updates.maxTokensPerPrompt !== undefined && {
        maxTokensPerPrompt: updates.maxTokensPerPrompt,
      }),
      ...(updates.maxTokensPerHour !== undefined && {
        maxTokensPerHour: updates.maxTokensPerHour,
      }),
      ...(updates.maxCostPerDay !== undefined && {
        maxCostPerDay: updates.maxCostPerDay,
      }),
      ...(updates.maxPromptsPerMinute !== undefined && {
        maxPromptsPerMinute: updates.maxPromptsPerMinute,
      }),
      ...(updates.cooldownSeconds !== undefined && {
        cooldownSeconds: updates.cooldownSeconds,
      }),
    };

    await this.db.execute(
      "UPDATE prompt_policies SET rule_definition = ?, updated_at = ? WHERE id = ?",
      [toJson(newRules), nowTimestamp(), id]
    );
  }

  private mapRowToPromptPolicy(row: PromptPolicyRow): PromptPolicy {
    const rules = parseJson<{
      injectionDetection?: InjectionDetectionLevel;
      jailbreakPatterns?: string[];
      allowedTopics?: string[];
      blockedTopics?: string[];
      piiAction?: PIIAction;
      maxTokensPerPrompt?: number;
      maxTokensPerHour?: number;
      maxCostPerDay?: number;
      maxPromptsPerMinute?: number;
      cooldownSeconds?: number;
    }>(row.rule_definition, {});

    return {
      id: row.id,
      projectId: row.project_id || "",
      injectionDetection: rules.injectionDetection || "standard",
      jailbreakPatterns: rules.jailbreakPatterns || [],
      allowedTopics: rules.allowedTopics || [],
      blockedTopics: rules.blockedTopics || [],
      piiAction: rules.piiAction || "warn",
      maxTokensPerPrompt: rules.maxTokensPerPrompt || 4096,
      maxTokensPerHour: rules.maxTokensPerHour || 100000,
      maxCostPerDay: rules.maxCostPerDay || 10,
      maxPromptsPerMinute: rules.maxPromptsPerMinute || 60,
      cooldownSeconds: rules.cooldownSeconds || 60,
    };
  }

  // ==========================================================================
  // Prompt Audit
  // ==========================================================================

  /**
   * Log a prompt audit entry.
   *
   * @param entry - Audit entry data
   */
  async logPromptAudit(entry: PromptAuditEntry): Promise<void> {
    const violations = {
      sensitiveDataTypes: entry.sensitiveDataTypes,
      reasons: entry.reasons,
      gatesTriggered: entry.gatesTriggered,
    };

    await this.db.execute(
      `INSERT INTO prompt_audit (id, project_id, prompt_hash, evaluation_result, decision, decision_reason, actor_id, evaluated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.requestId,
        entry.projectId,
        entry.promptHash,
        entry.jailbreakMatch ? "jailbreak_detected" : "evaluated",
        entry.decision,
        entry.reasons.join("; "),
        entry.actorId,
        entry.timestamp,
        toJson({
          promptLengthTokens: entry.promptLengthTokens,
          injectionScore: entry.injectionScore,
          jailbreakMatch: entry.jailbreakMatch,
          violations,
        }),
      ]
    );
  }

  /**
   * Get prompt audit history for a project.
   *
   * @param projectId - Project ID
   * @param limit - Maximum number of entries to return (default: 100)
   * @returns Array of audit entries, newest first
   */
  async getPromptAuditHistory(
    projectId: string,
    limit: number = 100
  ): Promise<PromptAuditEntry[]> {
    const rows = await this.db.query<PromptAuditRow>(
      "SELECT * FROM prompt_audit WHERE project_id = ? ORDER BY evaluated_at DESC LIMIT ?",
      [projectId, limit]
    );
    return rows.map((row) => this.mapRowToPromptAuditEntry(row));
  }

  private mapRowToPromptAuditEntry(row: PromptAuditRow): PromptAuditEntry {
    const metadata = parseJson<{
      promptLengthTokens?: number;
      injectionScore?: number;
      jailbreakMatch?: boolean;
      violations?: {
        sensitiveDataTypes?: SensitiveDataType[];
        reasons?: string[];
        gatesTriggered?: string[];
      };
    }>(row.metadata, {});

    return {
      requestId: row.id,
      timestamp: row.evaluated_at,
      promptHash: row.prompt_hash,
      promptLengthTokens: metadata.promptLengthTokens || 0,
      injectionScore: metadata.injectionScore || 0,
      jailbreakMatch: metadata.jailbreakMatch || false,
      sensitiveDataTypes: metadata.violations?.sensitiveDataTypes || [],
      decision: row.decision as PromptDecision,
      reasons: metadata.violations?.reasons ||
        (row.decision_reason ? [row.decision_reason] : []),
      gatesTriggered: metadata.violations?.gatesTriggered || [],
      projectId: row.project_id || "",
      actorId: row.actor_id || "",
    };
  }
}
