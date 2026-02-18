/**
 * Genesis Pipeline
 *
 * Background processing pipeline for genesis sessions.
 * Orchestrates embedding, clustering, and completeness detection.
 *
 * @module zo/genesis/pipeline
 */

import { DuckDBClient } from "../storage/duckdb-client";
import { EmbeddingSimilaritySearch } from "../embeddings/similarity";
import { EmbeddingStorage } from "../embeddings/storage";
import { LocalEmbeddingService } from "../embeddings/local-service";
import type { EmbeddingService } from "../embeddings/types";
import { ProjectTabStorage } from "../project-tab/storage";
import { HybridClusterer } from "./clusterer";
import { CompletenessDetector } from "./completeness";
import {
  ClusteringResult,
  CompletenessAssessment,
  GenesisEvent,
  GenesisEventHandler,
  ClusteringConfig,
} from "./types";
import { LlmPassConfig } from "./llm-pass";

export interface GenesisPipelineConfig {
  /** Clustering configuration */
  clustering?: Partial<ClusteringConfig>;

  /** LLM configuration (optional) */
  llm?: LlmPassConfig;

  /** Debounce delay for processing (ms) */
  debounceMs: number;

  /** Optional embedding service for testing */
  embeddingService?: EmbeddingService;

  /** Skip embedding storage (for testing with mock services) */
  skipEmbeddingStorage?: boolean;
}

/**
 * Background processing pipeline for genesis sessions.
 */
export class GenesisPipeline {
  private readonly clusterer: HybridClusterer;
  private readonly completeness: CompletenessDetector;
  private readonly storage: ProjectTabStorage;
  private readonly embeddingStorage: EmbeddingStorage;
  private readonly embeddingService: EmbeddingService;

  private pendingThoughts: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private eventHandlers: GenesisEventHandler[] = [];
  private lastResult: ClusteringResult | null = null;

  constructor(db: DuckDBClient, private readonly config: GenesisPipelineConfig) {
    const similarity = new EmbeddingSimilaritySearch(db);
    this.clusterer = new HybridClusterer({
      similarity,
      config: config.clustering,
      llmConfig: config.llm,
    });
    this.completeness = new CompletenessDetector();
    this.storage = new ProjectTabStorage(db);
    this.embeddingStorage = new EmbeddingStorage(db);
    this.embeddingService = config.embeddingService ?? new LocalEmbeddingService();
  }

  /**
   * Subscribe to pipeline events.
   */
  onEvent(handler: GenesisEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * Process a new thought (debounced).
   */
  queueThought(sessionId: string, thoughtId: string): void {
    // Clear existing timeout for this session
    const existing = this.pendingThoughts.get(sessionId);
    if (existing) clearTimeout(existing);

    // Emit immediate event
    this.emit({ type: "thought_added", thoughtId });

    // Debounce processing
    const timeout = setTimeout(
      () => this.processSession(sessionId),
      this.config.debounceMs
    );
    this.pendingThoughts.set(sessionId, timeout);
  }

  /**
   * Force immediate processing of a session.
   */
  async processSession(sessionId: string): Promise<{
    clustering: ClusteringResult;
    completeness: CompletenessAssessment;
  }> {
    this.pendingThoughts.delete(sessionId);
    this.emit({ type: "clustering_started" });

    // Get session thoughts
    const session = await this.storage.getGenesisSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const thoughts = await this.storage.listThoughtsForSession(sessionId);

    // Get or compute embeddings
    const embeddings = new Map<string, number[]>();
    const contents = new Map<string, string>();

    for (const thought of thoughts) {
      contents.set(thought.id, thought.content);

      // Check for existing embedding
      let embedding = await this.embeddingStorage.getByThoughtId(thought.id);

      if (!embedding) {
        // Compute embedding
        const result = await this.embeddingService.embed(thought.content);

        // Store embedding unless skipped (for testing)
        if (!this.config.skipEmbeddingStorage) {
          try {
            await this.embeddingStorage.store(thought.id, result);
          } catch (storeErr) {
            console.error(
              `[GenesisPipeline] Failed to store embedding for thought ${
                thought.id
              }:`,
              storeErr
            );
          }
        }

        embedding = {
          id: result.id,
          thoughtId: thought.id,
          modelId: result.vector.model,
          vector: Array.isArray(result.vector.values)
            ? result.vector.values
            : Array.from(result.vector.values),
          dimensions: result.vector.dimensions,
          createdAt: result.computedAt,
        };
      }

      embeddings.set(thought.id, embedding.vector);
    }

    // Run clustering
    const clusteringResult = await this.clusterer.cluster(
      thoughts.map((t) => t.id),
      embeddings,
      contents
    );

    this.lastResult = clusteringResult;
    this.emit({ type: "clustering_completed", result: clusteringResult });

    // Assess completeness
    const completenessResult = this.completeness.assess(
      thoughts.map((t) => ({
        id: t.id,
        content: t.content,
        timestamp: t.timestamp,
      })),
      clusteringResult.clusters.length
    );

    this.emit({ type: "completeness_updated", assessment: completenessResult });

    if (completenessResult.readyForReveal) {
      this.emit({ type: "ready_for_reveal" });
    }

    return {
      clustering: clusteringResult,
      completeness: completenessResult,
    };
  }

  /**
   * Get the last clustering result.
   */
  getLastResult(): ClusteringResult | null {
    return this.lastResult;
  }

  /**
   * Clear all pending debounce timeouts (for test cleanup).
   */
  clearPendingTimeouts(): void {
    for (const timeout of this.pendingThoughts.values()) {
      clearTimeout(timeout);
    }
    this.pendingThoughts.clear();
  }

  private emit(event: GenesisEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error("Genesis event handler error:", e);
      }
    }
  }
}
