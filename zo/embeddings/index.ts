/**
 * Embedding Service Public API
 *
 * Exports types, interfaces, and implementations for the
 * embedding service module used in Project Tab Phase 2.
 */

// Type exports
export type {
  EmbeddingVector,
  EmbeddingResult,
  EmbeddingService,
  SimilarityResult,
  SimilaritySearch,
} from './types';

// Implementation exports
export { LocalEmbeddingService } from './local-service';
export { EmbeddingSimilaritySearch } from './similarity';

// Storage exports
export { EmbeddingStorage } from './storage';
export type { StoredEmbedding } from './storage';

// Utility exports
export { hashContent } from './hash';
