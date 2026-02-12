import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import Database from "better-sqlite3";
import { LedgerEntry, LedgerEventType, RiskGrade } from "@mythologiq/qore-contracts/schemas/shared.types";
import { SecretStore } from "@mythologiq/qore-contracts/runtime/interfaces";

type LedgerRow = {
  id: number;
  timestamp: string;
  event_type: LedgerEventType;
  agent_did: string;
  agent_trust_at_action: number | null;
  model_version: string | null;
  artifact_path: string | null;
  artifact_hash: string | null;
  risk_grade: RiskGrade | null;
  verification_method: string | null;
  verification_result: string | null;
  sentinel_confidence: number | null;
  overseer_did: string | null;
  overseer_decision: string | null;
  gdpr_trigger: number;
  payload: string | null;
  entry_hash: string;
  prev_hash: string;
  signature: string;
};

export interface LedgerAppendRequest {
  eventType: LedgerEventType;
  agentDid: string;
  agentTrustAtAction?: number;
  modelVersion?: string;
  artifactPath?: string;
  artifactHash?: string;
  riskGrade?: RiskGrade;
  verificationMethod?: string;
  verificationResult?: string;
  sentinelConfidence?: number;
  overseerDid?: string;
  overseerDecision?: string;
  gdprTrigger?: boolean;
  payload?: Record<string, unknown>;
}

export interface LedgerManagerOptions {
  ledgerPath: string;
  secretStore?: SecretStore;
}

export class LedgerManager {
  private readonly options: LedgerManagerOptions;
  private db: Database.Database | undefined;
  private lastHash = "GENESIS_HASH_PLACEHOLDER";
  private cachedSecret = "";

  constructor(options: LedgerManagerOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    this.close();
    this.cachedSecret = await this.ensureSecret();

    const ledgerDir = path.dirname(this.options.ledgerPath);
    if (!fs.existsSync(ledgerDir)) {
      fs.mkdirSync(ledgerDir, { recursive: true });
    }

    this.db = new Database(this.options.ledgerPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    this.loadLastHash();
  }

  async appendEntry(request: LedgerAppendRequest): Promise<LedgerEntry> {
    if (!this.db) throw new Error("Ledger DB not initialized");
    const timestamp = new Date().toISOString();
    const prevHash = this.lastHash;

    const hashPayload = {
      timestamp,
      eventType: request.eventType,
      agentDid: request.agentDid,
      payload: request.payload,
      prevHash,
    };

    const entryHash = this.calculateHash(JSON.stringify(hashPayload));
    const signature = this.sign(entryHash);

    const sql = `
      INSERT INTO soa_ledger (
        timestamp, event_type, agent_did, agent_trust_at_action,
        model_version, artifact_path, artifact_hash, risk_grade,
        verification_method, verification_result, sentinel_confidence,
        overseer_did, overseer_decision, gdpr_trigger, payload,
        entry_hash, prev_hash, signature
      ) VALUES (
        @timestamp, @eventType, @agentDid, @agentTrustAtAction,
        @modelVersion, @artifactPath, @artifactHash, @riskGrade,
        @verificationMethod, @verificationResult, @sentinelConfidence,
        @overseerDid, @overseerDecision, @gdprTrigger, @payload,
        @entryHash, @prevHash, @signature
      )
    `;

    const info = this.db.prepare(sql).run({
      timestamp,
      eventType: request.eventType,
      agentDid: request.agentDid,
      agentTrustAtAction: request.agentTrustAtAction ?? null,
      modelVersion: request.modelVersion ?? null,
      artifactPath: request.artifactPath ?? null,
      artifactHash: request.artifactHash ?? null,
      riskGrade: request.riskGrade ?? null,
      verificationMethod: request.verificationMethod ?? null,
      verificationResult: request.verificationResult ?? null,
      sentinelConfidence: request.sentinelConfidence ?? null,
      overseerDid: request.overseerDid ?? null,
      overseerDecision: request.overseerDecision ?? null,
      gdprTrigger: request.gdprTrigger ? 1 : 0,
      payload: request.payload ? JSON.stringify(request.payload) : null,
      entryHash,
      prevHash,
      signature,
    });

    this.lastHash = entryHash;
    return {
      id: Number(info.lastInsertRowid),
      timestamp,
      eventType: request.eventType,
      agentDid: request.agentDid,
      agentTrustAtAction: request.agentTrustAtAction ?? 0,
      modelVersion: request.modelVersion,
      artifactPath: request.artifactPath,
      artifactHash: request.artifactHash,
      riskGrade: request.riskGrade,
      verificationMethod: request.verificationMethod,
      verificationResult: request.verificationResult,
      sentinelConfidence: request.sentinelConfidence,
      overseerDid: request.overseerDid,
      overseerDecision: request.overseerDecision,
      gdprTrigger: Boolean(request.gdprTrigger),
      payload: request.payload ?? {},
      entryHash,
      prevHash,
      signature,
    };
  }

  async getRecentEntries(limit = 50): Promise<LedgerEntry[]> {
    if (!this.db) return [];
    const rows = this.db
      .prepare("SELECT * FROM soa_ledger ORDER BY id DESC LIMIT ?")
      .all(limit) as LedgerRow[];
    return rows.map((row) => this.mapRowToEntry(row));
  }

  verifyChain(): boolean {
    if (!this.db) return false;
    const rows = this.db.prepare("SELECT * FROM soa_ledger ORDER BY id ASC").all() as LedgerRow[];
    if (rows.length === 0) return true;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const payload = row.payload ? JSON.parse(row.payload) : undefined;
      const expectedHash = this.calculateHash(
        JSON.stringify({
          timestamp: row.timestamp,
          eventType: row.event_type,
          agentDid: row.agent_did,
          payload,
          prevHash: row.prev_hash,
        }),
      );

      if (row.entry_hash !== expectedHash) return false;
      if (this.sign(expectedHash) !== row.signature) return false;
      if (i > 0 && row.prev_hash !== rows[i - 1].entry_hash) return false;
    }
    return true;
  }

