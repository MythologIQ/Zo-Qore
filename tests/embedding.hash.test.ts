import { describe, it, expect } from "vitest";
import { hashContent } from "../zo/embeddings/hash";

describe("hashContent", () => {
  it("returns 16-character hex string", () => {
    const hash = hashContent("test content");
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic for same input", () => {
    const input = "hello world";
    const hash1 = hashContent(input);
    const hash2 = hashContent(input);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hashContent("content A");
    const hash2 = hashContent("content B");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = hashContent("");
    expect(hash).toHaveLength(16);
  });

  it("handles unicode content", () => {
    const hash = hashContent("Hello 世界 🌍");
    expect(hash).toHaveLength(16);
  });
});
