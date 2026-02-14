import * as duckdb from "duckdb";
import * as fs from "fs";
import * as path from "path";

/**
 * Configuration options for the DuckDB client.
 */
export interface DuckDBClientOptions {
  /** Path to the database file. Use ':memory:' for in-memory database (testing). */
  dbPath: string;
  /** Open database in read-only mode. Default: false */
  readOnly?: boolean;
  /** Access mode for DuckDB. Default: determined by readOnly flag */
  accessMode?: number;
}

/**
 * Result metadata from query execution.
 */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/**
 * Error thrown when DuckDB operations fail.
 */
export class DuckDBError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(`DuckDB ${operation} failed: ${message}`);
    this.name = "DuckDBError";
  }
}

/**
 * DuckDB client wrapper providing Promise-based async interface
 * for DuckDB's callback-based API.
 *
 * @example
 * ```typescript
 * const client = new DuckDBClient({ dbPath: ':memory:' });
 * await client.initialize();
 * await client.runMigrations('./schema.sql');
 *
 * const projects = await client.query<{ id: string; name: string }>(
 *   'SELECT id, name FROM projects WHERE status = ?',
 *   ['active']
 * );
 *
 * await client.close();
 * ```
 */
export class DuckDBClient {
  private db: duckdb.Database | null = null;
  private connection: duckdb.Connection | null = null;
  private readonly options: DuckDBClientOptions;
  private initialized = false;

  constructor(options: DuckDBClientOptions) {
    this.options = {
      readOnly: false,
      ...options,
    };
  }

  /**
   * Initialize the database connection.
   * Must be called before any query operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const dbPath = this.options.dbPath;

    // Create directory for persistent databases
    if (dbPath !== ":memory:") {
      const directory = path.dirname(dbPath);
      if (directory && directory !== ".") {
        fs.mkdirSync(directory, { recursive: true });
      }
    }

    // Determine access mode
    const accessMode =
      this.options.accessMode ??
      (this.options.readOnly ? duckdb.OPEN_READONLY : duckdb.OPEN_READWRITE | duckdb.OPEN_CREATE);

    return new Promise((resolve, reject) => {
      this.db = new duckdb.Database(dbPath, accessMode, (err) => {
        if (err) {
          reject(new DuckDBError(err.message, "initialize", err));
          return;
        }

        // Create connection
        this.connection = this.db!.connect();
        this.initialized = true;
        resolve();
      });
    });
  }

  /**
   * Execute a query and return results.
   *
   * @param sql - SQL query string with optional parameter placeholders (?)
   * @param params - Array of parameter values to bind
   * @returns Array of result rows typed as T
   * @throws DuckDBError if query fails or client not initialized
   */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const callback = (err: duckdb.DuckDbError | null, result: duckdb.TableData) => {
        if (err) {
          reject(new DuckDBError(err.message, "query", err));
          return;
        }
        resolve((result ?? []) as T[]);
      };

      if (params && params.length > 0) {
        this.connection!.all(sql, ...params, callback);
      } else {
        this.connection!.all(sql, callback);
      }
    });
  }

  /**
   * Execute a query that returns a single row.
   *
   * @param sql - SQL query string
   * @param params - Array of parameter values
   * @returns Single result row or undefined if no results
   */
  async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const results = await this.query<T>(sql, params);
    return results[0];
  }

  /**
   * Execute a statement that does not return results (INSERT, UPDATE, DELETE, etc).
   *
   * @param sql - SQL statement string
   * @param params - Array of parameter values
   * @throws DuckDBError if execution fails
   */
  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const callback = (err: duckdb.DuckDbError | null) => {
        if (err) {
          reject(new DuckDBError(err.message, "execute", err));
          return;
        }
        resolve();
      };

      if (params && params.length > 0) {
        this.connection!.run(sql, ...params, callback);
      } else {
        this.connection!.run(sql, callback);
      }
    });
  }

  /**
   * Execute multiple statements in sequence.
   *
   * @param sql - SQL script containing multiple statements
   * @throws DuckDBError if execution fails
   */
  async executeScript(sql: string): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.connection!.exec(sql, (err) => {
        if (err) {
          reject(new DuckDBError(err.message, "executeScript", err));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Run database migrations from a schema SQL file.
   *
   * @param schemaPath - Absolute path to the schema SQL file
   * @throws DuckDBError if file read or migration execution fails
   */
  async runMigrations(schemaPath: string): Promise<void> {
    this.ensureInitialized();

    let schema: string;
    try {
      schema = fs.readFileSync(schemaPath, "utf-8");
    } catch (err) {
      throw new DuckDBError(
        `Failed to read schema file: ${schemaPath}`,
        "runMigrations",
        err instanceof Error ? err : undefined,
      );
    }

    await this.executeScript(schema);
  }

  /**
   * Execute a function within a transaction.
   * Automatically commits on success, rolls back on error.
   *
   * @param fn - Async function to execute within transaction
   * @returns Result of the transaction function
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.execute("BEGIN TRANSACTION");
    try {
      const result = await fn();
      await this.execute("COMMIT");
      return result;
    } catch (err) {
      await this.execute("ROLLBACK");
      throw err;
    }
  }

  /**
   * Prepare a statement for repeated execution.
   * Returns a wrapper with run/all methods.
   *
   * @param sql - SQL statement to prepare
   * @returns Prepared statement wrapper
   */
  async prepare(sql: string): Promise<PreparedStatement> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const stmt = this.connection!.prepare(sql, (err) => {
        if (err) {
          reject(new DuckDBError(err.message, "prepare", err));
          return;
        }
        resolve(new PreparedStatement(stmt));
      });
    });
  }

  /**
   * Check if the client is initialized and connected.
   */
  isInitialized(): boolean {
    return this.initialized && this.db !== null && this.connection !== null;
  }

  /**
   * Get the database path.
   */
  getDbPath(): string {
    return this.options.dbPath;
  }

  /**
   * Close the database connection and release resources.
   * Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connection = null;

      this.db!.close((err) => {
        this.db = null;
        this.initialized = false;

        if (err) {
          reject(new DuckDBError(err.message, "close", err));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Ensure client is initialized before operations.
   * @throws DuckDBError if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.connection) {
      throw new DuckDBError("Client not initialized. Call initialize() first.", "ensureInitialized");
    }
  }
}

/**
 * Wrapper for DuckDB prepared statements.
 */
export class PreparedStatement {
  constructor(private readonly stmt: duckdb.Statement) {}

  /**
   * Execute the prepared statement and return all results.
   */
  async all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.stmt.all(...params, (err: duckdb.DuckDbError | null, result: T[]) => {
        if (err) {
          reject(new DuckDBError(err.message, "prepared.all", err));
          return;
        }
        resolve(result ?? []);
      });
    });
  }

  /**
   * Execute the prepared statement for side effects.
   */
  async run(...params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stmt.run(...params, (err: duckdb.DuckDbError | null) => {
        if (err) {
          reject(new DuckDBError(err.message, "prepared.run", err));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Finalize the prepared statement, releasing resources.
   */
  async finalize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stmt.finalize((err) => {
        if (err) {
          reject(new DuckDBError(err.message, "prepared.finalize", err));
          return;
        }
        resolve();
      });
    });
  }
}

/**
 * Create and initialize a DuckDB client in one call.
 *
 * @param options - Client configuration options
 * @returns Initialized DuckDB client
 */
export async function createDuckDBClient(options: DuckDBClientOptions): Promise<DuckDBClient> {
  const client = new DuckDBClient(options);
  await client.initialize();
  return client;
}
