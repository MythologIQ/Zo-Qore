import { performance } from "perf_hooks";
import { describe, expect, it } from "vitest";
import { recommendModel } from "../zo/model-selection";

describe("Zo model selection performance", () => {
  const catalog = [
    {
      id: "zo-fast-1",
      capabilities: ["general", "fast"],
      maxInputTokens: 32000,
      maxOutputTokens: 8000,
      inputCostPer1kUsd: 0.0005,
      outputCostPer1kUsd: 0.0015,
    },
    {
      id: "zo-reasoning-1",
      capabilities: ["general", "reasoning", "coding"],
      maxInputTokens: 128000,
      maxOutputTokens: 32000,
      inputCostPer1kUsd: 0.003,
      outputCostPer1kUsd: 0.012,
    },
    {
      id: "zo-coder-1",
      capabilities: ["general", "coding"],
      maxInputTokens: 64000,
      maxOutputTokens: 16000,
      inputCostPer1kUsd: 0.0018,
      outputCostPer1kUsd: 0.006,
    },
  ];

  it("runs recommendation loop within regression budget", () => {
    const iterations = 15000;
    const prompt =
      "Generate a scoped implementation plan, estimate risk, and produce an efficient TypeScript patch strategy.";

    const start = performance.now();
    let lastModel = "";
    for (let i = 0; i < iterations; i += 1) {
      const result = recommendModel({
        content: `${prompt} #${i}`,
        mode: i % 3 === 0 ? "auto" : "suggest",
        currentModel: "zo-fast-1",
        catalog,
      });
      lastModel = result?.selectedModel ?? "";
    }
    const elapsedMs = performance.now() - start;
    expect(lastModel.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(2000);
  });
});

