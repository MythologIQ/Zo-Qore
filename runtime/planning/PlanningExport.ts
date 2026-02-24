import type {
  QoreProject,
  FullProjectState,
  VoidThoughtRef,
  RevealClusterRef,
  ConstellationMapRef,
  PathPhaseRef,
  RiskEntryRef,
  AutonomyConfigRef,
} from "@mythologiq/qore-contracts";
import { createLogger } from "./Logger";
import { PlanningStoreError } from "./StoreErrors";
import { getProjectPath } from "./ProjectStoreHelpers";
import { DEFAULT_PROJECTS_DIR } from "./ProjectStore";
import {
  VIEW_MAP,
  computeChecksum,
  loadViewData,
  formatAsMarkdown,
  loadAndFormatViewMarkdown,
} from "./ExportMarkdown";

export type ExportFormat = "json" | "markdown";

export interface ExportOptions {
  format: ExportFormat;
  includeViews?: string[];
  includeChecksum?: boolean;
}

export interface ExportResult {
  ok: boolean;
  data: string;
  format: ExportFormat;
  checksum?: string;
  exportedAt: string;
}

const logger = createLogger("planning-export");

export async function exportProject(
  projectId: string,
  options: ExportOptions,
): Promise<ExportResult> {
  const { format, includeChecksum = true } = options;
  logger.info("Exporting project", { projectId, format });

  const basePath = DEFAULT_PROJECTS_DIR;
  const projectPath = getProjectPath(basePath, projectId);

  try {
    const projectJson = await loadViewData<QoreProject>(
      projectPath,
      "",
      "project.json",
    );
    if (!projectJson) {
      throw new PlanningStoreError(
        "PROJECT_NOT_FOUND",
        `Project not found: ${projectId}`,
        { projectId },
      );
    }
    const project = projectJson;

    const [thoughts, clusters, constellation, phases, risks, autonomy] =
      await Promise.all([
        loadViewData<VoidThoughtRef[]>(projectPath, "void", "thoughts.jsonl"),
        loadViewData<RevealClusterRef[]>(projectPath, "reveal", "clusters.json"),
        loadViewData<ConstellationMapRef | null>(
          projectPath,
          "constellation",
          "map.json",
        ),
        loadViewData<PathPhaseRef[]>(projectPath, "path", "phases.json"),
        loadViewData<RiskEntryRef[]>(projectPath, "risk", "register.json"),
        loadViewData<AutonomyConfigRef | null>(
          projectPath,
          "autonomy",
          "config.json",
        ),
      ]);

    const fullState: FullProjectState = {
      project,
      thoughts: thoughts ?? [],
      clusters: clusters ?? [],
      constellation,
      phases: phases ?? [],
      risks: risks ?? [],
      autonomy,
    };

    const data =
      format === "json"
        ? JSON.stringify(fullState, null, 2)
        : formatAsMarkdown(project, fullState);

    const checksum = includeChecksum ? computeChecksum(data) : undefined;

    return {
      ok: true,
      data,
      format,
      checksum,
      exportedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof PlanningStoreError) throw err;
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("Export failed", { projectId, error: error.message });
    throw new PlanningStoreError(
      "EXPORT_FAILED",
      `Failed to export project: ${error.message}`,
      { projectId },
    );
  }
}

export async function exportView(
  projectId: string,
  view: string,
  format: ExportFormat,
): Promise<ExportResult> {
  logger.info("Exporting view", { projectId, view, format });

  const basePath = DEFAULT_PROJECTS_DIR;
  const projectPath = getProjectPath(basePath, projectId);

  const viewConfig = VIEW_MAP[view];
  if (!viewConfig) {
    throw new PlanningStoreError(
      "VALIDATION_FAILED",
      `Unknown view: ${view}`,
      { projectId, view },
    );
  }

  try {
    const data = await loadViewData(
      projectPath,
      viewConfig.dir,
      viewConfig.file,
    );

    const exportData =
      format === "json"
        ? JSON.stringify(data, null, 2)
        : await loadAndFormatViewMarkdown(projectPath, view, data);

    const checksum = computeChecksum(exportData);

    return {
      ok: true,
      data: exportData,
      format,
      checksum,
      exportedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof PlanningStoreError) throw err;
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("View export failed", { projectId, view, error: error.message });
    throw new PlanningStoreError(
      "EXPORT_FAILED",
      `Failed to export view: ${error.message}`,
      { projectId, view },
    );
  }
}

export class PlanningExport {
  constructor(private projectId: string) {}

  async export(options: ExportOptions): Promise<ExportResult> {
    return exportProject(this.projectId, options);
  }

  async exportView(view: string, format: ExportFormat): Promise<ExportResult> {
    return exportView(this.projectId, view, format);
  }
}

export function createPlanningExport(projectId: string): PlanningExport {
  return new PlanningExport(projectId);
}
