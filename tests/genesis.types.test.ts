/**
 * Genesis Types Tests
 *
 * Tests for type validation and default config values.
 *
 * @module tests/genesis.types.test
 */

import { describe, it, expect } from "vitest";
import type {
  ClusteringResult,
  ClusterCandidate,
  ClusteringConfig,
  CompletenessAssessment,
  GenesisEvent,
} from "../zo/genesis/types";

describe("Genesis Types", () => {
  it("validates ClusteringResult structure", () => {
    const result: ClusteringResult = {
      clusters: [],
      outliers: [],
      processingTimeMs: 100,
      usedLlmPass: false,
    };

    expect(result.clusters).toBeInstanceOf(Array);
    expect(result.outliers).toBeInstanceOf(Array);
    expect(typeof result.processingTimeMs).toBe("number");
    expect(typeof result.usedLlmPass).toBe("boolean");
  });

  it("validates ClusterCandidate structure", () => {
    const candidate: ClusterCandidate = {
      id: "test-id",
      thoughtIds: ["t1", "t2"],
      centroid: [0.1, 0.2, 0.3],
      coherenceScore: 0.85,
    };

    expect(candidate.id).toBe("test-id");
    expect(candidate.thoughtIds).toHaveLength(2);
    expect(candidate.centroid).toHaveLength(3);
    expect(candidate.coherenceScore).toBe(0.85);
  });

  it("validates ClusterCandidate with optional fields", () => {
    const candidate: ClusterCandidate = {
      id: "test-id",
      thoughtIds: ["t1"],
      centroid: [],
      coherenceScore: 0.5,
      theme: "User Authentication",
      suggestedName: "Auth",
    };

    expect(candidate.theme).toBe("User Authentication");
    expect(candidate.suggestedName).toBe("Auth");
  });

  it("validates ClusteringConfig structure", () => {
    const config: ClusteringConfig = {
      similarityThreshold: 0.75,
      maxClusterSize: 15,
      minClusterSize: 2,
      ambiguityThreshold: 0.15,
    };

    expect(config.similarityThreshold).toBeGreaterThan(0);
    expect(config.similarityThreshold).toBeLessThanOrEqual(1);
    expect(config.maxClusterSize).toBeGreaterThan(config.minClusterSize);
    expect(config.ambiguityThreshold).toBeGreaterThan(0);
  });

  it("validates CompletenessAssessment structure", () => {
    const assessment: CompletenessAssessment = {
      score: 0.75,
      heuristics: {
        coverage: 0.8,
        depth: 0.7,
        closureLanguage: 0.6,
        repetitionPlateau: 0.5,
        explicitScope: 0.4,
      },
      readyForReveal: true,
      summary: "Session appears complete.",
    };

    expect(assessment.score).toBe(0.75);
    expect(assessment.heuristics.coverage).toBe(0.8);
    expect(assessment.readyForReveal).toBe(true);
    expect(typeof assessment.summary).toBe("string");
  });

  it("validates GenesisEvent union types", () => {
    const events: GenesisEvent[] = [
      { type: "thought_added", thoughtId: "t1" },
      { type: "clustering_started" },
      {
        type: "clustering_completed",
        result: {
          clusters: [],
          outliers: [],
          processingTimeMs: 50,
          usedLlmPass: false,
        },
      },
      {
        type: "completeness_updated",
        assessment: {
          score: 0.5,
          heuristics: {
            coverage: 0.5,
            depth: 0.5,
            closureLanguage: 0.5,
            repetitionPlateau: 0.5,
            explicitScope: 0.5,
          },
          readyForReveal: false,
          summary: "Developing",
        },
      },
      { type: "ready_for_reveal" },
    ];

    expect(events).toHaveLength(5);
    expect(events[0].type).toBe("thought_added");
    expect(events[1].type).toBe("clustering_started");
    expect(events[2].type).toBe("clustering_completed");
    expect(events[3].type).toBe("completeness_updated");
    expect(events[4].type).toBe("ready_for_reveal");
  });
});
