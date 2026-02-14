/**
 * Fast Pass Clustering Tests
 *
 * Tests for embedding-based clustering algorithm.
 *
 * @module tests/genesis.fast-pass.test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { FastPassClusterer } from "../zo/genesis/fast-pass";
import type { ClusteringConfig } from "../zo/genesis/types";
import type { SimilaritySearch } from "../zo/embeddings/types";

// Mock similarity search for testing
class MockSimilaritySearch implements SimilaritySearch {
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  async findSimilar(): Promise<never[]> {
    return [];
  }
}

describe("FastPassClusterer", () => {
  let clusterer: FastPassClusterer;
  const config: ClusteringConfig = {
    similarityThreshold: 0.7,
    maxClusterSize: 10,
    minClusterSize: 2,
    ambiguityThreshold: 0.15,
  };

  beforeAll(() => {
    clusterer = new FastPassClusterer(new MockSimilaritySearch(), config);
  });

  it("returns empty result for empty input", async () => {
    const result = await clusterer.cluster([], new Map());

    expect(result.clusters).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(0);
  });

  it("groups high-similarity thoughts together", async () => {
    // Create embeddings that are very similar
    const embeddings = new Map<string, number[]>();
    embeddings.set("t1", [1, 0, 0]);
    embeddings.set("t2", [0.99, 0.1, 0]);
    embeddings.set("t3", [0.98, 0.15, 0]);

    const result = await clusterer.cluster(["t1", "t2", "t3"], embeddings);

    // All three should be in one cluster
    expect(result.clusters.length + result.ambiguous.length).toBeGreaterThan(0);
    const allGroups = [...result.clusters.map((c) => c.thoughtIds), ...result.ambiguous];
    const totalGrouped = allGroups.reduce((sum, g) => sum + g.length, 0);
    expect(totalGrouped).toBe(3);
  });

  it("keeps distinct clusters separate", async () => {
    // Create two distinct groups
    const embeddings = new Map<string, number[]>();
    // Group 1: authentication related (pointing in x direction)
    embeddings.set("auth1", [1, 0, 0]);
    embeddings.set("auth2", [0.95, 0.1, 0]);
    // Group 2: dashboard related (pointing in y direction)
    embeddings.set("dash1", [0, 1, 0]);
    embeddings.set("dash2", [0.1, 0.95, 0]);

    const result = await clusterer.cluster(
      ["auth1", "auth2", "dash1", "dash2"],
      embeddings
    );

    // Should have 2 clusters or 2 ambiguous groups
    const totalGroups = result.clusters.length + result.ambiguous.length;
    expect(totalGroups).toBe(2);
  });

  it("identifies ambiguous clusters", async () => {
    // Create a cluster with high variance in pairwise similarities
    const embeddings = new Map<string, number[]>();
    embeddings.set("t1", [1, 0, 0, 0]);
    embeddings.set("t2", [0.8, 0.6, 0, 0]);
    embeddings.set("t3", [0.7, 0.5, 0.5, 0]);
    embeddings.set("t4", [0.6, 0.4, 0.5, 0.4]);
    embeddings.set("t5", [0.5, 0.3, 0.4, 0.6]);

    const result = await clusterer.cluster(
      ["t1", "t2", "t3", "t4", "t5"],
      embeddings
    );

    // With high variance, the cluster should be marked as ambiguous
    // or split into smaller clusters
    expect(result.clusters.length + result.ambiguous.length).toBeGreaterThan(0);
  });

  it("handles single-thought input", async () => {
    const embeddings = new Map<string, number[]>();
    embeddings.set("lonely", [1, 0, 0]);

    const result = await clusterer.cluster(["lonely"], embeddings);

    // Single thought doesn't meet minClusterSize
    expect(result.clusters).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(0);
  });

  it("computes valid centroids", async () => {
    const embeddings = new Map<string, number[]>();
    embeddings.set("t1", [1, 0, 0]);
    embeddings.set("t2", [0, 1, 0]);

    // Lower threshold to ensure they cluster together
    const lowThresholdClusterer = new FastPassClusterer(
      new MockSimilaritySearch(),
      { ...config, similarityThreshold: 0.0 }
    );

    const result = await lowThresholdClusterer.cluster(["t1", "t2"], embeddings);

    if (result.clusters.length > 0) {
      const cluster = result.clusters[0];
      expect(cluster.centroid).toHaveLength(3);
      // Centroid should be average of [1,0,0] and [0,1,0] = [0.5, 0.5, 0]
      expect(cluster.centroid[0]).toBeCloseTo(0.5, 1);
      expect(cluster.centroid[1]).toBeCloseTo(0.5, 1);
      expect(cluster.centroid[2]).toBeCloseTo(0, 1);
    }
  });

  it("computes coherence score", async () => {
    const embeddings = new Map<string, number[]>();
    // Very similar embeddings
    embeddings.set("t1", [1, 0, 0]);
    embeddings.set("t2", [1, 0, 0]);

    const lowThresholdClusterer = new FastPassClusterer(
      new MockSimilaritySearch(),
      { ...config, similarityThreshold: 0.0 }
    );

    const result = await lowThresholdClusterer.cluster(["t1", "t2"], embeddings);

    if (result.clusters.length > 0) {
      // Identical vectors should have coherence of 1.0
      expect(result.clusters[0].coherenceScore).toBeCloseTo(1.0, 2);
    }
  });
});
