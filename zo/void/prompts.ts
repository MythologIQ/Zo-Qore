/**
 * Negotiation Prompt Templates
 *
 * Based on Chris Voss's "Never Split the Difference" framework.
 *
 * @module zo/void/prompts
 */

import type { NegotiationPromptType } from "./types.js";

/**
 * Template for a negotiation prompt category.
 */
export interface PromptTemplate {
  type: NegotiationPromptType;
  templates: string[];
  condition: "early_silence" | "forming_silence" | "decline" | "any";
}

/**
 * All negotiation prompt templates.
 */
export const NEGOTIATION_PROMPTS: PromptTemplate[] = [
  {
    type: "calibrated_question",
    condition: "early_silence",
    templates: [
      "What else is rattling around?",
      "What's on your mind?",
      "What else feels important here?",
      "What would make this clearer?",
    ],
  },
  {
    type: "soft_offer",
    condition: "forming_silence",
    templates: [
      "I'm seeing some shape here. Want to take a look?",
      "Some themes are emerging. Shall we peek?",
      "Structure is forming. Ready to see it?",
    ],
  },
  {
    type: "respectful_retreat",
    condition: "decline",
    templates: ["Got it. Keep going.", "No problem. I'm listening.", "Take your time."],
  },
  {
    type: "mirror",
    condition: "any",
    templates: ["So you're thinking about {last_topic}...", "{last_topic}... tell me more."],
  },
  {
    type: "label",
    condition: "any",
    templates: [
      "It sounds like {detected_theme} is important here.",
      "Seems like {detected_theme} is a key concern.",
    ],
  },
];

/**
 * Context for prompt template interpolation.
 */
export interface PromptContext {
  lastTopic?: string;
  detectedTheme?: string;
}

/**
 * Select a random prompt of the given type and interpolate context.
 */
export function selectPrompt(type: NegotiationPromptType, context?: PromptContext): string {
  const category = NEGOTIATION_PROMPTS.find((p) => p.type === type);
  if (!category) return "";

  const templateIdx = Math.floor(Math.random() * category.templates.length);
  const template = category.templates[templateIdx];

  return template
    .replace("{last_topic}", context?.lastTopic ?? "that")
    .replace("{detected_theme}", context?.detectedTheme ?? "this");
}

/**
 * Get prompts matching a condition.
 */
export function getPromptsByCondition(
  condition: PromptTemplate["condition"]
): PromptTemplate[] {
  return NEGOTIATION_PROMPTS.filter(
    (p) => p.condition === condition || p.condition === "any"
  );
}
