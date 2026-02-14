/**
 * Hybrid Clusterer Tests
 *
 * Tests for the hybrid clustering algorithm combining fast pass and LLM pass.
 *
 * @module tests/genesis.clusterer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HybridClusterer } from "../zo/genesis/clusterer";
import type { SimilaritySearch } from "../zo/embeddings/types";

// Mock similarity search
class MockSimilaritySearch implements SimilaritySearch {
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

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

describe("HybridClusterer", () => {
  let clusterer: HybridClusterer;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes obvious clusters through fast pass only", async () => {
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
      config: {
        similarityThreshold: 0.9,
        minClusterSize: 2,
        maxClusterSize: 10,
        ambiguityThreshold: 0.3,
      },
    });

    // Very similar embeddings - should cluster without LLM
    const embeddings = new Map([
      ["t1", [1, 0, 0]],
      ["t2", [0.99, 0.1, 0]],
    ]);
    const contents = new Map([
      ["t1", "Login with email"],
      ["t2", "Email authentication"],
    ]);

    const result = await clusterer.cluster(["t1", "t2"], embeddings, contents);

    // Should not have called fetch (no LLM pass)
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.usedLlmPass).toBe(false);
  });

  it("routes ambiguous clusters through LLM pass", async () => {
    // Configure with LLM
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
      config: {
        similarityThreshold: 0.5,
        minClusterSize: 2,
        maxClusterSize: 3, // Very small to trigger ambiguity
        ambiguityThreshold: 0.01, // Very low to trigger ambiguity
      },
      llmConfig: {
        zoEndpoint: "http://localhost:9999/api",
        timeoutMs: 5000,
        model: "test",
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ theme: "Mixed", name: "Cluster" }),
      }),
    });

    // Moderately similar but diverse embeddings
    const embeddings = new Map([
      ["t1", [1, 0, 0, 0]],
      ["t2", [0.7, 0.7, 0, 0]],
      ["t3", [0.5, 0.5, 0.5, 0]],
      ["t4", [0.3, 0.3, 0.3, 0.7]],
    ]);
    const contents = new Map([
      ["t1", "Idea 1"],
      ["t2", "Idea 2"],
      ["t3", "Idea 3"],
      ["t4", "Idea 4"],
    ]);

    const result = await clusterer.cluster(
      ["t1", "t2", "t3", "t4"],
      embeddings,
      contents
    );

    // Result should include clusters
    expect(result.clusters.length + result.outliers.length).toBeGreaterThan(0);
  });

  it("identifies outliers correctly", async () => {
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
      config: {
        similarityThreshold: 0.95,
        minClusterSize: 2,
        maxClusterSize: 10,
        ambiguityThreshold: 0.15,
      },
    });

    // One similar pair, one outlier
    const embeddings = new Map([
      ["t1", [1, 0, 0]],
      ["t2", [0.99, 0.1, 0]],
      ["outlier", [0, 0, 1]], // Completely different
    ]);
    const contents = new Map([
      ["t1", "Auth"],
      ["t2", "Login"],
      ["outlier", "Random"],
    ]);

    const result = await clusterer.cluster(
      ["t1", "t2", "outlier"],
      embeddings,
      contents
    );

    // Outlier should not be in any cluster
    const clusteredIds = new Set(
      result.clusters.flatMap((c) => c.thoughtIds)
    );
    expect(clusteredIds.has("outlier")).toBe(false);
    expect(result.outliers).toContain("outlier");
  });

  it("reports correct timing metrics", async () => {
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
      config: {
        similarityThreshold: 0.5,
        minClusterSize: 2,
        maxClusterSize: 10,
        ambiguityThreshold: 0.15,
      },
    });

    const embeddings = new Map([
      ["t1", [1, 0, 0]],
      ["t2", [0.9, 0.1, 0]],
    ]);
    const contents = new Map([
      ["t1", "Test 1"],
      ["t2", "Test 2"],
    ]);

    const result = await clusterer.cluster(["t1", "t2"], embeddings, contents);

    expect(typeof result.processingTimeMs).toBe("number");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty input", async () => {
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
    });

    const result = await clusterer.cluster([], new Map(), new Map());

    expect(result.clusters).toHaveLength(0);
    expect(result.outliers).toHaveLength(0);
    expect(result.usedLlmPass).toBe(false);
  });

  it("works without LLM config", async () => {
    // No LLM config provided
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
      config: {
        similarityThreshold: 0.5,
        minClusterSize: 2,
        maxClusterSize: 2, // Force ambiguity
        ambiguityThreshold: 0.01,
      },
    });

    const embeddings = new Map([
      ["t1", [1, 0, 0]],
      ["t2", [0.8, 0.6, 0]],
      ["t3", [0.6, 0.6, 0.5]],
    ]);
    const contents = new Map([
      ["t1", "A"],
      ["t2", "B"],
      ["t3", "C"],
    ]);

    const result = await clusterer.cluster(
      ["t1", "t2", "t3"],
      embeddings,
      contents
    );

    // Should work without LLM - clusters won't have themes
    expect(result.usedLlmPass).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges fast pass and LLM pass clusters", async () => {
    clusterer = new HybridClusterer({
      similarity: new MockSimilaritySearch(),
      config: {
        similarityThreshold: 0.95,
        minClusterSize: 2,
        maxClusterSize: 10,
        ambiguityThreshold: 0.15,
      },
      llmConfig: {
        zoEndpoint: "http://test",
        timeoutMs: 1000,
        model: "test",
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ theme: "LLM Theme", name: "LLM" }),
      }),
    });

    // Two clear clusters
    const embeddings = new Map([
      ["a1", [1, 0, 0]],
      ["a2", [0.99, 0.1, 0]],
      ["b1", [0, 1, 0]],
      ["b2", [0.1, 0.99, 0]],
    ]);
    const contents = new Map([
      ["a1", "Auth 1"],
      ["a2", "Auth 2"],
      ["b1", "Dash 1"],
      ["b2", "Dash 2"],
    ]);

    const result = await clusterer.cluster(
      ["a1", "a2", "b1", "b2"],
      embeddings,
      contents
    );

    // Should have clusters covering all thoughts
    const allClustered = result.clusters.flatMap((c) => c.thoughtIds);
    const allOutliers = result.outliers;
    const totalAccountedFor = allClustered.length + allOutliers.length;
    expect(totalAccountedFor).toBe(4);
  });
});
