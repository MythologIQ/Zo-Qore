/**
 * Enhanced tokenizer utility for prompt governance.
 * Provides token counting, cost estimation, and budget validation.
 *
 * Uses tiktoken for accurate counting when available, falls back to
 * character-based heuristics optimized for code vs prose content.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Tiktoken encoder interface for dynamic import typing */
interface TiktokenEncoder {
  encode(text: string): Uint32Array | number[];
  free?(): void;
}

/** Model cost rates per 1,000 tokens */
export interface ModelCostRates {
  input: number;
  output: number;
}

/** Token budget constraints for governance */
export interface TokenBudget {
  maxTokensPerPrompt: number;
  currentHourUsage: number;
  maxTokensPerHour: number;
}

/** Budget validation result */
export interface BudgetValidationResult {
  allowed: boolean;
  reason?: string;
  remainingPromptBudget?: number;
  remainingHourBudget?: number;
}

/** Token count result with metadata */
export interface TokenCountResult {
  count: number;
  method: "tiktoken" | "heuristic";
  model?: string;
}

// --------------------------------------------------------------------------
// Module State
// --------------------------------------------------------------------------

let encoder: TiktokenEncoder | null = null;
let encoderModel: string | null = null;
let initializationAttempted = false;

// --------------------------------------------------------------------------
// Cost Rate Configuration
// --------------------------------------------------------------------------

/**
 * Cost rates per 1,000 tokens by model.
 * Rates are approximate and should be updated as pricing changes.
 */
const MODEL_COST_RATES: Readonly<Record<string, ModelCostRates>> = {
  // OpenAI models
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4-turbo-preview": { input: 0.01, output: 0.03 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gpt-3.5-turbo-16k": { input: 0.003, output: 0.004 },

  // Anthropic models
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3.5-haiku": { input: 0.0008, output: 0.004 },

  // Default fallback
  default: { input: 0.01, output: 0.03 },
};

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------

/**
 * Initialize the tokenizer with tiktoken if available.
 * Safe to call multiple times; subsequent calls are no-ops.
 *
 * @param model - Model to use for encoding (default: "gpt-4")
 * @returns Promise resolving to true if tiktoken loaded, false otherwise
 */
export async function initTokenizer(model = "gpt-4"): Promise<boolean> {
  if (encoder !== null && encoderModel === model) {
    return true;
  }

  // Free previous encoder if switching models
  if (encoder !== null && encoderModel !== model) {
    freeEncoder();
  }

  initializationAttempted = true;

  try {
    // Dynamic import to avoid hard dependency
    // @ts-expect-error - tiktoken is optional
    const tiktoken = await import("tiktoken");

    if (typeof tiktoken.encoding_for_model === "function") {
      encoder = tiktoken.encoding_for_model(model as Parameters<typeof tiktoken.encoding_for_model>[0]);
      encoderModel = model;
      return true;
    }

    // Fallback to get_encoding if encoding_for_model unavailable
    if (typeof tiktoken.get_encoding === "function") {
      encoder = tiktoken.get_encoding("cl100k_base");
      encoderModel = model;
      return true;
    }

    console.warn("[tokenizer] tiktoken loaded but no encoding functions available");
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[tokenizer] tiktoken not available, using character estimation: ${message}`);
    return false;
  }
}

/**
 * Free the tiktoken encoder to release WASM memory.
 * Call when shutting down or switching models.
 */
export function freeEncoder(): void {
  if (encoder !== null && typeof encoder.free === "function") {
    try {
      encoder.free();
    } catch {
      // Ignore errors during cleanup
    }
  }
  encoder = null;
  encoderModel = null;
}

/**
 * Check if tiktoken is currently active.
 */
export function isUsingTiktoken(): boolean {
  return encoder !== null;
}

// --------------------------------------------------------------------------
// Token Counting
// --------------------------------------------------------------------------

/**
 * Count tokens in the given text.
 *
 * Uses tiktoken if initialized, otherwise falls back to heuristics that
 * adapt based on content type (code vs prose).
 *
 * @param text - Text to count tokens for
 * @returns Token count (minimum 1 for non-empty text, 0 for empty)
 */
export function countTokens(text: string): number {
  return countTokensWithMetadata(text).count;
}

/**
 * Count tokens with additional metadata about the counting method.
 *
 * @param text - Text to count tokens for
 * @returns Token count result with method information
 */
export function countTokensWithMetadata(text: string): TokenCountResult {
  // Handle edge cases
  if (text === null || text === undefined) {
    return { count: 0, method: "heuristic" };
  }

  const normalizedText = String(text);

  if (normalizedText.length === 0) {
    return { count: 0, method: "heuristic" };
  }

  // Use tiktoken if available
  if (encoder !== null) {
    try {
      const tokens = encoder.encode(normalizedText);
      const count = Array.isArray(tokens) ? tokens.length : tokens.length;
      return {
        count: Math.max(1, count),
        method: "tiktoken",
        model: encoderModel ?? undefined,
      };
    } catch (err) {
      // Fall through to heuristic on encoding error
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[tokenizer] tiktoken encoding failed, using heuristic: ${message}`);
    }
  }

  // Heuristic fallback with content-aware estimation
  return {
    count: estimateTokensHeuristic(normalizedText),
    method: "heuristic",
  };
}

