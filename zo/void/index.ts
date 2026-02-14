/**
 * Void UI Module
 *
 * Creative capture layer with negotiation-based prompting.
 *
 * @module zo/void
 */

export type {
  VoidMode,
  VoidState,
  NegotiationPromptType,
  NegotiationPrompt,
  VoidSessionState,
  VoidConfig,
  VoidEvent,
  VoidEventHandler,
} from "./types.js";

export { DEFAULT_VOID_CONFIG } from "./types.js";
export { VoidNegotiator } from "./negotiator.js";
export { VoidManager } from "./manager.js";
export { NEGOTIATION_PROMPTS, selectPrompt } from "./prompts.js";
