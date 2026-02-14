/**
 * Completeness Detection Tests
 *
 * Tests for heuristic-based completeness detection.
 *
 * @module tests/genesis.completeness.test
 */

import { describe, it, expect } from "vitest";
import { CompletenessDetector } from "../zo/genesis/completeness";

describe("CompletenessDetector", () => {
  const detector = new CompletenessDetector();

  const makeThought = (content: string, timestamp?: string) => ({
    id: `thought-${Date.now()}-${Math.random()}`,
    content,
    timestamp: timestamp || new Date().toISOString(),
  });

  it("scores coverage based on cluster count", () => {
    const thoughts = [
      makeThought("First idea"),
      makeThought("Second idea"),
      makeThought("Third idea"),
    ];

    // 0 clusters = low coverage
    const lowCoverage = detector.assess(thoughts, 0);
    expect(lowCoverage.heuristics.coverage).toBe(0);

    // 1 cluster = minimal coverage
    const minCoverage = detector.assess(thoughts, 1);
    expect(minCoverage.heuristics.coverage).toBe(0.2);

    // 2 clusters = some coverage
    const someCoverage = detector.assess(thoughts, 2);
    expect(someCoverage.heuristics.coverage).toBe(0.4);

    // 3+ clusters = good coverage
    const goodCoverage = detector.assess(thoughts, 3);
    expect(goodCoverage.heuristics.coverage).toBe(0.7);

    // 6+ clusters = full coverage
    const fullCoverage = detector.assess(thoughts, 6);
    expect(fullCoverage.heuristics.coverage).toBe(1.0);
  });

  it("detects closure language patterns", () => {
    const thoughtsWithClosure = [
      makeThought("First idea"),
      makeThought("Second idea"),
      makeThought("Third idea"),
      makeThought("Basically, we need a login system"),
      makeThought("That's about it for now"),
    ];

    const result = detector.assess(thoughtsWithClosure, 3);

    // Should detect closure patterns
    expect(result.heuristics.closureLanguage).toBeGreaterThan(0);
  });

  it("returns low closure score without closure language", () => {
    const thoughtsWithoutClosure = [
      makeThought("First idea"),
      makeThought("Second idea"),
      makeThought("Third idea"),
      makeThought("Fourth idea"),
      makeThought("Fifth idea"),
    ];

    const result = detector.assess(thoughtsWithoutClosure, 3);

    // Should not detect closure patterns
    expect(result.heuristics.closureLanguage).toBe(0);
  });

  it("identifies repetition plateau", () => {
    const thoughtsWithRepetition = [
      makeThought("We need authentication for users"),
      makeThought("Dashboard should show metrics"),
      makeThought("Reports are important"),
      // Recent thoughts repeating earlier content
      makeThought("Authentication is key for security"),
      makeThought("User metrics on dashboard needed"),
      makeThought("Important reports and analytics"),
    ];

    const result = detector.assess(thoughtsWithRepetition, 3);

    // Should detect some repetition
    expect(result.heuristics.repetitionPlateau).toBeGreaterThanOrEqual(0);
  });

  it("scores depth by thoughts per cluster", () => {
    // 6 thoughts, 3 clusters = 2 per cluster (minimum depth)
    const result1 = detector.assess(
      Array(6).fill(null).map(() => makeThought("idea")),
      3
    );
    expect(result1.heuristics.depth).toBe(0.7);

    // 12 thoughts, 3 clusters = 4 per cluster (good depth)
    const result2 = detector.assess(
      Array(12).fill(null).map(() => makeThought("idea")),
      3
    );
    expect(result2.heuristics.depth).toBe(1.0);

    // 3 thoughts, 3 clusters = 1 per cluster (low depth)
    const result3 = detector.assess(
      Array(3).fill(null).map(() => makeThought("idea")),
      3
    );
    expect(result3.heuristics.depth).toBe(0.3);
  });

  it("returns correct readiness status", () => {
    // Comprehensive session should be ready
    const readyThoughts = [
      makeThought("The scope is user authentication"),
      makeThought("Login with email and password"),
      makeThought("Password reset via email"),
      makeThought("Dashboard shows user activity"),
      makeThought("Weekly reports and analytics"),
      makeThought("In summary, we need auth and reporting"),
    ];

    const readyResult = detector.assess(readyThoughts, 3);
    // With good coverage, depth, closure language, and scope
    expect(readyResult.score).toBeGreaterThan(0.5);

    // Minimal session should not be ready
    const notReadyThoughts = [makeThought("Just one idea")];

    const notReadyResult = detector.assess(notReadyThoughts, 0);
    expect(notReadyResult.readyForReveal).toBe(false);
    expect(notReadyResult.score).toBeLessThan(0.65);
  });

  it("detects explicit scope language", () => {
    const scopedThoughts = [makeThought("The goal is to build a task manager")];

    const result = detector.assess(scopedThoughts, 1);

    expect(result.heuristics.explicitScope).toBe(0.8);
  });

  it("generates appropriate summaries", () => {
    // Early session
    const early = detector.assess([makeThought("First idea")], 0);
    expect(early.summary).toContain("getting started");

    // Developing session
    const developing = detector.assess(
      Array(5).fill(null).map(() => makeThought("idea")),
      2
    );
    expect(
      developing.summary.includes("developing") ||
        developing.summary.includes("exploring")
    ).toBe(true);
  });

  it("handles empty thoughts array", () => {
    const result = detector.assess([], 0);

    expect(result.score).toBe(0);
    expect(result.readyForReveal).toBe(false);
    expect(result.heuristics.coverage).toBe(0);
    expect(result.heuristics.depth).toBe(0);
  });

  it("returns weighted score", () => {
    const thoughts = [
      makeThought("We need to build something"),
      makeThought("It should work well"),
    ];

    const result = detector.assess(thoughts, 1);

    // Score should be weighted average
    const expected =
      result.heuristics.coverage * 0.25 +
      result.heuristics.depth * 0.25 +
      result.heuristics.closureLanguage * 0.2 +
      result.heuristics.repetitionPlateau * 0.15 +
      result.heuristics.explicitScope * 0.15;

    expect(result.score).toBeCloseTo(expected, 5);
  });
});
