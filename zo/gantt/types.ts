/**
 * Gantt Types
 *
 * Type definitions for the Gantt chart visualization module.
 *
 * @module zo/gantt/types
 */

// ============================================================================
// View Configuration
// ============================================================================

/** View scale */
export type GanttScale = "day" | "week" | "month";

// ============================================================================
// Bar Types
// ============================================================================

/** Single bar in Gantt chart */
export interface GanttBar {
  id: string;
  label: string;
  type: "phase" | "sprint" | "milestone";
  startDate: string;
  endDate: string;
  y: number;
  color: string;
  isOnCriticalPath: boolean;
  dependencies: string[];
}

/** Dependency arrow */
export interface GanttArrow {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

// ============================================================================
// State Types
// ============================================================================

/** Gantt viewport state */
export interface GanttViewport {
  scrollX: number;
  scrollY: number;
  scale: GanttScale;
  pixelsPerDay: number;
  startDate: string;
  endDate: string;
}

/** Drag interaction state */
export interface GanttDragState {
  barId: string;
  mode: "move" | "resize-start" | "resize-end";
  startX: number;
  originalStart: string;
  originalEnd: string;
}

/** Complete Gantt state */
export interface GanttState {
  projectId: string;
  bars: GanttBar[];
  arrows: GanttArrow[];
  viewport: GanttViewport;
  selectedBarId: string | null;
  dragState: GanttDragState | null;
}

// ============================================================================
// Configuration
// ============================================================================

/** Gantt color configuration */
export interface GanttColors {
  phase: string;
  sprint: string;
  milestone: string;
  criticalPath: string;
  arrow: string;
  weekend: string;
}

/** Gantt configuration */
export interface GanttConfig {
  rowHeight: number;
  headerHeight: number;
  sidebarWidth: number;
  minBarWidth: number;
  colors: GanttColors;
}

/** Default Gantt config */
export const DEFAULT_GANTT_CONFIG: GanttConfig = {
  rowHeight: 40,
  headerHeight: 60,
  sidebarWidth: 200,
  minBarWidth: 20,
  colors: {
    phase: "#4A90D9",
    sprint: "#7CB342",
    milestone: "#F5A623",
    criticalPath: "#D32F2F",
    arrow: "#666666",
    weekend: "#F5F5F5",
  },
};

// ============================================================================
// Events
// ============================================================================

/** Gantt event types */
export type GanttEvent =
  | { type: "bar_selected"; barId: string }
  | { type: "bar_deselected" }
  | { type: "bar_moved"; barId: string; newStart: string; newEnd: string }
  | { type: "bar_resized"; barId: string; newStart: string; newEnd: string }
  | { type: "viewport_changed"; scale: GanttScale };
