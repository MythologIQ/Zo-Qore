import { readFile, writeFile, mkdir, rename, access } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger";
import { PlanningStoreError } from "./StoreErrors";
import { StoreIntegrity } from "./StoreIntegrity";
import type { PlanningLedger, PlanningView } from "./PlanningLedger";

const logger = createLogger("view-store");

export type ViewType = "reveal" | "constellation" | "path" | "risk" | "autonomy";

const VIEW_TO_LEDGER: Record<ViewType, PlanningView> = {
  reveal: "reveal",
  constellation: "constellation",
  path: "path",
  risk: "risk",
  autonomy: "autonomy",
};

export interface ViewStoreOptions {
  ledger?: PlanningLedger;
  integrity?: StoreIntegrity;
  artifactId?: string;
}

export class ViewStore {
  private ledger?: PlanningLedger;
  private integrity?: StoreIntegrity;
  private artifactId?: string;

  constructor(
    private basePath: string,
    private projectId: string,
    private viewType: ViewType,
    options?: ViewStoreOptions,
  ) {
    this.ledger = options?.ledger;
    this.integrity = options?.integrity;
    this.artifactId = options?.artifactId;
  }

  private get viewPath(): string {
    return join(this.basePath, this.projectId, this.viewType);
  }

  private get dataFile(): string {
    const fileNames: Record<ViewType, string> = {
      reveal: "clusters.json",
      constellation: "map.json",
      path: "phases.json",
      risk: "register.json",
      autonomy: "config.json",
    };
    return join(this.viewPath, fileNames[this.viewType]);
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.viewPath, { recursive: true });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to create view directory: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId, viewType: this.viewType },
      );
    }
  }

  async read<T>(): Promise<T | null> {
    logger.debug("Reading view data", { projectId: this.projectId, viewType: this.viewType });

    try {
      const content = await readFile(this.dataFile, "utf-8");
      return JSON.parse(content) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug("View file not found, returning null");
        return null;
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to read view data: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId, viewType: this.viewType },
      );
    }
  }

  async write<T>(data: T, actorId?: string): Promise<T> {
    logger.info("Writing view data", { projectId: this.projectId, viewType: this.viewType });
    await this.ensureDirectory();

    const fileName = this.dataFile.split("/").pop() ?? "";
    const checksumBefore = await this.integrity?.getChecksum(this.viewType, fileName) ?? null;

    const tmpFile = `${this.dataFile}.tmp.${Date.now()}`;
    const jsonContent = JSON.stringify(data, null, 2);

    let writeAction: "create" | "update" = "create";
    try {
      await access(this.dataFile);
      writeAction = "update";
    } catch {
      // File doesn't exist, use create
    }

    try {
      await writeFile(tmpFile, jsonContent, "utf-8");
      await rename(tmpFile, this.dataFile);
    } catch (e) {
      try {
        await rename(tmpFile, this.dataFile);
      } catch {
        // Ignore - file may not exist
      }
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to write view data: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId, viewType: this.viewType },
      );
    }

    const checksumAfter = await this.integrity?.getChecksum(this.viewType, fileName) ?? null;

    if (this.ledger) {
      const artifactId = this.artifactId ?? `${this.viewType}-data`;
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: VIEW_TO_LEDGER[this.viewType],
        action: writeAction,
        artifactId,
        actorId: actorId ?? "system",
        checksumBefore,
        checksumAfter,
      });
    }

    logger.info("View data written", { projectId: this.projectId, viewType: this.viewType });
    return data;
  }

  async exists(): Promise<boolean> {
    try {
      await readFile(this.dataFile, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  async delete(actorId?: string): Promise<void> {
    logger.info("Deleting view data", { projectId: this.projectId, viewType: this.viewType });

    const fileName = this.dataFile.split("/").pop() ?? "";
    const checksumBefore = await this.integrity?.getChecksum(this.viewType, fileName) ?? null;

    try {
      await rename(this.dataFile, `${this.dataFile}.deleted.${Date.now()}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new PlanningStoreError(
          "WRITE_FAILED",
          `Failed to delete view data: ${e instanceof Error ? e.message : "Unknown error"}`,
          { projectId: this.projectId, viewType: this.viewType },
        );
      }
    }

    if (this.ledger) {
      const artifactId = this.artifactId ?? `${this.viewType}-data`;
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: VIEW_TO_LEDGER[this.viewType],
        action: "delete",
        artifactId,
        actorId: actorId ?? "system",
        checksumBefore,
        checksumAfter: null,
      });
    }

    logger.info("View data deleted", { projectId: this.projectId, viewType: this.viewType });
  }
}

export function createViewStore(
  basePath: string,
  projectId: string,
  viewType: ViewType,
  options?: ViewStoreOptions,
): ViewStore {
  return new ViewStore(basePath, projectId, viewType, options);
}