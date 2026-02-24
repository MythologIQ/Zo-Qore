import { readFile, writeFile, mkdir, access, rm } from "fs/promises";
import { join } from "path";
import { createLogger } from "./Logger";
import { PlanningStoreError } from "./StoreErrors";
import { StoreIntegrity } from "./StoreIntegrity";
import { VoidStore, createVoidStore, VoidStoreOptions } from "./VoidStore";
import { ViewStore, createViewStore, ViewType, ViewStoreOptions } from "./ViewStore";
import { PlanningLedger, createPlanningLedger } from "./PlanningLedger";
import type {
  QoreProject,
  PipelineState,
  FullProjectState,
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

export interface ProjectStoreOptions {
  enableLedger?: boolean;
}

export class ProjectStore {
  private voidStore: VoidStore;
  private integrity: StoreIntegrity;
  private ledger: PlanningLedger;

  constructor(
    private basePath: string,
    private projectId: string,
    options?: ProjectStoreOptions,
  ) {
    this.integrity = new StoreIntegrity(basePath);
    this.ledger = createPlanningLedger(projectId, basePath);

    const voidOptions: VoidStoreOptions = {
      ledger: options?.enableLedger ? this.ledger : undefined,
      integrity: this.integrity,
    };
    this.voidStore = createVoidStore(basePath, projectId, voidOptions);
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

    await this.ledger.appendEntry({
      projectId: this.projectId,
      view: "void",
      action: "create",
      artifactId: this.projectId,
      actorId: data.createdBy,
      checksumBefore: null,
      checksumAfter: await this.integrity.getChecksum(this.projectId, "project.json"),
      payload: { name: data.name },
    });

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

  async update(updates: Partial<QoreProject>, actorId?: string): Promise<QoreProject> {
    const project = await this.get();
    if (!project) {
      throw new PlanningStoreError("PROJECT_NOT_FOUND", undefined, { projectId: this.projectId });
    }

    const checksumBefore = await this.integrity.getChecksum(this.projectId, "project.json");

    const updated = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.projectFile, JSON.stringify(updated, null, 2), "utf-8");
    await this.integrity.updateChecksums(this.projectId);

    const checksumAfter = await this.integrity.getChecksum(this.projectId, "project.json");

    await this.ledger.appendEntry({
      projectId: this.projectId,
      view: "void",
      action: "update",
      artifactId: this.projectId,
      actorId: actorId ?? "system",
      checksumBefore,
      checksumAfter,
    });

    logger.info("Project updated", { projectId: this.projectId });
    return updated;
  }

  async delete(actorId?: string): Promise<void> {
    logger.info("Deleting project", { projectId: this.projectId });

    const checksumBefore = await this.integrity.getChecksum(this.projectId, "project.json");

    await rm(this.projectPath, { recursive: true, force: true });

    await this.ledger.appendEntry({
      projectId: this.projectId,
      view: "void",
      action: "delete",
      artifactId: this.projectId,
      actorId: actorId ?? "system",
      checksumBefore,
      checksumAfter: null,
    });

    logger.info("Project deleted", { projectId: this.projectId });
  }

  async getViewStore(viewType: ViewType, options?: ViewStoreOptions): Promise<ViewStore> {
    const viewOptions: ViewStoreOptions = {
      ledger: options?.ledger ?? this.ledger,
      integrity: options?.integrity ?? this.integrity,
      artifactId: options?.artifactId,
    };
    return createViewStore(this.basePath, this.projectId, viewType, viewOptions);
  }

  async getVoidStore(): Promise<VoidStore> {
    return this.voidStore;
  }

  async getFullProjectState(): Promise<FullProjectState> {
    const project = await this.get();
    const voidStore = await this.getVoidStore();
    const revealStore = await this.getViewStore('reveal');
    const constellationStore = await this.getViewStore('constellation');
    const pathStore = await this.getViewStore('path');
    const riskStore = await this.getViewStore('risk');
    const autonomyStore = await this.getViewStore('autonomy');

    const [thoughts, clusters, constellation, phases, risks, autonomyConfig] = 
      await Promise.all([
        voidStore.getAllThoughts().catch(() => []),
        revealStore.read<RevealCluster[]>().catch(() => [] as RevealCluster[]),
        constellationStore.read<ConstellationMap | null>().catch(() => null),
        pathStore.read<PathPhase[]>().catch(() => [] as PathPhase[]),
        riskStore.read<RiskEntry[]>().catch(() => [] as RiskEntry[]),
        autonomyStore.read<AutonomyConfig | null>().catch(() => null),
      ]);

    // Ensure all arrays are defined (not null) for FullProjectState
    const safeClusters = clusters ?? [];
    const safePhases = phases ?? [];
    const safeRisks = risks ?? [];

    // If project doesn't exist, return empty state
    if (!project) {
      return {
        project: {
          projectId: this.projectId,
          name: '',
          description: '',
          createdAt: '',
          updatedAt: '',
          createdBy: '',
          pipelineState: {
            void: 'empty',
            reveal: 'empty',
            constellation: 'empty',
            path: 'empty',
            risk: 'empty',
            autonomy: 'empty',
          },
          checksum: '',
        },
        thoughts,
        clusters: safeClusters,
        constellation,
        phases: safePhases,
        risks: safeRisks,
        autonomy: autonomyConfig,
      };
    }

    return {
      project,
      thoughts,
      clusters: safeClusters,
      constellation,
      phases: safePhases,
      risks: safeRisks,
      autonomy: autonomyConfig,
    };
  }

  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    return this.integrity.verify(this.projectId);
  }

  async getLedger(): Promise<PlanningLedger> {
    return this.ledger;
  }

  async updatePipelineState(
    view: keyof PipelineState,
    state: "empty" | "active",
    actorId?: string,
  ): Promise<void> {
    const project = await this.get();
    if (!project) {
      throw new PlanningStoreError("PROJECT_NOT_FOUND", undefined, { projectId: this.projectId });
    }

    const checksumBefore = await this.integrity.getChecksum(this.projectId, "project.json");

    project.pipelineState[view] = state;
    project.updatedAt = new Date().toISOString();

    await writeFile(this.projectFile, JSON.stringify(project, null, 2), "utf-8");
    await this.integrity.updateChecksums(this.projectId);

    const checksumAfter = await this.integrity.getChecksum(this.projectId, "project.json");

    await this.ledger.appendEntry({
      projectId: this.projectId,
      view: "void",
      action: "update",
      artifactId: `pipeline.${view}`,
      actorId: actorId ?? "system",
      checksumBefore,
      checksumAfter,
      payload: { view, state },
    });

    logger.info("Pipeline state updated", { projectId: this.projectId, view, state });
  }
}

export function createProjectStore(
  projectId: string,
  basePath?: string,
  options?: ProjectStoreOptions,
): ProjectStore {
  const projectsDir = process.env.QORE_PROJECTS_DIR || DEFAULT_PROJECTS_DIR;
  return new ProjectStore(basePath || projectsDir, projectId, options);
}

export function listProjects(basePath?: string): string[] {
  return [];
}

export { DEFAULT_PROJECTS_DIR };