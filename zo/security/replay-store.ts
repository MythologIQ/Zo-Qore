import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

export interface ReplayStore {
  remember(actorId: string, nonce: string, ttlMs: number, nowMs?: number): boolean;
}

export interface ReplayStoreCloseable extends ReplayStore {
  close?: () => void;
}

export interface MemoryReplayStoreOptions {
  maxEntries: number;
}

export class MemoryReplayStore implements ReplayStore {
  private readonly entries = new Map<string, number>();

  constructor(private readonly options: MemoryReplayStoreOptions) {}

  remember(actorId: string, nonce: string, ttlMs: number, nowMs = Date.now()): boolean {
    this.pruneExpired(nowMs);
    const key = `${actorId}::${nonce}`;
    const existing = this.entries.get(key);
    if (existing && existing > nowMs) {
      return false;
    }
    this.evictIfNeeded();
    this.entries.set(key, nowMs + ttlMs);
    return true;
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, expiresAt] of this.entries.entries()) {
      if (expiresAt <= nowMs) {
        this.entries.delete(key);
      }
    }
  }

  private evictIfNeeded(): void {
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}

export interface SqliteReplayStoreOptions {
  dbPath: string;
  tableName?: string;
}

type ReplayRecord = {
  expires_at: number;
};

export class SqliteReplayStore implements ReplayStoreCloseable {
  private readonly db: Database.Database;
  private readonly tableName: string;
  private readonly selectStmt: Database.Statement<[string, string], ReplayRecord>;
  private readonly insertStmt: Database.Statement<[string, string, number]>;
  private readonly updateStmt: Database.Statement<[number, string, string]>;
  private readonly pruneStmt: Database.Statement<[number]>;

  constructor(options: SqliteReplayStoreOptions) {
    const directory = path.dirname(options.dbPath);
    if (directory && directory !== ".") {
      fs.mkdirSync(directory, { recursive: true });
    }
    this.db = new Database(options.dbPath);
    const candidateTable = options.tableName ?? "proxy_actor_replay";
    if (!/^[A-Za-z0-9_]+$/.test(candidateTable)) {
      throw new Error("Invalid sqlite replay table name");
    }
    this.tableName = candidateTable;
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        actor_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (actor_id, nonce)
      );`,
    );
    this.selectStmt = this.db.prepare(
      `SELECT expires_at FROM ${this.tableName} WHERE actor_id = ? AND nonce = ?`,
    ) as Database.Statement<[string, string], ReplayRecord>;
    this.insertStmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (actor_id, nonce, expires_at) VALUES (?, ?, ?)`,
    ) as Database.Statement<[string, string, number]>;
    this.updateStmt = this.db.prepare(
      `UPDATE ${this.tableName} SET expires_at = ? WHERE actor_id = ? AND nonce = ?`,
    ) as Database.Statement<[number, string, string]>;
    this.pruneStmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE expires_at <= ?`,
    ) as Database.Statement<[number]>;
  }

  remember(actorId: string, nonce: string, ttlMs: number, nowMs = Date.now()): boolean {
    const tx = this.db.transaction((actor: string, n: string, ttl: number, now: number) => {
      const existing = this.selectStmt.get(actor, n);
      if (existing && existing.expires_at > now) {
        return false;
      }
      const expiresAt = now + ttl;
      if (existing) {
        this.updateStmt.run(expiresAt, actor, n);
      } else {
        this.insertStmt.run(actor, n, expiresAt);
      }
      return true;
    });
    const allowed = tx(actorId, nonce, ttlMs, nowMs);
    this.pruneStmt.run(nowMs);
    return allowed;
  }

  close(): void {
    this.db.close();
  }
}
