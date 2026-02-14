/**
 * Fast Pass Clustering
 *
 * Embedding-based clustering using agglomerative single-linkage algorithm.
 * Groups obviously related thoughts without requiring LLM calls.
 *
 * @module zo/genesis/fast-pass
 */

import { SimilaritySearch } from "../embeddings/types";
import { ClusterCandidate, ClusteringConfig } from "./types";

/**
 * Fast pass clustering using local embedding similarity.
 * Groups obviously related thoughts using agglomerative clustering.
 */
export class FastPassClusterer {
  constructor(
    private readonly similarity: SimilaritySearch,
    private readonly config: ClusteringConfig
  ) {}

  /**
   * Cluster thoughts by embedding similarity.
   * Uses single-linkage agglomerative clustering.
   */
  async cluster(
    thoughtIds: string[],
    embeddings: Map<string, number[]>
  ): Promise<{
    clusters: ClusterCandidate[];
    ambiguous: string[][];
  }> {
    if (thoughtIds.length === 0) {
      return { clusters: [], ambiguous: [] };
    }

    // Build similarity matrix
    const matrix = this.buildSimilarityMatrix(thoughtIds, embeddings);

    // Agglomerative clustering
    const groups = this.agglomerativeClustering(thoughtIds, matrix);

    // Classify each group
    const clusters: ClusterCandidate[] = [];
    const ambiguous: string[][] = [];

    for (const group of groups) {
      if (group.length < this.config.minClusterSize) {
        continue; // Will be added to outliers
      }

      const candidate = this.createCandidate(group, embeddings);

      // Check if cluster is ambiguous (needs LLM pass)
      if (this.isAmbiguous(candidate, matrix, thoughtIds)) {
        ambiguous.push(group);
      } else {
        clusters.push(candidate);
      }
    }

    return { clusters, ambiguous };
  }

  private buildSimilarityMatrix(
    thoughtIds: string[],
    embeddings: Map<string, number[]>
  ): number[][] {
    const n = thoughtIds.length;
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      const vecA = embeddings.get(thoughtIds[i]);
      if (!vecA) continue;

      for (let j = i + 1; j < n; j++) {
        const vecB = embeddings.get(thoughtIds[j]);
        if (!vecB) continue;

        const sim = this.similarity.cosineSimilarity(vecA, vecB);
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
      matrix[i][i] = 1.0;
    }

    return matrix;
  }

  private agglomerativeClustering(
    thoughtIds: string[],
    matrix: number[][]
  ): string[][] {
    // Simple single-linkage agglomerative clustering
    const n = thoughtIds.length;
    const clusters: Set<number>[] = thoughtIds.map((_, i) => new Set([i]));
    const active = new Set(Array.from({ length: n }, (_, i) => i));

    while (active.size > 1) {
      let maxSim = -1;
      let mergeI = -1;
      let mergeJ = -1;

      // Find most similar pair of clusters
      const activeArr = Array.from(active);
      for (let i = 0; i < activeArr.length; i++) {
        for (let j = i + 1; j < activeArr.length; j++) {
          const ci = activeArr[i];
          const cj = activeArr[j];
          const sim = this.clusterSimilarity(clusters[ci], clusters[cj], matrix);
          if (sim > maxSim) {
            maxSim = sim;
            mergeI = ci;
            mergeJ = cj;
          }
        }
      }

      // Stop if no pair above threshold
      if (maxSim < this.config.similarityThreshold) break;

      // Merge clusters
      for (const idx of clusters[mergeJ]) {
        clusters[mergeI].add(idx);
      }
      active.delete(mergeJ);
    }

    // Convert to thought IDs
    return Array.from(active).map((ci) =>
      Array.from(clusters[ci]).map((idx) => thoughtIds[idx])
    );
  }

  private clusterSimilarity(
    a: Set<number>,
    b: Set<number>,
    matrix: number[][]
  ): number {
    // Single-linkage: max similarity between any pair
    let max = -1;
    for (const i of a) {
      for (const j of b) {
        if (matrix[i][j] > max) max = matrix[i][j];
      }
    }
    return max;
  }

  private createCandidate(
    thoughtIds: string[],
    embeddings: Map<string, number[]>
  ): ClusterCandidate {
    // Compute centroid
    const vectors = thoughtIds
      .map((id) => embeddings.get(id))
      .filter((v): v is number[] => v !== undefined);

    const dims = vectors[0]?.length ?? 0;
    const centroid = Array(dims).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < dims; i++) {
        centroid[i] += vec[i] / vectors.length;
      }
    }

    // Compute coherence (average pairwise similarity)
    let totalSim = 0;
    let pairs = 0;
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        totalSim += this.similarity.cosineSimilarity(vectors[i], vectors[j]);
        pairs++;
      }
    }

    return {
      id: crypto.randomUUID(),
      thoughtIds,
      centroid,
      coherenceScore: pairs > 0 ? totalSim / pairs : 1.0,
    };
  }

  private isAmbiguous(
    candidate: ClusterCandidate,
    matrix: number[][],
    allThoughtIds: string[]
  ): boolean {
    if (candidate.thoughtIds.length <= 3) return false;
    if (candidate.thoughtIds.length > this.config.maxClusterSize) return true;

    // Check variance in pairwise similarities
    const indices = candidate.thoughtIds.map((id) => allThoughtIds.indexOf(id));
    const sims: number[] = [];

    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        sims.push(matrix[indices[i]][indices[j]]);
      }
    }

    if (sims.length === 0) return false;

    const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
    const variance =
      sims.reduce((a, b) => a + (b - mean) ** 2, 0) / sims.length;

    return variance > this.config.ambiguityThreshold;
  }
}
