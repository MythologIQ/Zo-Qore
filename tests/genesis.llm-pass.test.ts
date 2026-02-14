/**
 * LLM Pass Tests
 *
 * Tests for theme extraction via Zo API.
 *
 * @module tests/genesis.llm-pass.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlmPassProcessor } from "../zo/genesis/llm-pass";

describe("LlmPassProcessor", () => {
  const mockConfig = {
    zoEndpoint: "http://localhost:9999/api/generate",
    timeoutMs: 5000,
    model: "test-model",
  };

  let processor: LlmPassProcessor;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    processor = new LlmPassProcessor(mockConfig);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts theme from thought group", async () => {
    const mockResponse = {
      theme: "User Authentication",
      name: "Auth",
      connections: ["login", "security"],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: JSON.stringify(mockResponse) }),
    });

    const clusters = [["t1", "t2", "t3"]];
    const contents = new Map([
      ["t1", "Login with email"],
      ["t2", "Password reset"],
      ["t3", "Session management"],
    ]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    expect(result).toHaveLength(1);
    expect(result[0].theme).toBe("User Authentication");
    expect(result[0].suggestedName).toBe("Auth");
    expect(result[0].thoughtIds).toEqual(["t1", "t2", "t3"]);
  });

  it("handles Zo API errors gracefully", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const clusters = [["t1", "t2"]];
    const contents = new Map([
      ["t1", "Idea 1"],
      ["t2", "Idea 2"],
    ]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    // Should return cluster without theme on error
    expect(result).toHaveLength(1);
    expect(result[0].theme).toBeUndefined();
    expect(result[0].suggestedName).toBeUndefined();
    expect(result[0].thoughtIds).toEqual(["t1", "t2"]);
    expect(result[0].coherenceScore).toBe(0.5);
  });

  it("parses JSON response correctly", async () => {
    const jsonInText = `Here's the analysis:

{
  "theme": "Data Visualization",
  "name": "Charts",
  "connections": ["graphs", "reports"]
}

Hope this helps!`;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: jsonInText }),
    });

    const clusters = [["t1"]];
    const contents = new Map([["t1", "Charts and graphs"]]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    expect(result[0].theme).toBe("Data Visualization");
    expect(result[0].suggestedName).toBe("Charts");
  });

  it("falls back on malformed response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: "This is not JSON at all" }),
    });

    const clusters = [["t1", "t2"]];
    const contents = new Map([
      ["t1", "Idea 1"],
      ["t2", "Idea 2"],
    ]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    // Should return cluster without theme
    expect(result).toHaveLength(1);
    expect(result[0].theme).toBeUndefined();
    expect(result[0].thoughtIds).toEqual(["t1", "t2"]);
  });

  it("handles network timeout", async () => {
    fetchMock.mockRejectedValueOnce(new Error("AbortError"));

    const clusters = [["t1"]];
    const contents = new Map([["t1", "Test thought"]]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    expect(result).toHaveLength(1);
    expect(result[0].theme).toBeUndefined();
  });

  it("processes multiple clusters", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: JSON.stringify({ theme: "Auth", name: "Login" }),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: JSON.stringify({ theme: "Dashboard", name: "Stats" }),
        }),
      });

    const clusters = [
      ["auth1", "auth2"],
      ["dash1", "dash2"],
    ];
    const contents = new Map([
      ["auth1", "Login"],
      ["auth2", "Password"],
      ["dash1", "Charts"],
      ["dash2", "Metrics"],
    ]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    expect(result).toHaveLength(2);
    expect(result[0].theme).toBe("Auth");
    expect(result[1].theme).toBe("Dashboard");
  });

  it("handles response field variations", async () => {
    // Some APIs return 'response' instead of 'content'
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ theme: "Testing", name: "Tests" }),
      }),
    });

    const clusters = [["t1"]];
    const contents = new Map([["t1", "Test coverage"]]);

    const result = await processor.processAmbiguousClusters(clusters, contents);

    expect(result[0].theme).toBe("Testing");
  });

  it("filters missing thought contents", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ theme: "Partial", name: "Test" }),
      }),
    });

    // Only provide content for some thoughts
    const clusters = [["t1", "t2", "t3"]];
    const contents = new Map([["t1", "Available thought"]]);
    // t2 and t3 are missing

    const result = await processor.processAmbiguousClusters(clusters, contents);

    expect(result).toHaveLength(1);
    // Should still include all thought IDs in result
    expect(result[0].thoughtIds).toEqual(["t1", "t2", "t3"]);
  });
});
