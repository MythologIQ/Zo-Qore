import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger.js";
import { PlanningStoreError } from "./StoreErrors.js";
import { StoreIntegrity } from "./StoreIntegrity.js";
import type { VoidThought } from "@mythologiq/qore-contracts";
import type { PlanningLedger } from "./PlanningLedger.js";

const logger = createLogger("void-store");

export interface VoidStoreOptions {
  ledger?: PlanningLedger;
  integrity?: StoreIntegrity;
}

export class VoidStore {
  private ledger?: PlanningLedger;
  private integrity?: StoreIntegrity;

  constructor(
    private basePath: string,
    private projectId: string,
    options?: VoidStoreOptions,
  ) {
    this.ledger = options?.ledger;
    this.integrity = options?.integrity;
  }

  private get voidPath(): string {
    return join(this.basePath, this.projectId, "void");
  }

  private get thoughtsFile(): string {
    return join(this.voidPath, "thoughts.jsonl");
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.voidPath, { recursive: true });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to create void directory: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  async addThought(thought: VoidThought, actorId?: string): Promise<VoidThought> {
    logger.info("Adding thought", { projectId: this.projectId, thoughtId: thought.thoughtId });
    await this.ensureDirectory();

    const checksumBefore = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    const line = JSON.stringify(thought) + "\n";
    try {
      await writeFile(this.thoughtsFile, line, { flag: "a" });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to write thought: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId, thoughtId: thought.thoughtId },
      );
    }

    const checksumAfter = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    if (this.ledger) {
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: "void",
        action: "create",
        artifactId: thought.thoughtId,
        actorId: actorId ?? "system",
        checksumBefore,
        checksumAfter,
        payload: { source: thought.source, status: thought.status },
      });
    }

    logger.info("Thought added", { projectId: this.projectId, thoughtId: thought.thoughtId });
    return thought;
  }

  async getThought(thoughtId: string): Promise<VoidThought | null> {
    const thoughts = await this.getAllThoughts();
    return thoughts.find((t) => t.thoughtId === thoughtId) ?? null;
  }

  async getAllThoughts(): Promise<VoidThought[]> {
    logger.debug("Reading all thoughts", { projectId: this.projectId });

    try {
      const content = await readFile(this.thoughtsFile, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      return lines.map((line) => {
        try {
          return JSON.parse(line) as VoidThought;
        } catch {
          logger.warn("Skipping malformed thought entry");
          return null;
        }
      }).filter((t): t is VoidThought => t !== null);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug("thoughts.jsonl not found, returning empty array");
        return [];
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to read thoughts: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  async getUnclaimedThoughts(): Promise<VoidThought[]> {
    const thoughts = await this.getAllThoughts();
    return thoughts.filter((t) => t.status === "raw");
  }

  async updateThoughtStatus(
    thoughtId: string,
    status: "raw" | "claimed",
    actorId?: string,
  ): Promise<VoidThought | null> {
    const thoughts = await this.getAllThoughts();
    const index = thoughts.findIndex((t) => t.thoughtId === thoughtId);

    if (index === -1) {
      return null;
    }

    const checksumBefore = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    thoughts[index] = { ...thoughts[index], status };

    await writeFile(
      this.thoughtsFile,
      thoughts.map((t) => JSON.stringify(t)).join("\n") + "\n",
      "utf-8",
    );

    const checksumAfter = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    const action = status === "claimed" ? "claim" : "update";

    if (this.ledger) {
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: "void",
        action,
        artifactId: thoughtId,
        actorId: actorId ?? "system",
        checksumBefore,
        checksumAfter,
      });
    }

    logger.info("Thought status updated", { projectId: this.projectId, thoughtId, status });
    return thoughts[index];
  }

  async getThoughtsByTags(tags: string[]): Promise<VoidThought[]> {
    const thoughts = await this.getAllThoughts();
    return thoughts.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
  }
}

export function createVoidStore(
  basePath: string,
  projectId: string,
  options?: VoidStoreOptions,
): VoidStore {
  return new VoidStore(basePath, projectId, options);
}