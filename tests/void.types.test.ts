/**
 * Void Types Tests
 *
 * Tests for type validation and default config values.
 *
 * @module tests/void.types.test
 */

import { describe, it, expect } from "vitest";
import type {
  VoidMode,
  VoidState,
  NegotiationPromptType,
  NegotiationPrompt,
  VoidSessionState,
  VoidConfig,
  VoidEvent,
} from "../zo/void/types";
import { DEFAULT_VOID_CONFIG } from "../zo/void/types";

describe("Void Types", () => {
  it("validates VoidMode type values", () => {
    const modes: VoidMode[] = ["genesis", "living"];
    expect(modes).toHaveLength(2);
    expect(modes).toContain("genesis");
    expect(modes).toContain("living");
  });

  it("validates VoidState type values", () => {
    const states: VoidState[] = ["idle", "capturing", "offer_pending", "revealing"];
    expect(states).toHaveLength(4);
  });

  it("validates NegotiationPromptType values", () => {
    const types: NegotiationPromptType[] = [
      "calibrated_question",
      "soft_offer",
      "respectful_retreat",
      "mirror",
      "label",
    ];
    expect(types).toHaveLength(5);
  });

  it("validates NegotiationPrompt structure", () => {
    const prompt: NegotiationPrompt = {
      id: "prompt-1",
      type: "calibrated_question",
      content: "What else is rattling around?",
      triggeredAt: new Date().toISOString(),
      dismissed: false,
    };

    expect(prompt.id).toBe("prompt-1");
    expect(prompt.type).toBe("calibrated_question");
    expect(prompt.content).toBeTruthy();
    expect(prompt.dismissed).toBe(false);
  });

  it("validates VoidSessionState structure", () => {
    const state: VoidSessionState = {
      sessionId: "session-1",
      projectId: "project-1",
      mode: "genesis",
      state: "capturing",
      thoughtCount: 5,
      lastActivityAt: new Date().toISOString(),
      activePrompt: null,
      completenessScore: 0.4,
      readyForReveal: false,
    };

    expect(state.sessionId).toBe("session-1");
    expect(state.mode).toBe("genesis");
    expect(state.thoughtCount).toBe(5);
    expect(state.readyForReveal).toBe(false);
  });

  it("validates VoidConfig structure", () => {
    const config: VoidConfig = {
      silenceThresholdMs: 5000,
      minThoughtsForOffer: 3,
      showSoftConnections: true,
    };

    expect(config.silenceThresholdMs).toBe(5000);
    expect(config.minThoughtsForOffer).toBe(3);
    expect(config.showSoftConnections).toBe(true);
  });

  it("provides sensible default config", () => {
    expect(DEFAULT_VOID_CONFIG.silenceThresholdMs).toBe(5000);
    expect(DEFAULT_VOID_CONFIG.minThoughtsForOffer).toBe(3);
    expect(DEFAULT_VOID_CONFIG.showSoftConnections).toBe(true);
  });

  it("validates VoidEvent discriminated union", () => {
    const events: VoidEvent[] = [
      { type: "thought_submitted", thoughtId: "t1", content: "test" },
      { type: "silence_detected", durationMs: 5000 },
      {
        type: "prompt_shown",
        prompt: {
          id: "p1",
          type: "calibrated_question",
          content: "test",
          triggeredAt: new Date().toISOString(),
          dismissed: false,
        },
      },
      { type: "prompt_dismissed" },
      { type: "offer_accepted" },
      { type: "offer_declined" },
      { type: "mode_changed", mode: "living" },
      { type: "session_done" },
    ];

    expect(events).toHaveLength(8);
    expect(events[0].type).toBe("thought_submitted");
    expect(events[6].type).toBe("mode_changed");
  });
});
