import { describe, it, expect, beforeEach } from "vitest";
import { EmbeddingSimilaritySearch } from "../zo/embeddings/similarity";

describe("EmbeddingSimilaritySearch", () => {
  describe("cosineSimilarity", () => {
    // Create a mock db that we won't use for unit tests
    const mockDb = {} as any;
    const search = new EmbeddingSimilaritySearch(mockDb);

    it("returns 1 for identical vectors", () => {
      const v = [1, 0, 0];
      expect(search.cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it("returns 0 for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(search.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it("returns -1 for opposite vectors", () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(search.cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it("handles normalized vectors correctly", () => {
      const a = [0.6, 0.8, 0];
      const b = [0.8, 0.6, 0];
      const similarity = search.cosineSimilarity(a, b);
      expect(similarity).toBeGreaterThan(0.9);
      expect(similarity).toBeLessThan(1);
    });

    it("throws on dimension mismatch", () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => search.cosineSimilarity(a, b)).toThrow("dimension mismatch");
    });

    it("returns 0 for zero vectors", () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(search.cosineSimilarity(a, b)).toBe(0);
    });
  });
});
