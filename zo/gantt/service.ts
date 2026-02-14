/**
 * Gantt Service
 *
 * Gantt chart state management service.
 *
 * @module zo/gantt/service
 */

import type {
  GanttState,
  GanttBar,
  GanttViewport,
  GanttScale,
  GanttEvent,
  GanttConfig,
} from "./types.js";
import { DEFAULT_GANTT_CONFIG } from "./types.js";
import type { PathState } from "../path/types.js";

type GanttEventHandler = (event: GanttEvent) => void;

/**
 * Service for Gantt chart state management.
 */
export class GanttService {
  private eventHandlers: GanttEventHandler[] = [];
  private config: GanttConfig;

  constructor(config: Partial<GanttConfig> = {}) {
    this.config = { ...DEFAULT_GANTT_CONFIG, ...config };
  }

  /** Subscribe to Gantt events. */
  onEvent(handler: GanttEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /** Build Gantt state from path state. */
  buildGanttState(pathState: PathState): GanttState {
    const bars = this.buildBars(pathState);
    const viewport = this.computeViewport(bars);

    return {
      projectId: pathState.projectId,
      bars,
      arrows: [],
      viewport,
      selectedBarId: null,
      dragState: null,
    };
  }

  /** Build bars from path phases. */
  private buildBars(pathState: PathState): GanttBar[] {
    const bars: GanttBar[] = [];
    const criticalSet = new Set(pathState.criticalPath);
    let row = 0;

    for (const phase of pathState.phases) {
      if (phase.startDate && phase.endDate) {
        bars.push(this.createPhaseBar(phase, row++, criticalSet));
        row = this.addSprintBars(bars, phase, row);
        row = this.addMilestoneBars(bars, phase, row);
      }
    }

    return bars;
  }

  private createPhaseBar(
    phase: PathState["phases"][0],
    row: number,
    criticalSet: Set<string>
  ): GanttBar {
    return {
      id: phase.id,
      label: phase.name,
      type: "phase",
      startDate: phase.startDate!,
      endDate: phase.endDate!,
      y: row,
      color: this.config.colors.phase,
      isOnCriticalPath: criticalSet.has(phase.id),
      dependencies: phase.dependencies,
    };
  }

  private addSprintBars(
    bars: GanttBar[],
    phase: PathState["phases"][0],
    row: number
  ): number {
    for (const sprint of phase.sprints) {
      bars.push({
        id: sprint.id,
        label: sprint.name,
        type: "sprint",
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        y: row++,
        color: this.config.colors.sprint,
        isOnCriticalPath: false,
        dependencies: [],
      });
    }
    return row;
  }

  private addMilestoneBars(
    bars: GanttBar[],
    phase: PathState["phases"][0],
    row: number
  ): number {
    for (const ms of phase.milestones) {
      bars.push({
        id: ms.id,
        label: ms.name,
        type: "milestone",
        startDate: ms.targetDate,
        endDate: ms.targetDate,
        y: row++,
        color: this.config.colors.milestone,
        isOnCriticalPath: false,
        dependencies: [],
      });
    }
    return row;
  }

  /** Compute viewport from bars. */
  private computeViewport(bars: GanttBar[]): GanttViewport {
    let minDate = new Date();
    let maxDate = new Date();

    for (const bar of bars) {
      const start = new Date(bar.startDate);
      const end = new Date(bar.endDate);
      if (start < minDate) minDate = start;
      if (end > maxDate) maxDate = end;
    }

    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 7);

    return {
      scrollX: 0,
      scrollY: 0,
      scale: "week",
      pixelsPerDay: 30,
      startDate: minDate.toISOString().split("T")[0],
      endDate: maxDate.toISOString().split("T")[0],
    };
  }

  /** Select a bar. */
  selectBar(state: GanttState, barId: string): void {
    state.selectedBarId = barId;
    this.emit({ type: "bar_selected", barId });
  }

  /** Deselect bar. */
  deselectBar(state: GanttState): void {
    state.selectedBarId = null;
    this.emit({ type: "bar_deselected" });
  }

  /** Change viewport scale. */
  setScale(state: GanttState, scale: GanttScale): void {
    state.viewport.scale = scale;
    state.viewport.pixelsPerDay = scale === "day" ? 60 : scale === "week" ? 30 : 10;
    this.emit({ type: "viewport_changed", scale });
  }

  private emit(event: GanttEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Swallow errors
      }
    }
  }
}
