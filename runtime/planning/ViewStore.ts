import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger.js";
import { PlanningStoreError } from "./StoreErrors.js";

const logger = createLogger("view-store");

export type ViewType = "reveal" | "constellation" | "path" | "risk" | "autonomy";

export class ViewStore {
  constructor(
    private basePath: string,
    private projectId: string,
    private viewType: ViewType,
  ) {}

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

  async write<T>(data: T): Promise<T> {
    logger.info("Writing view data", { projectId: this.projectId, viewType: this.viewType });
    await this.ensureDirectory();

    const tmpFile = `${this.dataFile}.tmp.${Date.now()}`;
    const jsonContent = JSON.stringify(data, null, 2);

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

  async delete(): Promise<void> {
    logger.info("Deleting view data", { projectId: this.projectId, viewType: this.viewType });

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

    logger.info("View data deleted", { projectId: this.projectId, viewType: this.viewType });
  }
}

export function createViewStore(
  basePath: string,
  projectId: string,
  viewType: ViewType,
): ViewStore {
  return new ViewStore(basePath, projectId, viewType);
}