/**
 * Estimate tokens using character-based heuristics.
 *
 * Adapts ratio based on content characteristics:
 * - Code-heavy content: ~3 chars/token (more punctuation, shorter identifiers)
 * - Prose content: ~4 chars/token (longer words, fewer special chars)
 * - Whitespace-heavy: adjusted for formatting
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
function estimateTokensHeuristic(text: string): number {
  const length = text.length;
  if (length === 0) return 0;

  // Count code-like characters
  const codeChars = text.match(/[{}[\]();:.,<>=!&|^~+\-*/%@#$\\]/g)?.length ?? 0;
  const codeRatio = codeChars / length;

  // Count whitespace for formatting-heavy content
  const whitespaceChars = text.match(/\s/g)?.length ?? 0;
  const whitespaceRatio = whitespaceChars / length;

  // Count newlines (often tokenized separately)
  const newlineCount = (text.match(/\n/g)?.length ?? 0);

  // Adaptive chars-per-token ratio
  let avgCharsPerToken: number;

  if (codeRatio > 0.15) {
    // Heavy code content
    avgCharsPerToken = 2.8;
  } else if (codeRatio > 0.08) {
    // Mixed content
    avgCharsPerToken = 3.2;
  } else if (whitespaceRatio > 0.3) {
    // Heavily formatted text
    avgCharsPerToken = 3.5;
  } else {
    // Standard prose
    avgCharsPerToken = 4.0;
  }

  // Base token estimate
  const baseTokens = length / avgCharsPerToken;

  // Add tokens for newlines (typically separate tokens)
  const newlineTokens = newlineCount * 0.5;

  return Math.max(1, Math.ceil(baseTokens + newlineTokens));
}

// --------------------------------------------------------------------------
// Cost Estimation
// --------------------------------------------------------------------------

/**
 * Estimate the cost for a given token count and model.
 *
 * @param tokenCount - Number of tokens
 * @param model - Model identifier
 * @param type - Whether tokens are input or output
 * @returns Estimated cost in USD
 */
export function estimateCost(
  tokenCount: number,
  model: string,
  type: "input" | "output",
): number {
  // Validate inputs
  if (!Number.isFinite(tokenCount) || tokenCount < 0) {
    return 0;
  }

  // Normalize model name for lookup
  const normalizedModel = normalizeModelName(model);
  const rates = MODEL_COST_RATES[normalizedModel] ?? MODEL_COST_RATES["default"];

  const rate = rates[type];
  return (tokenCount / 1000) * rate;
}

/**
 * Estimate total cost for a prompt/completion pair.
 *
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param model - Model identifier
 * @returns Total estimated cost in USD
 */
export function estimateTotalCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  return (
    estimateCost(inputTokens, model, "input") +
    estimateCost(outputTokens, model, "output")
  );
}

/**
 * Normalize model name for rate lookup.
 * Handles variations in model naming conventions.
 */
function normalizeModelName(model: string): string {
  if (!model || typeof model !== "string") {
    return "default";
  }

  const lowered = model.toLowerCase().trim();

  // Handle versioned model names (e.g., "gpt-4-0613" -> "gpt-4")
  if (lowered.startsWith("gpt-4o-mini")) return "gpt-4o-mini";
  if (lowered.startsWith("gpt-4o")) return "gpt-4o";
  if (lowered.startsWith("gpt-4-turbo")) return "gpt-4-turbo";
  if (lowered.startsWith("gpt-4-32k")) return "gpt-4";
  if (lowered.startsWith("gpt-4")) return "gpt-4";
  if (lowered.startsWith("gpt-3.5-turbo-16k")) return "gpt-3.5-turbo-16k";
  if (lowered.startsWith("gpt-3.5-turbo")) return "gpt-3.5-turbo";

  // Claude model variations
  if (lowered.includes("claude-3.5-sonnet") || lowered.includes("claude-3-5-sonnet")) {
    return "claude-3.5-sonnet";
  }
  if (lowered.includes("claude-3.5-haiku") || lowered.includes("claude-3-5-haiku")) {
    return "claude-3.5-haiku";
  }
  if (lowered.includes("claude-3-opus")) return "claude-3-opus";
  if (lowered.includes("claude-3-sonnet")) return "claude-3-sonnet";
  if (lowered.includes("claude-3-haiku")) return "claude-3-haiku";

  // Check for exact match
  if (MODEL_COST_RATES[lowered]) {
    return lowered;
  }

  return "default";
}

