import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger.js";
import { PlanningStoreError } from "./StoreErrors.js";
import type { VoidThought } from "@mythologiq/qore-contracts";

const logger = createLogger("void-store");

export class VoidStore {
  constructor(
    private basePath: string,
    private projectId: string,
  ) {}

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

  async addThought(thought: VoidThought): Promise<VoidThought> {
    logger.info("Adding thought", { projectId: this.projectId, thoughtId: thought.thoughtId });
    await this.ensureDirectory();

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
  ): Promise<VoidThought | null> {
    const thoughts = await this.getAllThoughts();
    const index = thoughts.findIndex((t) => t.thoughtId === thoughtId);

    if (index === -1) {
      return null;
    }

    thoughts[index] = { ...thoughts[index], status };

    await writeFile(
      this.thoughtsFile,
      thoughts.map((t) => JSON.stringify(t)).join("\n") + "\n",
      "utf-8",
    );

    logger.info("Thought status updated", { projectId: this.projectId, thoughtId, status });
    return thoughts[index];
  }

  async getThoughtsByTags(tags: string[]): Promise<VoidThought[]> {
    const thoughts = await this.getAllThoughts();
    return thoughts.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
  }
}

export function createVoidStore(basePath: string, projectId: string): VoidStore {
  return new VoidStore(basePath, projectId);
}