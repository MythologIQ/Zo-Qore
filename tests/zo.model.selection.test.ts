import { describe, expect, it } from "vitest";
import { recommendModel, resolveCatalog } from "../zo/model-selection";

describe("Zo model selection", () => {
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
  ];

  it("recommends reasoning model for architecture-heavy prompts", () => {
    const result = recommendModel({
      content: "Create an adversarial architecture plan and policy governance model.",
      mode: "suggest",
      catalog,
    });
    expect(result?.recommendedModel).toBe("zo-reasoning-1");
    expect(result?.selectedModel).toBe("zo-reasoning-1");
    expect(result?.estimatedCostUsd).toBeGreaterThan(0);
    expect(result?.costSavedUsd).toBeGreaterThanOrEqual(0);
    expect(result?.costSavedPercent).toBeGreaterThanOrEqual(0);
  });

  it("returns auto warning for auto mode", () => {
    const result = recommendModel({
      content: "Summarize changelog quickly.",
      mode: "auto",
      catalog,
    });
    expect(result?.warning).toContain("Auto model selection");
  });

  it("parses catalog from environment JSON", () => {
    const parsed = resolveCatalog(
      undefined,
      JSON.stringify([
        {
          id: "zo-fast-1",
          capabilities: ["general", "fast"],
          maxInputTokens: 32000,
          maxOutputTokens: 8000,
          inputCostPer1kUsd: 0.0005,
          outputCostPer1kUsd: 0.0015,
        },
      ]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("zo-fast-1");
  });

  it("keeps selected model in suggest mode while still reporting recommendation", () => {
    const result = recommendModel({
      content: "Summarize changelog quickly.",
      mode: "suggest",
      currentModel: "zo-fast-1",
      catalog,
    });
    expect(result?.selectedModel).toBe("zo-fast-1");
    expect(result?.recommendedModel).toBeTruthy();
  });
});
