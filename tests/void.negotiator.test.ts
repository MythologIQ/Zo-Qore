/**
 * Void Negotiator Tests
 *
 * Tests for negotiation prompt timing and selection.
 *
 * @module tests/void.negotiator.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VoidNegotiator } from "../zo/void/negotiator";
import type { NegotiationPrompt, VoidConfig } from "../zo/void/types";

describe("VoidNegotiator", () => {
  let capturedPrompts: NegotiationPrompt[];
  let negotiator: VoidNegotiator;

  const testConfig: VoidConfig = {
    silenceThresholdMs: 100, // Short for testing
    minThoughtsForOffer: 3,
    showSoftConnections: true,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    capturedPrompts = [];
    negotiator = new VoidNegotiator(testConfig, (prompt) => {
      capturedPrompts.push(prompt);
    });
  });

  afterEach(() => {
    negotiator.stop();
    vi.useRealTimers();
  });

  it("emits calibrated question after silence in early session", () => {
    // Add 1 thought (below minThoughtsForOffer)
    negotiator.recordThought("First thought");

    // Advance past silence threshold
    vi.advanceTimersByTime(150);

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0].type).toBe("calibrated_question");
  });

  it("emits soft offer when completeness is high", () => {
    // Add 3 thoughts to reach minimum
    negotiator.recordThought("First");
    negotiator.recordThought("Second");
    negotiator.recordThought("Third");

    // Set high completeness score
    negotiator.updateCompleteness(0.5);

    // Advance past silence threshold
    vi.advanceTimersByTime(150);

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0].type).toBe("soft_offer");
  });

  it("emits respectful retreat on offer decline", () => {
    negotiator.handleOfferDeclined();

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0].type).toBe("respectful_retreat");
  });

  it("resets silence timer on new thought", () => {
    negotiator.recordThought("First");

    // Advance partially
    vi.advanceTimersByTime(50);

    // Add another thought before timeout
    negotiator.recordThought("Second");

    // Advance past original threshold
    vi.advanceTimersByTime(60);

    // Should not have emitted yet
    expect(capturedPrompts).toHaveLength(0);

    // Advance to new threshold
    vi.advanceTimersByTime(50);

    // Now should emit
    expect(capturedPrompts).toHaveLength(1);
  });

  it("does not emit prompt after decline until new thought", () => {
    negotiator.recordThought("First");
    vi.advanceTimersByTime(150);
    expect(capturedPrompts).toHaveLength(1);

    // Decline
    negotiator.handleOfferDeclined();
    expect(capturedPrompts).toHaveLength(2);

    // Wait for another silence
    vi.advanceTimersByTime(150);

    // Should not emit (offerDeclined flag set)
    expect(capturedPrompts).toHaveLength(2);

    // Record new thought to reset flag
    negotiator.recordThought("New thought");
    vi.advanceTimersByTime(150);

    // Now should emit
    expect(capturedPrompts).toHaveLength(3);
  });

  it("tracks thought count correctly", () => {
    expect(negotiator.getThoughtCount()).toBe(0);

    negotiator.recordThought("One");
    expect(negotiator.getThoughtCount()).toBe(1);

    negotiator.recordThought("Two");
    expect(negotiator.getThoughtCount()).toBe(2);
  });

  it("tracks completeness score correctly", () => {
    expect(negotiator.getCompletenessScore()).toBe(0);

    negotiator.updateCompleteness(0.5);
    expect(negotiator.getCompletenessScore()).toBe(0.5);

    // Clamps to max 1
    negotiator.updateCompleteness(1.5);
    expect(negotiator.getCompletenessScore()).toBe(1);

    // Clamps to min 0
    negotiator.updateCompleteness(-0.5);
    expect(negotiator.getCompletenessScore()).toBe(0);
  });

  it("stops timers on stop()", () => {
    negotiator.recordThought("First");
    negotiator.stop();

    // Advance past threshold
    vi.advanceTimersByTime(150);

    // Should not emit
    expect(capturedPrompts).toHaveLength(0);
  });

  it("does not start timer after stop()", () => {
    negotiator.stop();
    negotiator.recordThought("After stop");

    vi.advanceTimersByTime(150);

    // Should not emit
    expect(capturedPrompts).toHaveLength(0);
  });
});
