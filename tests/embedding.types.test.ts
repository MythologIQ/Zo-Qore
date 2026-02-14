import { describe, it, expect } from "vitest";
import type {
  EmbeddingVector,
  EmbeddingResult,
  EmbeddingService,
  SimilarityResult,
  SimilaritySearch,
} from "../zo/embeddings/types";

describe("Embedding Types", () => {
  it("EmbeddingVector matches expected shape", () => {
    const vector: EmbeddingVector = {
      values: [0.1, 0.2, 0.3],
      dimensions: 3,
      model: "test-model",
    };
    expect(vector.dimensions).toBe(3);
    expect(vector.model).toBe("test-model");
  });

  it("EmbeddingResult includes required fields", () => {
    const result: EmbeddingResult = {
      id: "test-id",
      vector: {
        values: [0.1, 0.2],
        dimensions: 2,
        model: "test",
      },
      inputHash: "abc123",
      computedAt: "2026-02-14T00:00:00Z",
    };
    expect(result.id).toBe("test-id");
    expect(result.inputHash).toBe("abc123");
  });

  it("SimilarityResult contains score and distance", () => {
    const result: SimilarityResult = {
      id: "match-1",
      score: 0.95,
      distance: 0.05,
    };
    expect(result.score).toBeGreaterThan(0);
    expect(result.distance).toBeCloseTo(1 - result.score, 10);
  });
});
