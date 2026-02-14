/**
 * Void UI Types
 *
 * Interfaces for the creative capture layer.
 *
 * @module zo/void/types
 */

/**
 * Current mode of the void component.
 * - genesis: Initial unstructured capture
 * - living: Connected view with soft connections
 */
export type VoidMode = "genesis" | "living";

/**
 * State of the void capture session.
 */
export type VoidState = "idle" | "capturing" | "offer_pending" | "revealing";

/**
 * Negotiation prompt types based on Chris Voss framework.
 */
export type NegotiationPromptType =
  | "calibrated_question"
  | "soft_offer"
  | "respectful_retreat"
  | "mirror"
  | "label";

/**
 * A negotiation prompt to display.
 */
export interface NegotiationPrompt {
  id: string;
  type: NegotiationPromptType;
  content: string;
  triggeredAt: string;
  dismissed: boolean;
}

/**
 * Void session state for UI rendering.
 */
export interface VoidSessionState {
  sessionId: string;
  projectId: string;
  mode: VoidMode;
  state: VoidState;
  thoughtCount: number;
  lastActivityAt: string;
  activePrompt: NegotiationPrompt | null;
  completenessScore: number;
  readyForReveal: boolean;
}

/**
 * Configuration for void behavior.
 */
export interface VoidConfig {
  /** Silence duration before negotiation prompt (ms) */
  silenceThresholdMs: number;
  /** Minimum thoughts before offering reveal */
  minThoughtsForOffer: number;
  /** Enable soft connection indicators in living mode */
  showSoftConnections: boolean;
}

/**
 * Events emitted by the void component.
 */
export type VoidEvent =
  | { type: "thought_submitted"; thoughtId: string; content: string }
  | { type: "silence_detected"; durationMs: number }
  | { type: "prompt_shown"; prompt: NegotiationPrompt }
  | { type: "prompt_dismissed" }
  | { type: "offer_accepted" }
  | { type: "offer_declined" }
  | { type: "mode_changed"; mode: VoidMode }
  | { type: "session_done" };

/**
 * Callback for void events.
 */
export type VoidEventHandler = (event: VoidEvent) => void;

/**
 * Default void configuration.
 */
export const DEFAULT_VOID_CONFIG: VoidConfig = {
  silenceThresholdMs: 5000,
  minThoughtsForOffer: 3,
  showSoftConnections: true,
};
