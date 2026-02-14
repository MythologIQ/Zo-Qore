/**
 * Reveal Layout Tests
 *
 * Tests for the grid positioning algorithm.
 *
 * @module tests/reveal.layout.test
 */

import { describe, it, expect } from "vitest";
import { layoutClusters, type LayoutConfig } from "../zo/reveal/layout";
import type { ClusterCandidate } from "../zo/genesis/types";

describe("Layout Algorithm", () => {
  const createCandidate = (id: string): ClusterCandidate => ({
    id,
    thoughtIds: [],
    centroid: [],
    coherenceScore: 0.8,
  });

  describe("layoutClusters", () => {
    it("returns empty array for empty input", () => {
      const positions = layoutClusters([]);
      expect(positions).toEqual([]);
    });

    it("positions single cluster at center", () => {
      const candidates = [createCandidate("c1")];
      const positions = layoutClusters(candidates, {
        width: 800,
        height: 600,
        minSpacing: 100,
        baseSize: 120,
      });

      expect(positions).toHaveLength(1);
      expect(positions[0].x).toBe(400); // center of 800
      expect(positions[0].y).toBe(300); // center of 600
    });

    it("positions 4 clusters in 2x2 grid", () => {
      const candidates = [
        createCandidate("c1"),
        createCandidate("c2"),
        createCandidate("c3"),
        createCandidate("c4"),
      ];

      const positions = layoutClusters(candidates, {
        width: 800,
        height: 600,
        minSpacing: 100,
        baseSize: 120,
      });

      expect(positions).toHaveLength(4);

      // 2x2 grid means cols=2, rows=2
      // cellWidth = 800/2 = 400, cellHeight = 600/2 = 300
      // Position at center of each cell

      // Top-left (0,0): x=200, y=150
      expect(positions[0].x).toBe(200);
      expect(positions[0].y).toBe(150);

      // Top-right (1,0): x=600, y=150
      expect(positions[1].x).toBe(600);
      expect(positions[1].y).toBe(150);

      // Bottom-left (0,1): x=200, y=450
      expect(positions[2].x).toBe(200);
      expect(positions[2].y).toBe(450);

      // Bottom-right (1,1): x=600, y=450
      expect(positions[3].x).toBe(600);
      expect(positions[3].y).toBe(450);
    });

    it("respects custom layout config", () => {
      const candidates = [createCandidate("c1")];
      const config: LayoutConfig = {
        width: 400,
        height: 300,
        minSpacing: 50,
        baseSize: 60,
      };

      const positions = layoutClusters(candidates, config);

      expect(positions).toHaveLength(1);
      expect(positions[0].x).toBe(200); // center of 400
      expect(positions[0].y).toBe(150); // center of 300
    });

    it("uses default config when not provided", () => {
      const candidates = [createCandidate("c1")];
      const positions = layoutClusters(candidates);

      expect(positions).toHaveLength(1);
      // Default is 800x600
      expect(positions[0].x).toBe(400);
      expect(positions[0].y).toBe(300);
    });

    it("handles odd number of clusters", () => {
      const candidates = [
        createCandidate("c1"),
        createCandidate("c2"),
        createCandidate("c3"),
      ];

      const positions = layoutClusters(candidates, {
        width: 600,
        height: 600,
        minSpacing: 100,
        baseSize: 120,
      });

      expect(positions).toHaveLength(3);
      // sqrt(3) ~ 1.73, ceil = 2 cols
      // rows = ceil(3/2) = 2
      // cellWidth = 300, cellHeight = 300

      // First row: (0,0), (1,0)
      expect(positions[0].x).toBe(150);
      expect(positions[0].y).toBe(150);
      expect(positions[1].x).toBe(450);
      expect(positions[1].y).toBe(150);

      // Second row: (0,1)
      expect(positions[2].x).toBe(150);
      expect(positions[2].y).toBe(450);
    });

    it("handles large number of clusters", () => {
      const candidates = Array.from({ length: 9 }, (_, i) => createCandidate(`c${i}`));

      const positions = layoutClusters(candidates, {
        width: 900,
        height: 900,
        minSpacing: 50,
        baseSize: 80,
      });

      expect(positions).toHaveLength(9);
      // sqrt(9) = 3, so 3x3 grid
      // cellWidth = cellHeight = 300

      // Check corners
      expect(positions[0]).toEqual({ x: 150, y: 150 }); // top-left
      expect(positions[2]).toEqual({ x: 750, y: 150 }); // top-right
      expect(positions[6]).toEqual({ x: 150, y: 750 }); // bottom-left
      expect(positions[8]).toEqual({ x: 750, y: 750 }); // bottom-right
    });
  });
});
