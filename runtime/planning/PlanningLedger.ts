import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger.js";
import { PlanningStoreError } from "./StoreErrors.js";

export type PlanningView =
  | "void"
  | "reveal"
  | "constellation"
  | "path"
  | "risk"
  | "autonomy";

export type PlanningAction = "create" | "update" | "delete" | "claim";

export interface PlanningLedgerEntry {
  entryId: string;
  projectId: string;
  view: PlanningView;
  action: PlanningAction;
  artifactId: string;
  actorId: string;
  timestamp: string;
  checksumBefore: string | null;
  checksumAfter: string | null;
  payload?: Record<string, unknown>;
}

export interface LedgerSummary {
  totalEntries: number;
  byView: Record<PlanningView, number>;
  byAction: Record<PlanningAction, number>;
}

const logger = createLogger("planning-ledger");
const LEDGER_FILE = "ledger.jsonl";
const HISTORY_DIR = "history";

export class PlanningLedger {
  constructor(
    private basePath: string,
    private projectId: string,
  ) {}

  private get projectPath(): string {
    return join(this.basePath, this.projectId);
  }

  private get ledgerPath(): string {
    return join(this.projectPath, LEDGER_FILE);
  }

  private get historyPath(): string {
    return join(this.projectPath, HISTORY_DIR);
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.projectPath, { recursive: true });
      await mkdir(this.historyPath, { recursive: true });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to create ledger directory: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  async appendEntry(entry: Omit<PlanningLedgerEntry, "entryId" | "timestamp">): Promise<PlanningLedgerEntry> {
    logger.info("Appending ledger entry", {
      projectId: this.projectId,
      view: entry.view,
      action: entry.action,
      artifactId: entry.artifactId,
    });

    await this.ensureDirectory();

    const fullEntry: PlanningLedgerEntry = {
      ...entry,
      entryId: `led_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date().toISOString(),
    };

    const line = JSON.stringify(fullEntry) + "\n";

    try {
      await writeFile(this.ledgerPath, line, { flag: "a" });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to append ledger entry: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId, artifactId: entry.artifactId },
      );
    }

    await this.saveToHistory(fullEntry);

    logger.info("Ledger entry appended", {
      projectId: this.projectId,
      entryId: fullEntry.entryId,
    });

    return fullEntry;
  }

  private async saveToHistory(entry: PlanningLedgerEntry): Promise<void> {
    const timestamp = entry.timestamp.replace(/[:.]/g, "-");
    const historyFile = join(this.historyPath, `${timestamp}_${entry.entryId}.jsonl`);

    try {
      await writeFile(historyFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (e) {
      logger.warn("Failed to save to history", { error: e instanceof Error ? e.message : "Unknown" });
    }
  }

  async getEntries(options?: {
    view?: PlanningView;
    action?: PlanningAction;
    artifactId?: string;
    limit?: number;
  }): Promise<PlanningLedgerEntry[]> {
    try {
      const content = await readFile(this.ledgerPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      let entries = lines
        .map((line) => {
          try {
            return JSON.parse(line) as PlanningLedgerEntry;
          } catch {
            logger.warn("Skipping malformed ledger entry");
            return null;
          }
        })
        .filter((e): e is PlanningLedgerEntry => e !== null);

      if (options?.view) {
        entries = entries.filter((e) => e.view === options.view);
      }

      if (options?.action) {
        entries = entries.filter((e) => e.action === options.action);
      }

      if (options?.artifactId) {
        entries = entries.filter((e) => e.artifactId === options.artifactId);
      }

      if (options?.limit) {
        entries = entries.slice(-options.limit);
      }

      return entries;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug("Ledger file not found, returning empty array");
        return [];
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to read ledger: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  async getSummary(): Promise<LedgerSummary> {
    const entries = await this.getEntries();

    const summary: LedgerSummary = {
      totalEntries: entries.length,
      byView: {
        void: 0,
        reveal: 0,
        constellation: 0,
        path: 0,
        risk: 0,
        autonomy: 0,
      },
      byAction: {
        create: 0,
        update: 0,
        delete: 0,
        claim: 0,
      },
    };

    for (const entry of entries) {
      summary.byView[entry.view]++;
      summary.byAction[entry.action]++;
    }

    return summary;
  }

  async verifyConsistency(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    logger.info("Verifying ledger consistency", { projectId: this.projectId });
    const errors: string[] = [];

    try {
      const files = await readdir(this.historyPath);
      const historyEntries: PlanningLedgerEntry[] = [];

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        try {
          const content = await readFile(join(this.historyPath, file), "utf-8");
          const entry = JSON.parse(content) as PlanningLedgerEntry;
          historyEntries.push(entry);
        } catch {
          errors.push(`Corrupted history file: ${file}`);
        }
      }

      const ledgerEntries = await this.getEntries();

      if (historyEntries.length !== ledgerEntries.length) {
        errors.push(
          `Entry count mismatch: ledger has ${ledgerEntries.length}, history has ${historyEntries.length}`,
        );
      }

      const ledgerIds = new Set(ledgerEntries.map((e) => e.entryId));
      for (const histEntry of historyEntries) {
        if (!ledgerIds.has(histEntry.entryId)) {
          errors.push(`Orphaned history entry: ${histEntry.entryId}`);
        }
      }

      const valid = errors.length === 0;
      logger.info("Ledger consistency check complete", {
        projectId: this.projectId,
        valid,
        errorCount: errors.length,
      });

      return { valid, errors };
    } catch (e) {
      throw new PlanningStoreError(
        "INTEGRITY_CHECK_FAILED",
        `Failed to verify ledger consistency: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }
}

export function createPlanningLedger(
  projectId: string,
  basePath?: string,
): PlanningLedger {
  const projectsDir = process.env.QORE_PROJECTS_DIR ||
    join(process.cwd(), ".qore", "projects");
  return new PlanningLedger(basePath || projectsDir, projectId);
}