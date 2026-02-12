import Database from "better-sqlite3";

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimiter {
  allow(key: string, nowMs?: number): boolean;
}

type Bucket = {
  count: number;
  resetAt: number;
};

export class ProxyRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimitOptions) {}

  allow(key: string, nowMs = Date.now()): boolean {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= nowMs) {
      this.buckets.set(key, {
        count: 1,
        resetAt: nowMs + this.options.windowMs,
      });
      return true;
    }

    if (existing.count >= this.options.maxRequests) {
      return false;
    }

    existing.count += 1;
    return true;
  }
}

export interface SqliteRateLimitOptions extends RateLimitOptions {
  dbPath: string;
  tableName?: string;
}

type SqliteBucket = {
  count: number;
  reset_at: number;
};

export class SqliteRateLimiter implements RateLimiter {
  private readonly db: Database.Database;
  private readonly tableName: string;
  private readonly selectStmt: Database.Statement<[string], SqliteBucket>;
  private readonly insertStmt: Database.Statement<[string, number, number]>;
  private readonly updateStmt: Database.Statement<[number, number, string]>;
  private readonly vacuumStmt: Database.Statement<[number]>;

  constructor(private readonly options: SqliteRateLimitOptions) {
    this.db = new Database(options.dbPath);
    const candidateTable = options.tableName ?? "proxy_rate_limit";
    if (!/^[A-Za-z0-9_]+$/.test(candidateTable)) {
      throw new Error("Invalid sqlite rate-limit table name");
    }
    this.tableName = candidateTable;
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      );`,
    );
    this.selectStmt = this.db.prepare(
      `SELECT count, reset_at FROM ${this.tableName} WHERE key = ?`,
    ) as Database.Statement<[string], SqliteBucket>;
    this.insertStmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (key, count, reset_at) VALUES (?, ?, ?)`,
    ) as Database.Statement<[string, number, number]>;
    this.updateStmt = this.db.prepare(
      `UPDATE ${this.tableName} SET count = ?, reset_at = ? WHERE key = ?`,
    ) as Database.Statement<[number, number, string]>;
    this.vacuumStmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE reset_at <= ?`,
    ) as Database.Statement<[number]>;
  }

  allow(key: string, nowMs = Date.now()): boolean {
    const tx = this.db.transaction((k: string, now: number) => {
      const existing = this.selectStmt.get(k);
      if (!existing || existing.reset_at <= now) {
        const nextReset = now + this.options.windowMs;
        if (!existing) {
          this.insertStmt.run(k, 1, nextReset);
        } else {
          this.updateStmt.run(1, nextReset, k);
        }
        return true;
      }
      if (existing.count >= this.options.maxRequests) {
        return false;
      }
      this.updateStmt.run(existing.count + 1, existing.reset_at, k);
      return true;
    });

    const allowed = tx(key, nowMs);
    this.vacuumStmt.run(nowMs);
    return allowed;
  }

  close(): void {
    this.db.close();
  }
}
