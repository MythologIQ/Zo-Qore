/**
 * Project Tab DuckDB Storage Layer
 *
 * Provides persistent storage for project genesis sessions, thoughts,
 * clusters, phases, tasks, risks, guardrails, and prompt governance.
 *
 * @example
 * ```typescript
 * import { createDuckDBClient, DuckDBClient } from './storage';
 * import * as path from 'path';
 *
 * const client = await createDuckDBClient({ dbPath: './data/project.duckdb' });
 * await client.runMigrations(path.join(__dirname, 'duckdb-schema.sql'));
 *
 * // Insert a project
 * await client.execute(
 *   'INSERT INTO projects (id, name, description) VALUES (?, ?, ?)',
 *   ['proj-001', 'My Project', 'A new project']
 * );
 *
 * // Query projects
 * const projects = await client.query<{ id: string; name: string }>(
 *   'SELECT id, name FROM projects WHERE status = ?',
 *   ['active']
 * );
 *
 * await client.close();
 * ```
 */

export { DuckDBClient, DuckDBClientOptions, DuckDBError, PreparedStatement, createDuckDBClient } from "./duckdb-client";