  getEntryCount(): number {
    if (!this.db) return 0;
    const res = this.db.prepare("SELECT count(*) as c FROM soa_ledger").get() as { c: number };
    return res.c;
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  private initSchema(): void {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS soa_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        agent_did TEXT NOT NULL,
        agent_trust_at_action REAL,
        model_version TEXT,
        artifact_path TEXT,
        artifact_hash TEXT,
        risk_grade TEXT,
        verification_method TEXT,
        verification_result TEXT,
        sentinel_confidence REAL,
        overseer_did TEXT,
        overseer_decision TEXT,
        gdpr_trigger INTEGER DEFAULT 0,
        payload TEXT,
        entry_hash TEXT NOT NULL UNIQUE,
        prev_hash TEXT NOT NULL,
        signature TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_soa_timestamp ON soa_ledger(timestamp);
      CREATE INDEX IF NOT EXISTS idx_soa_agent ON soa_ledger(agent_did);
    `);

    const count = this.db.prepare("SELECT count(*) as c FROM soa_ledger").get() as { c: number };
    if (count.c === 0) {
      this.createGenesisEntry();
    }
  }

  private createGenesisEntry(): void {
    if (!this.db) return;
    const timestamp = new Date().toISOString();
    const prevHash = this.calculateHash("GENESIS");
    const payload = { message: "SOA Ledger initialized" };
    const entryHash = this.calculateHash(
      JSON.stringify({
        timestamp,
        eventType: "SYSTEM_EVENT",
        agentDid: "did:myth:system:genesis",
        payload,
        prevHash,
      }),
    );
    const signature = this.sign(entryHash);
    this.db
      .prepare(
        `INSERT INTO soa_ledger (
          timestamp, event_type, agent_did, payload, entry_hash, prev_hash, signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        timestamp,
        "SYSTEM_EVENT",
        "did:myth:system:genesis",
        JSON.stringify(payload),
        entryHash,
        prevHash,
        signature,
      );
    this.lastHash = entryHash;
  }

  private loadLastHash(): void {
    if (!this.db) return;
    const last = this.db
      .prepare("SELECT entry_hash FROM soa_ledger ORDER BY id DESC LIMIT 1")
      .get() as { entry_hash: string } | undefined;
    if (last) this.lastHash = last.entry_hash;
  }

  private mapRowToEntry(row: LedgerRow): LedgerEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      agentDid: row.agent_did,
      agentTrustAtAction: row.agent_trust_at_action ?? 0,
      modelVersion: row.model_version ?? undefined,
      artifactPath: row.artifact_path ?? undefined,
      artifactHash: row.artifact_hash ?? undefined,
      riskGrade: row.risk_grade ?? undefined,
      verificationMethod: row.verification_method ?? undefined,
      verificationResult: row.verification_result ?? undefined,
      sentinelConfidence: row.sentinel_confidence ?? undefined,
      overseerDid: row.overseer_did ?? undefined,
      overseerDecision: row.overseer_decision ?? undefined,
      gdprTrigger: row.gdpr_trigger === 1,
      payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : {},
      entryHash: row.entry_hash,
      prevHash: row.prev_hash,
      signature: row.signature,
    };
  }

  private calculateHash(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  private sign(hash: string): string {
    return crypto.createHmac("sha256", this.cachedSecret).update(hash).digest("hex");
  }

  private async ensureSecret(): Promise<string> {
    const key = "ledgerSecret";
    const fromStore = await this.options.secretStore?.getSecret(key);
    if (fromStore) return fromStore;
    const generated = crypto.randomBytes(32).toString("hex");
    if (this.options.secretStore) {
      await this.options.secretStore.setSecret(key, generated);
    }
    return generated;
  }
}

