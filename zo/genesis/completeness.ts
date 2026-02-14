/**
 * Completeness Detection
 *
 * Heuristic-based detection of when a genesis session is "complete enough"
 * to offer the reveal phase.
 *
 * @module zo/genesis/completeness
 */

import { CompletenessAssessment } from "./types";

export interface CompletenessConfig {
  /** Minimum distinct clusters for coverage */
  minClusters: number;

  /** Minimum thoughts per cluster for depth */
  minThoughtsPerCluster: number;

  /** Closure language patterns */
  closurePatterns: RegExp[];

  /** Threshold for "ready for reveal" */
  readyThreshold: number;
}

const DEFAULT_CONFIG: CompletenessConfig = {
  minClusters: 3,
  minThoughtsPerCluster: 2,
  closurePatterns: [
    /basically/i,
    /the main thing is/i,
    /in summary/i,
    /overall/i,
    /so yeah/i,
    /that's (about )?it/i,
    /i think that covers/i,
  ],
  readyThreshold: 0.65,
};

/**
 * Detects when a genesis session is "complete enough" to offer reveal.
 */
export class CompletenessDetector {
  constructor(private readonly config: CompletenessConfig = DEFAULT_CONFIG) {}

  /**
   * Assess completeness of a genesis session.
   */
  assess(
    thoughts: Array<{ id: string; content: string; timestamp: string }>,
    clusterCount: number
  ): CompletenessAssessment {
    const coverage = this.assessCoverage(clusterCount);
    const depth = this.assessDepth(thoughts, clusterCount);
    const closureLanguage = this.assessClosureLanguage(thoughts);
    const repetitionPlateau = this.assessRepetitionPlateau(thoughts);
    const explicitScope = this.assessExplicitScope(thoughts);

    // Weighted average
    const score =
      coverage * 0.25 +
      depth * 0.25 +
      closureLanguage * 0.2 +
      repetitionPlateau * 0.15 +
      explicitScope * 0.15;

    const readyForReveal = score >= this.config.readyThreshold;

    return {
      score,
      heuristics: {
        coverage,
        depth,
        closureLanguage,
        repetitionPlateau,
        explicitScope,
      },
      readyForReveal,
      summary: this.generateSummary(score, readyForReveal),
    };
  }

  private assessCoverage(clusterCount: number): number {
    // More clusters = higher coverage
    if (clusterCount >= this.config.minClusters * 2) return 1.0;
    if (clusterCount >= this.config.minClusters) return 0.7;
    if (clusterCount >= 2) return 0.4;
    if (clusterCount >= 1) return 0.2;
    return 0;
  }

  private assessDepth(
    thoughts: Array<{ content: string }>,
    clusterCount: number
  ): number {
    // Average thoughts per cluster
    if (clusterCount === 0) return 0;

    const avgPerCluster = thoughts.length / clusterCount;
    if (avgPerCluster >= this.config.minThoughtsPerCluster * 2) return 1.0;
    if (avgPerCluster >= this.config.minThoughtsPerCluster) return 0.7;
    return 0.3;
  }

  private assessClosureLanguage(
    thoughts: Array<{ content: string }>
  ): number {
    // Check recent thoughts for closure patterns
    const recentThoughts = thoughts.slice(-5);
    let closureCount = 0;

    for (const thought of recentThoughts) {
      for (const pattern of this.config.closurePatterns) {
        if (pattern.test(thought.content)) {
          closureCount++;
          break;
        }
      }
    }

    return Math.min(closureCount / 2, 1.0);
  }

  private assessRepetitionPlateau(
    thoughts: Array<{ content: string }>
  ): number {
    if (thoughts.length < 5) return 0;

    // Check if recent thoughts are similar to earlier ones
    const recentContent = thoughts.slice(-3).map((t) => t.content.toLowerCase());
    const earlierContent = thoughts
      .slice(0, -3)
      .map((t) => t.content.toLowerCase());

    let repetitions = 0;
    for (const recent of recentContent) {
      const words = recent.split(/\s+/).filter((w) => w.length > 4);
      for (const earlier of earlierContent) {
        const matches = words.filter((w) => earlier.includes(w)).length;
        if (matches >= words.length * 0.5) {
          repetitions++;
          break;
        }
      }
    }

    return Math.min(repetitions / 2, 1.0);
  }

  private assessExplicitScope(thoughts: Array<{ content: string }>): number {
    // Check for scope-defining language
    const scopePatterns = [
      /the scope is/i,
      /we're focusing on/i,
      /for this project/i,
      /the goal is/i,
      /we need to/i,
    ];

    for (const thought of thoughts) {
      for (const pattern of scopePatterns) {
        if (pattern.test(thought.content)) {
          return 0.8;
        }
      }
    }

    return 0;
  }

  private generateSummary(score: number, ready: boolean): string {
    if (ready) {
      return "Session appears complete. Ready to reveal organization.";
    }
    if (score >= 0.5) {
      return "Session is developing. A few more thoughts would help.";
    }
    if (score >= 0.25) {
      return "Session is early. Keep exploring ideas.";
    }
    return "Just getting started. Let ideas flow freely.";
  }
}
