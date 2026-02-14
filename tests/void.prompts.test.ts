/**
 * Void Prompts Tests
 *
 * Tests for negotiation prompt templates and selection.
 *
 * @module tests/void.prompts.test
 */

import { describe, it, expect } from "vitest";
import {
  NEGOTIATION_PROMPTS,
  selectPrompt,
  getPromptsByCondition,
} from "../zo/void/prompts";

describe("Void Prompts", () => {
  it("defines all negotiation prompt categories", () => {
    expect(NEGOTIATION_PROMPTS).toHaveLength(5);

    const types = NEGOTIATION_PROMPTS.map((p) => p.type);
    expect(types).toContain("calibrated_question");
    expect(types).toContain("soft_offer");
    expect(types).toContain("respectful_retreat");
    expect(types).toContain("mirror");
    expect(types).toContain("label");
  });

  it("has templates for each category", () => {
    for (const category of NEGOTIATION_PROMPTS) {
      expect(category.templates.length).toBeGreaterThan(0);
    }
  });

  it("selects a valid calibrated question", () => {
    const prompt = selectPrompt("calibrated_question");
    expect(prompt.length).toBeGreaterThan(0);

    const calibratedQuestions = NEGOTIATION_PROMPTS.find(
      (p) => p.type === "calibrated_question"
    )?.templates;
    expect(calibratedQuestions).toContain(prompt);
  });

  it("selects a valid soft offer", () => {
    const prompt = selectPrompt("soft_offer");
    expect(prompt.length).toBeGreaterThan(0);

    const softOffers = NEGOTIATION_PROMPTS.find(
      (p) => p.type === "soft_offer"
    )?.templates;
    expect(softOffers).toContain(prompt);
  });

  it("selects a valid respectful retreat", () => {
    const prompt = selectPrompt("respectful_retreat");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("interpolates mirror template with context", () => {
    const prompt = selectPrompt("mirror", { lastTopic: "authentication" });
    expect(prompt).toContain("authentication");
  });

  it("interpolates label template with context", () => {
    const prompt = selectPrompt("label", { detectedTheme: "security" });
    expect(prompt).toContain("security");
  });

  it("uses default values when context is missing", () => {
    const mirrorPrompt = selectPrompt("mirror");
    expect(mirrorPrompt).toContain("that");

    const labelPrompt = selectPrompt("label");
    expect(labelPrompt).toContain("this");
  });

  it("returns empty string for invalid type", () => {
    const prompt = selectPrompt("invalid_type" as never);
    expect(prompt).toBe("");
  });

  it("gets prompts by early_silence condition", () => {
    const earlyPrompts = getPromptsByCondition("early_silence");
    expect(earlyPrompts.length).toBeGreaterThan(0);

    const hasCalibrated = earlyPrompts.some(
      (p) => p.type === "calibrated_question"
    );
    expect(hasCalibrated).toBe(true);
  });

  it("gets prompts by forming_silence condition", () => {
    const formingPrompts = getPromptsByCondition("forming_silence");
    expect(formingPrompts.length).toBeGreaterThan(0);

    const hasSoftOffer = formingPrompts.some((p) => p.type === "soft_offer");
    expect(hasSoftOffer).toBe(true);
  });

  it("includes any-condition prompts with other conditions", () => {
    const earlyPrompts = getPromptsByCondition("early_silence");
    const hasMirror = earlyPrompts.some((p) => p.type === "mirror");
    expect(hasMirror).toBe(true);
  });
});
