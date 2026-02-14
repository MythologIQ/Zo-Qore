/**
 * Hybrid Clusterer
 *
 * Combines fast pass (embedding similarity) and LLM pass (theme extraction)
 * for optimal clustering of genesis session thoughts.
 *
 * @module zo/genesis/clusterer
 */

import { SimilaritySearch } from "../embeddings/types";
import { FastPassClusterer } from "./fast-pass";
import { LlmPassProcessor, LlmPassConfig } from "./llm-pass";
import { ClusteringResult, ClusterCandidate, ClusteringConfig } from "./types";

const DEFAULT_CONFIG: ClusteringConfig = {
  similarityThreshold: 0.75,
  maxClusterSize: 15,
  minClusterSize: 2,
  ambiguityThreshold: 0.15,
};

/**
 * Hybrid clustering algorithm combining fast pass and LLM pass.
 */
export class HybridClusterer {
  private readonly fastPass: FastPassClusterer;
  private readonly llmPass: LlmPassProcessor | null;
  private readonly config: ClusteringConfig;

  constructor(options: {
    similarity: SimilaritySearch;
    config?: Partial<ClusteringConfig>;
    llmConfig?: LlmPassConfig;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.fastPass = new FastPassClusterer(options.similarity, this.config);
    this.llmPass = options.llmConfig
      ? new LlmPassProcessor(options.llmConfig)
      : null;
  }

  /**
   * Cluster thoughts using hybrid algorithm.
   */
  async cluster(
    thoughtIds: string[],
    embeddings: Map<string, number[]>,
    thoughtContents: Map<string, string>
  ): Promise<ClusteringResult> {
    const startTime = Date.now();

    // Fast pass
    const { clusters, ambiguous } = await this.fastPass.cluster(
      thoughtIds,
      embeddings
    );

    // LLM pass for ambiguous clusters
    let llmClusters: ClusterCandidate[] = [];
    let usedLlmPass = false;

    if (ambiguous.length > 0 && this.llmPass) {
      usedLlmPass = true;
      llmClusters = await this.llmPass.processAmbiguousClusters(
        ambiguous,
        thoughtContents
      );
    } else {
      // Create clusters without themes for ambiguous groups
      llmClusters = ambiguous.map((thoughtIds) => ({
        id: crypto.randomUUID(),
        thoughtIds,
        centroid: [],
        coherenceScore: 0.5,
      }));
    }

    // Find outliers (thoughts not in any cluster)
    const clusteredIds = new Set<string>();
    for (const c of [...clusters, ...llmClusters]) {
      for (const id of c.thoughtIds) {
        clusteredIds.add(id);
      }
    }
    const outliers = thoughtIds.filter((id) => !clusteredIds.has(id));

    return {
      clusters: [...clusters, ...llmClusters],
      outliers,
      processingTimeMs: Date.now() - startTime,
      usedLlmPass,
    };
  }
}
