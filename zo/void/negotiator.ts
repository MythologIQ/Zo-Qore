/**
 * Void Negotiator
 *
 * Manages negotiation prompts based on user activity and session state.
 * Uses Chris Voss framework for gentle, effective prompting.
 *
 * @module zo/void/negotiator
 */

import type {
  NegotiationPrompt,
  NegotiationPromptType,
  VoidConfig,
} from "./types.js";
import { DEFAULT_VOID_CONFIG } from "./types.js";
import { selectPrompt } from "./prompts.js";

/**
 * Callback when a negotiation prompt should be shown.
 */
export type PromptCallback = (prompt: NegotiationPrompt) => void;

/**
 * Manages negotiation prompts based on user activity and session state.
 */
export class VoidNegotiator {
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private thoughtCount = 0;
  private lastThoughtContent = "";
  private lastThoughtAt = 0;
  private offerDeclined = false;
  private completenessScore = 0;
  private stopped = false;

  constructor(
    private readonly config: VoidConfig = DEFAULT_VOID_CONFIG,
    private readonly onPrompt: PromptCallback
  ) {}

  /**
   * Record a new thought was added.
   */
  recordThought(content: string): void {
    this.thoughtCount++;
    this.lastThoughtContent = content;
    this.lastThoughtAt = Date.now();
    this.offerDeclined = false;
    this.resetSilenceTimer();
  }

  /**
   * Update completeness score from genesis pipeline.
   */
  updateCompleteness(score: number): void {
    this.completenessScore = Math.max(0, Math.min(1, score));
  }

  /**
   * Handle user declining the reveal offer.
   */
  handleOfferDeclined(): void {
    this.offerDeclined = true;
    this.emitPrompt("respectful_retreat");
    this.resetSilenceTimer();
  }

  /**
   * Get current thought count.
   */
  getThoughtCount(): number {
    return this.thoughtCount;
  }

  /**
   * Get current completeness score.
   */
  getCompletenessScore(): number {
    return this.completenessScore;
  }

  /**
   * Stop all timers (for cleanup).
   */
  stop(): void {
    this.stopped = true;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Reset and start the silence detection timer.
   */
  private resetSilenceTimer(): void {
    if (this.stopped) return;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(() => {
      this.handleSilence();
    }, this.config.silenceThresholdMs);
  }

  /**
   * Handle silence detection - choose and emit appropriate prompt.
   */
  private handleSilence(): void {
    if (this.stopped) return;

    // Don't prompt if recently declined
    if (this.offerDeclined) {
      this.resetSilenceTimer();
      return;
    }

    const isEarly = this.thoughtCount < this.config.minThoughtsForOffer;
    const isForming = this.completenessScore > 0.4;

    if (isEarly) {
      this.emitPrompt("calibrated_question");
    } else if (isForming) {
      this.emitPrompt("soft_offer");
    } else {
      // Use mirror or calibrated question occasionally
      const promptType = Math.random() > 0.5 ? "mirror" : "calibrated_question";
      this.emitPrompt(promptType);
    }

    this.resetSilenceTimer();
  }

  /**
   * Create and emit a negotiation prompt.
   */
  private emitPrompt(type: NegotiationPromptType): void {
    const context = {
      lastTopic: this.extractTopic(this.lastThoughtContent),
      detectedTheme: undefined,
    };

    const prompt: NegotiationPrompt = {
      id: crypto.randomUUID(),
      type,
      content: selectPrompt(type, context),
      triggeredAt: new Date().toISOString(),
      dismissed: false,
    };

    this.onPrompt(prompt);
  }

  /**
   * Extract a brief topic from thought content for mirroring.
   */
  private extractTopic(content: string): string {
    if (!content) return "that";

    // Take first few words, max 5
    const words = content.trim().split(/\s+/).slice(0, 5);
    if (words.length === 0) return "that";

    return words.join(" ") + (words.length >= 5 ? "..." : "");
  }
}
