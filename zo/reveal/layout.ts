/**
 * Cluster Layout Algorithm
 *
 * Positions clusters in a grid with spacing based on coherence.
 *
 * @module zo/reveal/layout
 */

import type { ClusterCandidate } from "../genesis/types.js";

export interface LayoutConfig {
  /** Container width in pixels */
  width: number;
  /** Container height in pixels */
  height: number;
  /** Minimum spacing between clusters */
  minSpacing: number;
  /** Base cluster size */
  baseSize: number;
}

const DEFAULT_LAYOUT: LayoutConfig = {
  width: 800,
  height: 600,
  minSpacing: 100,
  baseSize: 120,
};

/**
 * Position clusters in a grid layout.
 */
export function layoutClusters(
  candidates: ClusterCandidate[],
  config: LayoutConfig = DEFAULT_LAYOUT
): Array<{ x: number; y: number }> {
  const count = candidates.length;
  if (count === 0) return [];

  // Calculate grid dimensions
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const cellWidth = config.width / cols;
  const cellHeight = config.height / rows;

  const positions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    positions.push({
      x: col * cellWidth + cellWidth / 2,
      y: row * cellHeight + cellHeight / 2,
    });
  }

  return positions;
}
