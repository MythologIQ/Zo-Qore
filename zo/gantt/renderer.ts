/**
 * Gantt Renderer
 *
 * Canvas rendering utilities for Gantt chart.
 *
 * @module zo/gantt/renderer
 */

import type {
  GanttBar,
  GanttArrow,
  GanttViewport,
  GanttConfig,
  GanttState,
} from "./types.js";
import { DEFAULT_GANTT_CONFIG } from "./types.js";

/**
 * Minimal Canvas 2D context interface for rendering.
 * This allows the module to be type-checked without DOM lib.
 */
export interface CanvasContext {
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

/** Bar position with dimensions */
export interface BarPosition {
  bar: GanttBar;
  x: number;
  width: number;
  y: number;
}

/** Calculate bar positions from dates. */
export function calculateBarPositions(
  bars: GanttBar[],
  viewport: GanttViewport,
  config: GanttConfig = DEFAULT_GANTT_CONFIG
): BarPosition[] {
  const startMs = new Date(viewport.startDate).getTime();

  return bars.map((bar, index) => {
    const barStartMs = new Date(bar.startDate).getTime();
    const barEndMs = new Date(bar.endDate).getTime();

    const x = ((barStartMs - startMs) / (1000 * 60 * 60 * 24)) * viewport.pixelsPerDay;
    const durationDays = Math.max(1, (barEndMs - barStartMs) / (1000 * 60 * 60 * 24));
    const width = Math.max(durationDays * viewport.pixelsPerDay, config.minBarWidth);
    const y = config.headerHeight + index * config.rowHeight;

    return { bar, x, width, y };
  });
}

/** Calculate dependency arrows between bars. */
export function calculateArrows(
  state: GanttState,
  barPositions: BarPosition[],
  config: GanttConfig = DEFAULT_GANTT_CONFIG
): GanttArrow[] {
  const positionMap = new Map(barPositions.map((bp) => [bp.bar.id, bp]));
  const arrows: GanttArrow[] = [];

  for (const bp of barPositions) {
    for (const depId of bp.bar.dependencies) {
      const dep = positionMap.get(depId);
      if (!dep) continue;

      arrows.push({
        fromId: depId,
        toId: bp.bar.id,
        fromX: dep.x + dep.width,
        fromY: dep.y + config.rowHeight / 2,
        toX: bp.x,
        toY: bp.y + config.rowHeight / 2,
      });
    }
  }

  return arrows;
}

/** Render bars to Canvas context. */
export function renderBars(
  ctx: CanvasContext,
  barPositions: BarPosition[],
  config: GanttConfig = DEFAULT_GANTT_CONFIG,
  selectedId: string | null
): void {
  for (const { bar, x, width, y } of barPositions) {
    const color = bar.isOnCriticalPath
      ? config.colors.criticalPath
      : config.colors[bar.type] || config.colors.phase;

    ctx.fillStyle = color;

    if (bar.type === "milestone") {
      renderMilestone(ctx, x, width, y, config);
    } else {
      ctx.fillRect(x, y + 8, width, config.rowHeight - 16);
    }

    if (bar.id === selectedId) {
      renderSelection(ctx, x, y, width, config);
    }
  }
}

function renderMilestone(
  ctx: CanvasContext,
  x: number,
  width: number,
  y: number,
  config: GanttConfig
): void {
  const cx = x + width / 2;
  const cy = y + config.rowHeight / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx, cy + 10);
  ctx.lineTo(cx - 10, cy);
  ctx.closePath();
  ctx.fill();
}

function renderSelection(
  ctx: CanvasContext,
  x: number,
  y: number,
  width: number,
  config: GanttConfig
): void {
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 1, y + 7, width + 2, config.rowHeight - 14);
}

/** Render dependency arrows to Canvas context. */
export function renderArrows(
  ctx: CanvasContext,
  arrows: GanttArrow[],
  config: GanttConfig = DEFAULT_GANTT_CONFIG
): void {
  ctx.strokeStyle = config.colors.arrow;
  ctx.lineWidth = 1;

  for (const arrow of arrows) {
    const midX = (arrow.fromX + arrow.toX) / 2;

    ctx.beginPath();
    ctx.moveTo(arrow.fromX, arrow.fromY);
    ctx.bezierCurveTo(midX, arrow.fromY, midX, arrow.toY, arrow.toX, arrow.toY);
    ctx.stroke();

    renderArrowhead(ctx, arrow, midX, config);
  }
}

function renderArrowhead(
  ctx: CanvasContext,
  arrow: GanttArrow,
  midX: number,
  config: GanttConfig
): void {
  const angle = Math.atan2(arrow.toY - arrow.fromY, arrow.toX - midX);
  ctx.beginPath();
  ctx.moveTo(arrow.toX, arrow.toY);
  ctx.lineTo(
    arrow.toX - 8 * Math.cos(angle - Math.PI / 6),
    arrow.toY - 8 * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    arrow.toX - 8 * Math.cos(angle + Math.PI / 6),
    arrow.toY - 8 * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = config.colors.arrow;
  ctx.fill();
}

/** Render time scale header. */
export function renderHeader(
  ctx: CanvasContext,
  viewport: GanttViewport,
  width: number,
  config: GanttConfig = DEFAULT_GANTT_CONFIG
): void {
  const startMs = new Date(viewport.startDate).getTime();
  const endMs = new Date(viewport.endDate).getTime();
  const days = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));

  ctx.fillStyle = "#FAFAFA";
  ctx.fillRect(0, 0, width, config.headerHeight);

  ctx.fillStyle = "#333333";
  ctx.font = "12px system-ui";

  for (let i = 0; i <= days; i++) {
    const date = new Date(startMs + i * 24 * 60 * 60 * 1000);
    const x = i * viewport.pixelsPerDay;

    renderDayColumn(ctx, date, x, viewport, config);
    renderDateLabel(ctx, date, x, i, config);
  }
}

function renderDayColumn(
  ctx: CanvasContext,
  date: Date,
  x: number,
  viewport: GanttViewport,
  config: GanttConfig
): void {
  if (date.getDay() === 0 || date.getDay() === 6) {
    ctx.fillStyle = config.colors.weekend;
    ctx.fillRect(x, config.headerHeight, viewport.pixelsPerDay, 1000);
    ctx.fillStyle = "#333333";
  }
}

function renderDateLabel(
  ctx: CanvasContext,
  date: Date,
  x: number,
  dayIndex: number,
  config: GanttConfig
): void {
  if (dayIndex % 7 === 0 || date.getDate() === 1) {
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillText(label, x + 4, config.headerHeight - 10);
  }
}
