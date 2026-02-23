import { readFile, writeFile, mkdir, access, rm } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger.js";
import { PlanningStoreError } from "./StoreErrors.js";
import { StoreIntegrity } from "./StoreIntegrity.js";
import { VoidStore, createVoidStore } from "./VoidStore.js";
import { ViewStore, createViewStore, ViewType } from "./ViewStore.js";
import type {
  QoreProject,
  PipelineState,
} from "@mythologiq/qore-contracts";
import type {
  VoidThought,
  RevealCluster,
  ConstellationMap,
  PathPhase,
  RiskEntry,
  AutonomyConfig,
} from "@mythologiq/qore-contracts";

const logger = createLogger("project-store");

const DEFAULT_PROJECTS_DIR = join(process.cwd(), ".qore", "projects");

export class ProjectStore {
  private voidStore: VoidStore;
  private integrity: StoreIntegrity;

  constructor(
    private basePath: string,
    private projectId: string,
  ) {
    this.voidStore = createVoidStore(basePath, projectId);
    this.integrity = new StoreIntegrity(basePath);
  }

  private get projectPath(): string {
    return join(this.basePath, this.projectId);
  }

  private get projectFile(): string {
    return join(this.projectPath, "project.json");
  }

  private async ensureProjectDir(): Promise<void> {
    await mkdir(this.projectPath, { recursive: true });
  }

  async create(data: { name: string; description?: string; createdBy: string }): Promise<QoreProject> {
    logger.info("Creating project", { projectId: this.projectId, name: data.name });

    const exists = await this.exists();
    if (exists) {
      throw new PlanningStoreError("PROJECT_ALREADY_EXISTS", undefined, { projectId: this.projectId });
    }

    await this.ensureProjectDir();

    const now = new Date().toISOString();
    const project: QoreProject = {
      projectId: this.projectId,
      name: data.name,
      description: data.description || "",
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy,
      pipelineState: {
        void: "empty",
        reveal: "empty",
        constellation: "empty",
        path: "empty",
        risk: "empty",
        autonomy: "empty",
      } as PipelineState,
      checksum: "",
    };

    await writeFile(this.projectFile, JSON.stringify(project, null, 2), "utf-8");
    await this.integrity.updateChecksums(this.projectId);

    logger.info("Project created", { projectId: this.projectId });
    return project;
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.projectFile);
      return true;
    } catch {
      return false;
    }
  }

  async get(): Promise<QoreProject | null> {
    try {
      const content = await readFile(this.projectFile, "utf-8");
      return JSON.parse(content) as QoreProject;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to read project: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  async update(updates: Partial<QoreProject>): Promise<QoreProject> {
    const project = await this.get();
    if (!project) {
      throw new PlanningStoreError("PROJECT_NOT_FOUND", undefined, { projectId: this.projectId });
    }

    const updated = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.projectFile, JSON.stringify(updated, null, 2), "utf-8");
    await this.integrity.updateChecksums(this.projectId);

    logger.info("Project updated", { projectId: this.projectId });
    return updated;
  }

  async delete(): Promise<void> {
    logger.info("Deleting project", { projectId: this.projectId });
    await rm(this.projectPath, { recursive: true, force: true });
    logger.info("Project deleted", { projectId: this.projectId });
  }

  async getViewStore(viewType: ViewType): Promise<ViewStore> {
    return createViewStore(this.basePath, this.projectId, viewType);
  }

  async getVoidStore(): Promise<VoidStore> {
    return this.voidStore;
  }

  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    return this.integrity.verify(this.projectId);
  }

  async updatePipelineState(view: keyof PipelineState, state: "empty" | "active"): Promise<void> {
    const project = await this.get();
    if (!project) {
      throw new PlanningStoreError("PROJECT_NOT_FOUND", undefined, { projectId: this.projectId });
    }

    project.pipelineState[view] = state;
    project.updatedAt = new Date().toISOString();

    await writeFile(this.projectFile, JSON.stringify(project, null, 2), "utf-8");
    await this.integrity.updateChecksums(this.projectId);

    logger.info("Pipeline state updated", { projectId: this.projectId, view, state });
  }
}

export function createProjectStore(
  projectId: string,
  basePath?: string,
): ProjectStore {
  const projectsDir = process.env.QORE_PROJECTS_DIR || DEFAULT_PROJECTS_DIR;
  return new ProjectStore(basePath || projectsDir, projectId);
}

export function listProjects(basePath?: string): string[] {
  // This would list all project directories
  // Implementation deferred to async for filesystem access
  return [];
}

export { DEFAULT_PROJECTS_DIR };