/**
 * Get cost rates for a specific model.
 *
 * @param model - Model identifier
 * @returns Cost rates per 1,000 tokens
 */
export function getCostRates(model: string): ModelCostRates {
  const normalizedModel = normalizeModelName(model);
  return { ...(MODEL_COST_RATES[normalizedModel] ?? MODEL_COST_RATES["default"]) };
}

/**
 * Get all available model cost rates.
 */
export function getAllCostRates(): Readonly<Record<string, ModelCostRates>> {
  return MODEL_COST_RATES;
}

// --------------------------------------------------------------------------
// Budget Validation
// --------------------------------------------------------------------------

/**
 * Check if a token count is within the specified budget constraints.
 *
 * Validates against:
 * - Per-prompt token limit
 * - Hourly token usage limit
 *
 * @param tokenCount - Number of tokens to validate
 * @param budget - Budget constraints
 * @returns Validation result with allowed status and reason if denied
 */
export function isWithinBudget(
  tokenCount: number,
  budget: TokenBudget,
): BudgetValidationResult {
  // Validate inputs
  if (!Number.isFinite(tokenCount) || tokenCount < 0) {
    return {
      allowed: false,
      reason: "Invalid token count: must be a non-negative finite number",
    };
  }

  if (!budget || typeof budget !== "object") {
    return {
      allowed: false,
      reason: "Invalid budget configuration",
    };
  }

  const {
    maxTokensPerPrompt,
    currentHourUsage,
    maxTokensPerHour,
  } = budget;

  // Validate budget fields
  if (!Number.isFinite(maxTokensPerPrompt) || maxTokensPerPrompt <= 0) {
    return {
      allowed: false,
      reason: "Invalid budget: maxTokensPerPrompt must be a positive number",
    };
  }

  if (!Number.isFinite(currentHourUsage) || currentHourUsage < 0) {
    return {
      allowed: false,
      reason: "Invalid budget: currentHourUsage must be a non-negative number",
    };
  }

  if (!Number.isFinite(maxTokensPerHour) || maxTokensPerHour <= 0) {
    return {
      allowed: false,
      reason: "Invalid budget: maxTokensPerHour must be a positive number",
    };
  }

  // Check per-prompt limit
  if (tokenCount > maxTokensPerPrompt) {
    return {
      allowed: false,
      reason: `Token count ${tokenCount} exceeds per-prompt limit of ${maxTokensPerPrompt}`,
      remainingPromptBudget: 0,
      remainingHourBudget: Math.max(0, maxTokensPerHour - currentHourUsage),
    };
  }

  // Check hourly limit
  const projectedHourUsage = currentHourUsage + tokenCount;
  if (projectedHourUsage > maxTokensPerHour) {
    return {
      allowed: false,
      reason: `Would exceed hourly limit: ${projectedHourUsage} of ${maxTokensPerHour} tokens (${currentHourUsage} already used)`,
      remainingPromptBudget: maxTokensPerPrompt - tokenCount,
      remainingHourBudget: Math.max(0, maxTokensPerHour - currentHourUsage),
    };
  }

  // All checks passed
  return {
    allowed: true,
    remainingPromptBudget: maxTokensPerPrompt - tokenCount,
    remainingHourBudget: maxTokensPerHour - projectedHourUsage,
  };
}

/**
 * Calculate remaining budget capacity.
 *
 * @param budget - Current budget state
 * @returns Maximum tokens that can still be used
 */
export function getRemainingBudget(budget: TokenBudget): number {
  if (!budget || typeof budget !== "object") {
    return 0;
  }

  const {
    maxTokensPerPrompt,
    currentHourUsage,
    maxTokensPerHour,
  } = budget;

  if (
    !Number.isFinite(maxTokensPerPrompt) ||
    !Number.isFinite(currentHourUsage) ||
    !Number.isFinite(maxTokensPerHour)
  ) {
    return 0;
  }

  const remainingHourly = Math.max(0, maxTokensPerHour - currentHourUsage);
  return Math.min(maxTokensPerPrompt, remainingHourly);
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Format a token count for display.
 *
 * @param count - Token count
 * @returns Formatted string (e.g., "1,234 tokens" or "1.2K tokens")
 */
export function formatTokenCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) {
    return "0 tokens";
  }

  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M tokens`;
  }

  if (count >= 10_000) {
    return `${(count / 1_000).toFixed(1)}K tokens`;
  }

  return `${count.toLocaleString()} tokens`;
}

/**
 * Format a cost for display.
 *
 * @param cost - Cost in USD
 * @returns Formatted string (e.g., "$0.0012" or "$1.23")
 */
export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost < 0) {
    return "$0.00";
  }

  if (cost === 0) {
    return "$0.00";
  }

  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }

  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }

  return `$${cost.toFixed(2)}`;
}
