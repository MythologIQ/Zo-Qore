/**
 * Path Service
 *
 * Path generation and management service.
 *
 * @module zo/path/service
 */

import type { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import type { Risk } from "../project-tab/types.js";
import type {
  PathState,
  PathPhase,
  PathEvent,
  PathGenerationOptions,
} from "./types.js";
import {
  generatePhasesFromClusters,
  computeDependents,
  autoSchedulePhases,
} from "./generator.js";
import {
  buildDependencyGraph,
  detectCycles,
  findCriticalPath,
} from "./dependencies.js";

type PathEventHandler = (event: PathEvent) => void;

/**
 * Service for path generation and management.
 */
export class PathService {
  private readonly storage: ProjectTabStorage;
  private eventHandlers: PathEventHandler[] = [];

  constructor(db: DuckDBClient) {
    this.storage = new ProjectTabStorage(db);
  }

  /** Subscribe to path events. */
  onEvent(handler: PathEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /** Generate path from constellation clusters. */
  async generatePath(
    projectId: string,
    options: PathGenerationOptions = {}
  ): Promise<PathState> {
    const clusters = await this.storage.listClustersForProject(projectId);
    const risks = await this.storage.listRisksForProject(projectId);

    const phases = generatePhasesFromClusters(clusters, options);
    computeDependents(phases);

    if (options.autoSchedule) {
      const today = new Date().toISOString().split("T")[0];
      autoSchedulePhases(phases, today);
    }

    this.attachRiskCounts(phases, risks);

    const graph = buildDependencyGraph(phases);
    const cycle = detectCycles(graph);
    const hasScheduleConflicts = cycle.length > 0;
    const criticalPath = hasScheduleConflicts ? [] : findCriticalPath(phases);
    const totalDurationDays = this.calculateTotalDuration(phases);

    this.emit({ type: "path_regenerated", projectId });

    return { projectId, phases, criticalPath, totalDurationDays, hasScheduleConflicts };
  }

  /** Load existing path from stored phases. */
  async loadPath(projectId: string): Promise<PathState> {
    const storedPhases = await this.storage.listPhasesForProject(projectId);
    const risks = await this.storage.listRisksForProject(projectId);

    const phases: PathPhase[] = [];
    for (const sp of storedPhases) {
      const sprints = await this.loadSprintsForPhase(sp.id);
      const milestones = await this.loadMilestonesForPhase(projectId, sp.id);

      phases.push({
        id: sp.id,
        name: sp.name,
        description: sp.description,
        clusterIds: sp.clusterIds,
        dependencies: sp.dependencies,
        dependents: [],
        startDate: sp.startDate ?? null,
        endDate: sp.endDate ?? null,
        durationDays: this.calculateDays(sp.startDate, sp.endDate),
        sprints,
        milestones,
        riskCount: 0,
      });
    }

    computeDependents(phases);
    this.attachRiskCounts(phases, risks);

    const graph = buildDependencyGraph(phases);
    const cycle = detectCycles(graph);
    const hasScheduleConflicts = cycle.length > 0;
    const criticalPath = hasScheduleConflicts ? [] : findCriticalPath(phases);
    const totalDurationDays = this.calculateTotalDuration(phases);

    return { projectId, phases, criticalPath, totalDurationDays, hasScheduleConflicts };
  }

  /** Add dependency between phases. */
  async addDependency(fromPhaseId: string, toPhaseId: string): Promise<void> {
    await this.storage.addPhaseDependency(toPhaseId, fromPhaseId);
    this.emit({ type: "dependency_added", fromId: fromPhaseId, toId: toPhaseId });
  }

  /** Update phase dates. */
  async updatePhaseDates(
    phaseId: string,
    startDate: string,
    endDate: string
  ): Promise<void> {
    await this.storage.updatePhase(phaseId, { startDate, endDate });
    this.emit({ type: "phase_updated", phaseId });
  }

  private async loadSprintsForPhase(phaseId: string): Promise<PathPhase["sprints"]> {
    const sprints = await this.storage.listSprintsForPhase(phaseId);
    return sprints.map((s) => ({
      id: s.id,
      name: s.name,
      goal: s.goal,
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
      taskCount: s.taskIds.length,
    }));
  }

  private async loadMilestonesForPhase(
    projectId: string,
    phaseId: string
  ): Promise<PathPhase["milestones"]> {
    const all = await this.storage.listMilestonesForProject(projectId);
    return all
      .filter((m) => m.phaseId === phaseId)
      .map((m) => ({ id: m.id, name: m.name, targetDate: m.targetDate, status: m.status }));
  }

  private attachRiskCounts(phases: PathPhase[], risks: Risk[]): void {
    const unresolvedCount = risks.filter((r) => r.status !== "resolved").length;
    for (const phase of phases) {
      phase.riskCount = unresolvedCount;
    }
  }

  private calculateDays(start?: string, end?: string): number | null {
    if (!start || !end) return null;
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  }

  private calculateTotalDuration(phases: PathPhase[]): number | null {
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    for (const phase of phases) {
      if (phase.startDate) {
        const s = new Date(phase.startDate);
        if (!minStart || s < minStart) minStart = s;
      }
      if (phase.endDate) {
        const e = new Date(phase.endDate);
        if (!maxEnd || e > maxEnd) maxEnd = e;
      }
    }

    if (!minStart || !maxEnd) return null;
    return Math.ceil((maxEnd.getTime() - minStart.getTime()) / (1000 * 60 * 60 * 24));
  }

  private emit(event: PathEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Swallow handler errors
      }
    }
  }
}
