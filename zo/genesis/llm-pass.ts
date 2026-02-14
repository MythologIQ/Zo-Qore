/**
 * LLM Pass Theme Extraction
 *
 * Uses Zo API to extract themes from ambiguous thought clusters.
 *
 * @module zo/genesis/llm-pass
 */

import { ClusterCandidate } from "./types";
import { THEME_EXTRACTION_PROMPT } from "./prompts";

export interface LlmPassConfig {
  /** Zo API endpoint */
  zoEndpoint: string;

  /** Request timeout (ms) */
  timeoutMs: number;

  /** Model to use */
  model: string;
}

/**
 * LLM pass for theme extraction on ambiguous clusters.
 */
export class LlmPassProcessor {
  constructor(private readonly config: LlmPassConfig) {}

  /**
   * Extract themes for ambiguous clusters using Zo API.
   */
  async processAmbiguousClusters(
    clusters: string[][],
    thoughtContents: Map<string, string>
  ): Promise<ClusterCandidate[]> {
    const results: ClusterCandidate[] = [];

    for (const thoughtIds of clusters) {
      const thoughts = thoughtIds
        .map((id) => thoughtContents.get(id))
        .filter((t): t is string => t !== undefined)
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n");

      const prompt = THEME_EXTRACTION_PROMPT.replace("{{thoughts}}", thoughts);

      try {
        const response = await this.callZo(prompt);
        const parsed = this.parseResponse(response);

        results.push({
          id: crypto.randomUUID(),
          thoughtIds,
          centroid: [], // LLM pass doesn't compute centroid
          coherenceScore: 0.5, // Unknown coherence
          theme: parsed.theme,
          suggestedName: parsed.name,
        });
      } catch {
        // Fallback: create cluster without theme
        results.push({
          id: crypto.randomUUID(),
          thoughtIds,
          centroid: [],
          coherenceScore: 0.5,
        });
      }
    }

    return results;
  }

  private async callZo(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.zoEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: this.config.model,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Zo API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        content?: string;
        response?: string;
      };
      return data.content ?? data.response ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(response: string): {
    theme?: string;
    name?: string;
    connections?: string[];
  } {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as {
          theme?: string;
          name?: string;
          connections?: string[];
        };
      }
    } catch {
      // Parse failed, return empty
    }
    return {};
  }
}
