-- =============================================================================
-- Project Tab DuckDB Schema
-- Complete storage schema for project genesis, thoughts, clusters, phases,
-- risks, guardrails, tasks, and prompt governance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Projects: Top-level container for all project data
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR DEFAULT 'active',
    metadata JSON
);

-- NOTE: idx_projects_status removed due to DuckDB bug where updating an indexed
-- column on a table with foreign key references causes constraint violations.
-- See: https://github.com/duckdb/duckdb/issues (foreign key + index interaction)
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- -----------------------------------------------------------------------------
-- Genesis Sessions: Capture initial project ideation and exploration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genesis_sessions (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    session_type VARCHAR NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR DEFAULT 'active',
    context JSON,
    summary TEXT,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_genesis_sessions_project ON genesis_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_genesis_sessions_status ON genesis_sessions(status);
CREATE INDEX IF NOT EXISTS idx_genesis_sessions_type ON genesis_sessions(session_type);

-- -----------------------------------------------------------------------------
-- Thoughts: Individual ideas, insights, and considerations during genesis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thoughts (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR NOT NULL REFERENCES genesis_sessions(id) ,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    content TEXT NOT NULL,
    thought_type VARCHAR NOT NULL,
    source VARCHAR,
    confidence DOUBLE DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    status VARCHAR DEFAULT 'pending',
    parent_thought_id VARCHAR REFERENCES thoughts(id),
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_thoughts_session ON thoughts(session_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_project ON thoughts(project_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_type ON thoughts(thought_type);
CREATE INDEX IF NOT EXISTS idx_thoughts_status ON thoughts(status);
CREATE INDEX IF NOT EXISTS idx_thoughts_parent ON thoughts(parent_thought_id);

-- -----------------------------------------------------------------------------
-- Embeddings: Vector representations of thoughts for semantic search
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embeddings (
    id VARCHAR PRIMARY KEY,
    thought_id VARCHAR NOT NULL REFERENCES thoughts(id) ,
    model_id VARCHAR NOT NULL,
    vector DOUBLE[] NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_embeddings_thought ON embeddings(thought_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model_id);

-- -----------------------------------------------------------------------------
-- Clusters: Groups of semantically related thoughts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clusters (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    name VARCHAR NOT NULL,
    description TEXT,
    cluster_type VARCHAR NOT NULL,
    centroid DOUBLE[],
    coherence_score DOUBLE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR DEFAULT 'active',
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_clusters_project ON clusters(project_id);
CREATE INDEX IF NOT EXISTS idx_clusters_type ON clusters(cluster_type);
CREATE INDEX IF NOT EXISTS idx_clusters_status ON clusters(status);

-- -----------------------------------------------------------------------------
-- Cluster Thoughts: Junction table for thoughts belonging to clusters
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cluster_thoughts (
    cluster_id VARCHAR NOT NULL REFERENCES clusters(id) ,
    thought_id VARCHAR NOT NULL REFERENCES thoughts(id) ,
    membership_score DOUBLE DEFAULT 1.0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cluster_id, thought_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_thoughts_cluster ON cluster_thoughts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_thoughts_thought ON cluster_thoughts(thought_id);

-- -----------------------------------------------------------------------------
-- Cluster Connections: Relationships between clusters
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cluster_connections (
    id VARCHAR PRIMARY KEY,
    source_cluster_id VARCHAR NOT NULL REFERENCES clusters(id) ,
    target_cluster_id VARCHAR NOT NULL REFERENCES clusters(id) ,
    connection_type VARCHAR NOT NULL,
    strength DOUBLE DEFAULT 0.5,
    bidirectional BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    UNIQUE (source_cluster_id, target_cluster_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_cluster_connections_source ON cluster_connections(source_cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_connections_target ON cluster_connections(target_cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_connections_type ON cluster_connections(connection_type);

-- -----------------------------------------------------------------------------
-- Phases: Project lifecycle stages derived from cluster analysis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phases (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    name VARCHAR NOT NULL,
    description TEXT,
    phase_order INTEGER NOT NULL,
    status VARCHAR DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    estimated_duration_hours DOUBLE,
    actual_duration_hours DOUBLE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_phases_project ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_status ON phases(status);
CREATE INDEX IF NOT EXISTS idx_phases_order ON phases(phase_order);

-- -----------------------------------------------------------------------------
-- Phase Clusters: Junction table linking clusters to phases
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase_clusters (
    phase_id VARCHAR NOT NULL REFERENCES phases(id) ,
    cluster_id VARCHAR NOT NULL REFERENCES clusters(id) ,
    relevance_score DOUBLE DEFAULT 1.0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (phase_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_clusters_phase ON phase_clusters(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_clusters_cluster ON phase_clusters(cluster_id);

-- -----------------------------------------------------------------------------
-- Phase Dependencies: Ordering and prerequisites between phases
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase_dependencies (
    id VARCHAR PRIMARY KEY,
    phase_id VARCHAR NOT NULL REFERENCES phases(id) ,
    depends_on_phase_id VARCHAR NOT NULL REFERENCES phases(id) ,
    dependency_type VARCHAR NOT NULL DEFAULT 'finish-to-start',
    lag_hours DOUBLE DEFAULT 0,
    required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    UNIQUE (phase_id, depends_on_phase_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_dependencies_phase ON phase_dependencies(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_dependencies_depends_on ON phase_dependencies(depends_on_phase_id);

-- -----------------------------------------------------------------------------
-- Risks: Identified risks from thought analysis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risks (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    phase_id VARCHAR REFERENCES phases(id) ,
    title VARCHAR NOT NULL,
    description TEXT,
    risk_category VARCHAR NOT NULL,
    severity VARCHAR NOT NULL,
    likelihood VARCHAR NOT NULL,
    impact_score DOUBLE,
    status VARCHAR DEFAULT 'identified',
    mitigation_strategy TEXT,
    source_thought_id VARCHAR REFERENCES thoughts(id) ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_phase ON risks(phase_id);
CREATE INDEX IF NOT EXISTS idx_risks_severity ON risks(severity);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_category ON risks(risk_category);

-- -----------------------------------------------------------------------------
-- Guardrails: Constraints and safety boundaries for project execution
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guardrails (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    phase_id VARCHAR REFERENCES phases(id) ,
    name VARCHAR NOT NULL,
    description TEXT,
    guardrail_type VARCHAR NOT NULL,
    rule_expression TEXT,
    enforcement_level VARCHAR DEFAULT 'warn',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_guardrails_project ON guardrails(project_id);
CREATE INDEX IF NOT EXISTS idx_guardrails_phase ON guardrails(phase_id);
CREATE INDEX IF NOT EXISTS idx_guardrails_type ON guardrails(guardrail_type);
CREATE INDEX IF NOT EXISTS idx_guardrails_active ON guardrails(is_active);

-- -----------------------------------------------------------------------------
-- Tasks: Actionable work items derived from phases and clusters
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ,
    phase_id VARCHAR REFERENCES phases(id) ,
    cluster_id VARCHAR REFERENCES clusters(id) ,
    title VARCHAR NOT NULL,
    description TEXT,
    task_type VARCHAR NOT NULL,
    priority VARCHAR DEFAULT 'medium',
    status VARCHAR DEFAULT 'pending',
    assignee VARCHAR,
    estimated_hours DOUBLE,
    actual_hours DOUBLE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    due_at TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_cluster ON tasks(cluster_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);

-- -----------------------------------------------------------------------------
-- Task Dependencies: Prerequisites between tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_dependencies (
    id VARCHAR PRIMARY KEY,
    task_id VARCHAR NOT NULL REFERENCES tasks(id) ,
    depends_on_task_id VARCHAR NOT NULL REFERENCES tasks(id) ,
    dependency_type VARCHAR NOT NULL DEFAULT 'finish-to-start',
    required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

-- -----------------------------------------------------------------------------
-- Task Guardrails: Junction table linking guardrails to tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_guardrails (
    task_id VARCHAR NOT NULL REFERENCES tasks(id) ,
    guardrail_id VARCHAR NOT NULL REFERENCES guardrails(id) ,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, guardrail_id)
);

CREATE INDEX IF NOT EXISTS idx_task_guardrails_task ON task_guardrails(task_id);
CREATE INDEX IF NOT EXISTS idx_task_guardrails_guardrail ON task_guardrails(guardrail_id);

-- -----------------------------------------------------------------------------
-- Sprints: Time-boxed iterations within phases
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sprints (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    phase_id VARCHAR NOT NULL REFERENCES phases(id),
    name VARCHAR NOT NULL,
    goal TEXT,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_phase ON sprints(phase_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);

-- -----------------------------------------------------------------------------
-- Sprint Tasks: Junction table linking tasks to sprints
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sprint_tasks (
    sprint_id VARCHAR NOT NULL REFERENCES sprints(id),
    task_id VARCHAR NOT NULL REFERENCES tasks(id),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sprint_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_sprint_tasks_sprint ON sprint_tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_task ON sprint_tasks(task_id);

-- -----------------------------------------------------------------------------
-- Milestones: Significant project checkpoints
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    phase_id VARCHAR REFERENCES phases(id),
    name VARCHAR NOT NULL,
    description TEXT,
    target_date TIMESTAMP NOT NULL,
    achieved_date TIMESTAMP,
    status VARCHAR DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_phase ON milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_target_date ON milestones(target_date);

-- -----------------------------------------------------------------------------
-- Milestone Criteria: Tasks required for milestone achievement
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestone_criteria (
    milestone_id VARCHAR NOT NULL REFERENCES milestones(id),
    task_id VARCHAR NOT NULL REFERENCES tasks(id),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (milestone_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_criteria_milestone ON milestone_criteria(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_criteria_task ON milestone_criteria(task_id);

-- -----------------------------------------------------------------------------
-- Prompt Policies: Governance rules for prompt generation and execution
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_policies (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id) ,
    name VARCHAR NOT NULL,
    description TEXT,
    policy_type VARCHAR NOT NULL,
    scope VARCHAR NOT NULL DEFAULT 'project',
    rule_definition JSON NOT NULL,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_prompt_policies_project ON prompt_policies(project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_policies_type ON prompt_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_prompt_policies_scope ON prompt_policies(scope);
CREATE INDEX IF NOT EXISTS idx_prompt_policies_active ON prompt_policies(is_active);

-- -----------------------------------------------------------------------------
-- Prompt Audit: Audit trail for prompt policy evaluations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_audit (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id) ,
    task_id VARCHAR REFERENCES tasks(id) ,
    policy_id VARCHAR REFERENCES prompt_policies(id) ,
    prompt_hash VARCHAR NOT NULL,
    prompt_preview VARCHAR,
    evaluation_result VARCHAR NOT NULL,
    matched_rules JSON,
    violations JSON,
    decision VARCHAR NOT NULL,
    decision_reason TEXT,
    actor_id VARCHAR,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time_ms DOUBLE,
    metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_prompt_audit_project ON prompt_audit(project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_task ON prompt_audit(task_id);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_policy ON prompt_audit(policy_id);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_result ON prompt_audit(evaluation_result);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_decision ON prompt_audit(decision);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_evaluated_at ON prompt_audit(evaluated_at);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_actor ON prompt_audit(actor_id);

-- -----------------------------------------------------------------------------
-- Schema version tracking for migrations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name VARCHAR NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR
);

-- Insert initial migration record
INSERT INTO schema_migrations (version, name, checksum)
SELECT 1, 'initial_schema', 'duckdb_project_tab_v1'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 1);

-- -----------------------------------------------------------------------------
-- Migration v2: Add project tracking fields (Phase 10)
-- -----------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_path VARCHAR;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_id VARCHAR;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;

INSERT INTO schema_migrations (version, name, checksum)
SELECT 2, 'add_project_tracking_fields', 'phase10_v1'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 2);
