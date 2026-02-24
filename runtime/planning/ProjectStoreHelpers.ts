import { join } from "path";
import type { QoreProject, PipelineState, FullProjectState } from "@mythologiq/qore-contracts";
import type {
  VoidThought,
  RevealCluster,
  ConstellationMap,
  PathPhase,
  RiskEntry,
  AutonomyConfig,
} from "@mythologiq/qore-contracts";
import type { VoidStore } from "./VoidStore";
import type { ViewStore } from "./ViewStore";

export function getProjectPath(basePath: string, projectId: string): string {
  return join(basePath, projectId);
}

export function getProjectFile(basePath: string, projectId: string): string {
  return join(basePath, projectId, "project.json");
}

export function createEmptyPipelineState(): PipelineState {
  return {
    void: "empty",
    reveal: "empty",
    constellation: "empty",
    path: "empty",
    risk: "empty",
    autonomy: "empty",
  };
}

export function createEmptyProject(projectId: string, data: {
  name: string;
  description?: string;
  createdBy: string;
}): QoreProject {
  const now = new Date().toISOString();
  return {
    projectId,
    name: data.name,
    description: data.description || "",
    createdAt: now,
    updatedAt: now,
    createdBy: data.createdBy,
    pipelineState: createEmptyPipelineState(),
    checksum: "",
  };
}

export function createEmptyFullProjectState(
  projectId: string,
  thoughts: VoidThought[],
  clusters: RevealCluster[],
  constellation: ConstellationMap | null,
  phases: PathPhase[],
  risks: RiskEntry[],
  autonomy: AutonomyConfig | null,
): FullProjectState {
  return {
    project: {
      projectId,
      name: "",
      description: "",
      createdAt: "",
      updatedAt: "",
      createdBy: "",
      pipelineState: createEmptyPipelineState(),
      checksum: "",
    },
    thoughts,
    clusters,
    constellation,
    phases,
    risks,
    autonomy,
  };
}

export function createFullProjectState(
  project: QoreProject,
  thoughts: VoidThought[],
  clusters: RevealCluster[],
  constellation: ConstellationMap | null,
  phases: PathPhase[],
  risks: RiskEntry[],
  autonomy: AutonomyConfig | null,
): FullProjectState {
  return {
    project,
    thoughts,
    clusters: clusters ?? [],
    constellation,
    phases: phases ?? [],
    risks: risks ?? [],
    autonomy,
  };
}

export async function loadFullProjectState(
  projectId: string,
  getVoidStore: () => Promise<VoidStore>,
  getViewStore: (type: "reveal" | "constellation" | "path" | "risk" | "autonomy") => Promise<ViewStore>,
  getProject: () => Promise<QoreProject | null>,
): Promise<FullProjectState> {
  const project = await getProject();
  const voidStore = await getVoidStore();

  const [thoughts, clusters, constellation, phases, risks, autonomyConfig] = await Promise.all([
    voidStore.getAllThoughts().catch(() => []),
    getViewStore("reveal").then(s => s.read<RevealCluster[]>().catch(() => [] as RevealCluster[])),
    getViewStore("constellation").then(s => s.read<ConstellationMap | null>().catch(() => null)),
    getViewStore("path").then(s => s.read<PathPhase[]>().catch(() => [] as PathPhase[])),
    getViewStore("risk").then(s => s.read<RiskEntry[]>().catch(() => [] as RiskEntry[])),
    getViewStore("autonomy").then(s => s.read<AutonomyConfig | null>().catch(() => null)),
  ]);

  const safeClusters = clusters ?? [];
  const safePhases = phases ?? [];
  const safeRisks = risks ?? [];

  if (!project) {
    return createEmptyFullProjectState(projectId, thoughts, safeClusters, constellation, safePhases, safeRisks, autonomyConfig);
  }

  return createFullProjectState(project, thoughts, safeClusters, constellation, safePhases, safeRisks, autonomyConfig);
}
