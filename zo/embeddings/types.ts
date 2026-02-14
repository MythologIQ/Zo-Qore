/**
 * Embedding Service Types and Interfaces
 *
 * Core type definitions for the embedding service used in Phase 2
 * of the Project Tab implementation. Provides type-safe contracts
 * for embedding generation, storage, and similarity search.
 */

/**
 * Represents a computed embedding vector with metadata.
 * Supports both Float32Array for memory efficiency and number[]
 * for JSON serialization compatibility.
 */
export interface EmbeddingVector {
  /** The embedding values - Float32Array for computation, number[] for storage */
  readonly values: Float32Array | number[];
  /** Number of dimensions in the vector (e.g., 384 for MiniLM) */
  readonly dimensions: number;
  /** Model identifier used to generate this embedding */
  readonly model: string;
}

/**
 * Result of an embedding computation with full provenance.
 * Includes hash of input for cache invalidation and deduplication.
 */
export interface EmbeddingResult {
  /** Unique identifier for this embedding result */
  readonly id: string;
  /** The computed embedding vector with metadata */
  readonly vector: EmbeddingVector;
  /** SHA-256 hash (truncated) of the input text for deduplication */
  readonly inputHash: string;
  /** ISO 8601 timestamp of when the embedding was computed */
  readonly computedAt: string;
}

/**
 * Service interface for generating text embeddings.
 * Supports single and batch embedding operations with
 * model introspection and readiness checks.
 */
export interface EmbeddingService {
  /**
   * Generate embedding for a single text input.
   * @param text - The text to embed
   * @returns Promise resolving to the embedding result
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts (batched).
   * May process sequentially or in parallel depending on implementation.
   * @param texts - Array of texts to embed
   * @returns Promise resolving to array of embedding results in same order
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Get the model identifier used by this service.
   * @returns Model ID string (e.g., 'Xenova/all-MiniLM-L6-v2')
   */
  getModelId(): string;

  /**
   * Get the vector dimensions produced by the model.
   * @returns Number of dimensions (e.g., 384)
   */
  getDimensions(): number;

  /**
   * Check if the service is ready to process requests.
   * May involve loading the model on first call.
   * @returns Promise resolving to true if service is operational
   */
  isReady(): Promise<boolean>;
}

/**
 * Result of a similarity search query.
 * Contains the matched item ID and similarity metrics.
 */
export interface SimilarityResult {
  /** Identifier of the matched embedding */
  readonly id: string;
  /** Cosine similarity score (0-1, higher is more similar) */
  readonly score: number;
  /** Distance metric (1 - score for cosine similarity) */
  readonly distance: number;
}

/**
 * Interface for similarity search operations over embeddings.
 * Provides k-nearest-neighbor search and similarity computation.
 */
export interface SimilaritySearch {
  /**
   * Find k most similar embeddings to query vector.
   * Results are sorted by similarity score in descending order.
   * @param queryVector - The query embedding vector
   * @param k - Number of results to return
   * @param filter - Optional filter criteria for project/session scope
   * @returns Promise resolving to array of similarity results
   */
  findSimilar(
    queryVector: number[],
    k: number,
    filter?: { projectId?: string; sessionId?: string }
  ): Promise<SimilarityResult[]>;

  /**
   * Compute cosine similarity between two vectors.
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity score between -1 and 1
   * @throws Error if vectors have different dimensions
   */
  cosineSimilarity(a: number[], b: number[]): number;
}
