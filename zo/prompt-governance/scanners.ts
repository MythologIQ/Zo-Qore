/**
 * Prompt Governance Scanners
 *
 * This module provides scanner functions for detecting prompt injection,
 * jailbreak attempts, sensitive data, and enforcing usage policies.
 */

import {
  INJECTION_PATTERNS,
  JAILBREAK_PATTERNS,
  SENSITIVE_PATTERNS,
  PATTERN_WEIGHTS,
  type InjectionPatternCategory,
  type JailbreakPatternCategory,
  type SensitivePatternType,
} from './patterns';

// ============================================================================
// Types
// ============================================================================

export interface ScanResult {
  /** Whether any pattern was detected */
  detected: boolean;
  /** Risk score from 0.0 to 1.0 */
  score: number;
  /** Matched pattern strings or excerpts */
  matches: string[];
  /** Human-readable explanation */
  reason?: string;
}

export interface SensitiveDataMatch {
  /** Type of sensitive data detected */
  type: SensitivePatternType;
  /** Character position in the input */
  position: number;
  /** Redacted version of the match */
  redacted: string;
}

export interface SensitiveDataResult {
  /** Whether any sensitive data was detected */
  detected: boolean;
  /** Types of sensitive data found */
  types: SensitivePatternType[];
  /** Detailed match information */
  matches: SensitiveDataMatch[];
}

export interface TokenBudget {
  /** Maximum tokens allowed per prompt */
  maxTokensPerPrompt: number;
  /** Maximum tokens allowed per session */
  maxTokensPerSession?: number;
  /** Current session token count */
  sessionTokenCount?: number;
}

export interface TokenBudgetResult {
  /** Whether the prompt is within budget */
  allowed: boolean;
  /** Estimated token count */
  tokenCount: number;
  /** Explanation if not allowed */
  reason?: string;
}

export interface RateLimits {
  /** Maximum prompts per minute */
  promptsPerMinute: number;
  /** Maximum prompts per hour */
  promptsPerHour: number;
  /** Maximum prompts per day */
  promptsPerDay?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Seconds until rate limit resets */
  retryAfterSeconds?: number;
  /** Explanation if not allowed */
  reason?: string;
}

export interface TopicRestrictionPolicy {
  /** List of blocked topics */
  blockedTopics: string[];
  /** Optional patterns for blocked topics */
  blockedPatterns?: RegExp[];
  /** Allowed topics (whitelist mode) */
  allowedTopics?: string[];
  /** Whether to use strict matching */
  strictMode?: boolean;
}

export interface TopicRestrictionResult {
  /** Whether the prompt passes topic restrictions */
  allowed: boolean;
  /** Topics that were blocked */
  blockedTopics: string[];
  /** Explanation if not allowed */
  reason?: string;
}

export type ScanLevel = 'strict' | 'standard' | 'permissive';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalizes text for pattern matching by converting to lowercase
 * and normalizing whitespace.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extracts a context snippet around a match position.
 */
function extractContext(text: string, position: number, length: number, contextSize: number = 20): string {
  const start = Math.max(0, position - contextSize);
  const end = Math.min(text.length, position + length + contextSize);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Redacts a match by replacing characters with asterisks,
 * preserving first and last characters for identification.
 */
function redactMatch(match: string): string {
  if (match.length <= 4) {
    return '*'.repeat(match.length);
  }
  const visible = Math.min(2, Math.floor(match.length / 4));
  return match.slice(0, visible) + '*'.repeat(match.length - visible * 2) + match.slice(-visible);
}

/**
 * Estimates token count using a simple heuristic.
 * This is an approximation; for production use, integrate a proper tokenizer.
 */
function estimateTokenCount(text: string): number {
  // Simple heuristic: ~4 characters per token for English text
  // This accounts for spaces, punctuation, and common patterns
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  // Use a weighted average of character-based and word-based estimates
  const charBasedEstimate = Math.ceil(charCount / 4);
  const wordBasedEstimate = Math.ceil(wordCount * 1.3);

  return Math.ceil((charBasedEstimate + wordBasedEstimate) / 2);
}

/**
 * Gets threshold values based on scan level.
 */
function getLevelThresholds(level: ScanLevel): { scoreThreshold: number; matchThreshold: number } {
  switch (level) {
    case 'strict':
      return { scoreThreshold: 0.3, matchThreshold: 1 };
    case 'standard':
      return { scoreThreshold: 0.5, matchThreshold: 2 };
    case 'permissive':
      return { scoreThreshold: 0.7, matchThreshold: 3 };
  }
}

// ============================================================================
// Scanner Functions
// ============================================================================

/**
 * Scans a prompt for injection attack patterns.
 *
 * @param prompt - The prompt text to scan
 * @param level - Sensitivity level: 'strict', 'standard', or 'permissive'
 * @returns Scan result with detection status, score, and matches
 */
export function scanForInjection(prompt: string, level: ScanLevel = 'standard'): ScanResult {
  const matches: string[] = [];
  let totalScore = 0;
  let maxScore = 0;
  const normalizedPrompt = normalizeText(prompt);

  const thresholds = getLevelThresholds(level);
  const categories: InjectionPatternCategory[] = ['delimiterAttack', 'instructionOverride', 'unicodeHomoglyph'];

  for (const category of categories) {
    const patterns = INJECTION_PATTERNS[category];
    const weight = PATTERN_WEIGHTS.injection[category];

    for (const pattern of patterns) {
      // Reset regex state for global patterns
      if (pattern.global) {
        pattern.lastIndex = 0;
      }

      const textToSearch = category === 'unicodeHomoglyph' ? prompt : normalizedPrompt;
      const patternMatches = textToSearch.match(pattern);

      if (patternMatches) {
        for (const match of patternMatches) {
          matches.push(`[${category}] ${match}`);
          totalScore += weight;
          maxScore = Math.max(maxScore, weight);
        }
      }
    }
  }

  // Normalize score to 0-1 range
  const normalizedScore = Math.min(1, totalScore / 3);

  const detected =
    normalizedScore >= thresholds.scoreThreshold || matches.length >= thresholds.matchThreshold;

  let reason: string | undefined;
  if (detected) {
    const categoryBreakdown = categories
      .filter(cat => matches.some(m => m.startsWith(`[${cat}]`)))
      .join(', ');
    reason = `Injection patterns detected: ${categoryBreakdown}. Found ${matches.length} suspicious pattern(s).`;
  }

  return {
    detected,
    score: normalizedScore,
    matches,
    reason,
  };
}

/**
 * Scans a prompt for jailbreak attempt patterns.
 *
 * @param prompt - The prompt text to scan
 * @param customPatterns - Additional patterns to check (as regex strings)
 * @returns Scan result with detection status, score, and matches
 */
export function scanForJailbreak(prompt: string, customPatterns?: string[]): ScanResult {
  const matches: string[] = [];
  let totalScore = 0;
  let maxScore = 0;
  const normalizedPrompt = normalizeText(prompt);

  const categories: JailbreakPatternCategory[] = ['roleplayOverride', 'hypotheticalFraming', 'knownTemplates'];

  for (const category of categories) {
    const patterns = JAILBREAK_PATTERNS[category];
    const weight = PATTERN_WEIGHTS.jailbreak[category];

    for (const pattern of patterns) {
      // Reset regex state for global patterns
      if (pattern.global) {
        pattern.lastIndex = 0;
      }

      const patternMatches = normalizedPrompt.match(pattern);

      if (patternMatches) {
        for (const match of patternMatches) {
          matches.push(`[${category}] ${match}`);
          totalScore += weight;
          maxScore = Math.max(maxScore, weight);
        }
      }
    }
  }

  // Check custom patterns
  if (customPatterns && customPatterns.length > 0) {
    for (const patternStr of customPatterns) {
      try {
        const customRegex = new RegExp(patternStr, 'gi');
        const customMatches = normalizedPrompt.match(customRegex);

        if (customMatches) {
          for (const match of customMatches) {
            matches.push(`[custom] ${match}`);
            totalScore += 0.8; // High weight for custom patterns
          }
        }
      } catch {
        // Invalid regex pattern, skip
        console.warn(`Invalid custom pattern: ${patternStr}`);
      }
    }
  }

  // Normalize score to 0-1 range
  const normalizedScore = Math.min(1, totalScore / 2);

  const detected = normalizedScore >= 0.4 || matches.length >= 2;

  let reason: string | undefined;
  if (detected) {
    const categoryBreakdown = categories
      .filter(cat => matches.some(m => m.startsWith(`[${cat}]`)))
      .join(', ');
    reason = `Jailbreak patterns detected: ${categoryBreakdown || 'custom patterns'}. Found ${matches.length} suspicious pattern(s).`;
  }

  return {
    detected,
    score: normalizedScore,
    matches,
    reason,
  };
}

/**
 * Scans a prompt for sensitive data (PII, secrets, credentials).
 *
 * @param prompt - The prompt text to scan
 * @returns Detection result with types found and redacted matches
 */
export function scanForSensitiveData(prompt: string): SensitiveDataResult {
  const typesFound: Set<SensitivePatternType> = new Set();
  const matches: SensitiveDataMatch[] = [];

  const patternTypes = Object.keys(SENSITIVE_PATTERNS) as SensitivePatternType[];

  for (const type of patternTypes) {
    const pattern = SENSITIVE_PATTERNS[type];

    // Reset regex state for global patterns
    if (pattern.global) {
      pattern.lastIndex = 0;
    }

    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(prompt)) !== null) {
      typesFound.add(type);
      matches.push({
        type,
        position: match.index,
        redacted: redactMatch(match[0]),
      });

      // Prevent infinite loop for zero-length matches
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return {
    detected: matches.length > 0,
    types: Array.from(typesFound),
    matches,
  };
}

/**
 * Checks if a prompt is within the allowed token budget.
 *
 * @param prompt - The prompt text to check
 * @param budget - Token budget configuration
 * @returns Whether the prompt is allowed and token count
 */
export function checkTokenBudget(prompt: string, budget: TokenBudget): TokenBudgetResult {
  const tokenCount = estimateTokenCount(prompt);

  // Check per-prompt limit
  if (tokenCount > budget.maxTokensPerPrompt) {
    return {
      allowed: false,
      tokenCount,
      reason: `Prompt exceeds maximum token limit. Estimated ${tokenCount} tokens, limit is ${budget.maxTokensPerPrompt}.`,
    };
  }

  // Check session limit if applicable
  if (
    budget.maxTokensPerSession !== undefined &&
    budget.sessionTokenCount !== undefined
  ) {
    const projectedSessionTotal = budget.sessionTokenCount + tokenCount;
    if (projectedSessionTotal > budget.maxTokensPerSession) {
      return {
        allowed: false,
        tokenCount,
        reason: `Session token budget exceeded. Adding ${tokenCount} tokens would bring session total to ${projectedSessionTotal}, limit is ${budget.maxTokensPerSession}.`,
      };
    }
  }

  return {
    allowed: true,
    tokenCount,
  };
}

/**
 * Checks if a request is within rate limits.
 *
 * @param actorId - Identifier for the requesting actor
 * @param limits - Rate limit configuration
 * @param recentPrompts - Timestamps of recent prompts by this actor
 * @returns Whether the request is allowed and retry timing
 */
export function checkRateLimit(
  actorId: string,
  limits: RateLimits,
  recentPrompts: Date[]
): RateLimitResult {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Count prompts in each window
  const promptsInLastMinute = recentPrompts.filter(d => d >= oneMinuteAgo).length;
  const promptsInLastHour = recentPrompts.filter(d => d >= oneHourAgo).length;
  const promptsInLastDay = recentPrompts.filter(d => d >= oneDayAgo).length;

  // Check per-minute limit
  if (promptsInLastMinute >= limits.promptsPerMinute) {
    // Find when the oldest relevant prompt will expire
    const relevantPrompts = recentPrompts
      .filter(d => d >= oneMinuteAgo)
      .sort((a, b) => a.getTime() - b.getTime());

    const oldestRelevant = relevantPrompts[0];
    const retryAfter = Math.ceil((oldestRelevant.getTime() + 60 * 1000 - now.getTime()) / 1000);

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfter),
      reason: `Rate limit exceeded: ${promptsInLastMinute}/${limits.promptsPerMinute} prompts per minute for actor ${actorId}.`,
    };
  }

  // Check per-hour limit
  if (promptsInLastHour >= limits.promptsPerHour) {
    const relevantPrompts = recentPrompts
      .filter(d => d >= oneHourAgo)
      .sort((a, b) => a.getTime() - b.getTime());

    const oldestRelevant = relevantPrompts[0];
    const retryAfter = Math.ceil((oldestRelevant.getTime() + 60 * 60 * 1000 - now.getTime()) / 1000);

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfter),
      reason: `Rate limit exceeded: ${promptsInLastHour}/${limits.promptsPerHour} prompts per hour for actor ${actorId}.`,
    };
  }

  // Check per-day limit if specified
  if (limits.promptsPerDay !== undefined && promptsInLastDay >= limits.promptsPerDay) {
    const relevantPrompts = recentPrompts
      .filter(d => d >= oneDayAgo)
      .sort((a, b) => a.getTime() - b.getTime());

    const oldestRelevant = relevantPrompts[0];
    const retryAfter = Math.ceil((oldestRelevant.getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 1000);

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfter),
      reason: `Rate limit exceeded: ${promptsInLastDay}/${limits.promptsPerDay} prompts per day for actor ${actorId}.`,
    };
  }

  return {
    allowed: true,
  };
}

/**
 * Scans a prompt for topic restrictions.
 *
 * @param prompt - The prompt text to scan
 * @param policy - Topic restriction policy configuration
 * @returns Whether the prompt passes topic restrictions
 */
export function scanForTopicRestrictions(
  prompt: string,
  policy: TopicRestrictionPolicy
): TopicRestrictionResult {
  const normalizedPrompt = normalizeText(prompt);
  const blockedTopicsFound: string[] = [];

  // Check blocked topics (string matching)
  for (const topic of policy.blockedTopics) {
    const topicPattern = policy.strictMode
      ? new RegExp(`\\b${escapeRegex(topic)}\\b`, 'gi')
      : new RegExp(escapeRegex(topic), 'gi');

    if (topicPattern.test(normalizedPrompt)) {
      blockedTopicsFound.push(topic);
    }
  }

  // Check blocked patterns (regex matching)
  if (policy.blockedPatterns) {
    for (const pattern of policy.blockedPatterns) {
      // Reset regex state
      if (pattern.global) {
        pattern.lastIndex = 0;
      }

      if (pattern.test(normalizedPrompt)) {
        blockedTopicsFound.push(`[pattern: ${pattern.source}]`);
      }
    }
  }

  // If whitelist mode is enabled, check allowed topics
  if (policy.allowedTopics && policy.allowedTopics.length > 0) {
    let hasAllowedTopic = false;

    for (const topic of policy.allowedTopics) {
      const topicPattern = policy.strictMode
        ? new RegExp(`\\b${escapeRegex(topic)}\\b`, 'gi')
        : new RegExp(escapeRegex(topic), 'gi');

      if (topicPattern.test(normalizedPrompt)) {
        hasAllowedTopic = true;
        break;
      }
    }

    if (!hasAllowedTopic && blockedTopicsFound.length === 0) {
      return {
        allowed: false,
        blockedTopics: [],
        reason: `Prompt does not contain any allowed topics. Allowed: ${policy.allowedTopics.join(', ')}.`,
      };
    }
  }

  if (blockedTopicsFound.length > 0) {
    return {
      allowed: false,
      blockedTopics: blockedTopicsFound,
      reason: `Prompt contains blocked topics: ${blockedTopicsFound.join(', ')}.`,
    };
  }

  return {
    allowed: true,
    blockedTopics: [],
  };
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Composite Scanner
// ============================================================================

export interface CompositeScanOptions {
  /** Injection scan level */
  injectionLevel?: ScanLevel;
  /** Custom jailbreak patterns */
  customJailbreakPatterns?: string[];
  /** Whether to scan for sensitive data */
  scanSensitiveData?: boolean;
  /** Token budget configuration */
  tokenBudget?: TokenBudget;
  /** Topic restriction policy */
  topicPolicy?: TopicRestrictionPolicy;
}

export interface CompositeScanResult {
  /** Overall pass/fail status */
  allowed: boolean;
  /** Individual scan results */
  injection: ScanResult;
  jailbreak: ScanResult;
  sensitiveData?: SensitiveDataResult;
  tokenBudget?: TokenBudgetResult;
  topicRestrictions?: TopicRestrictionResult;
  /** Combined risk score (0-1) */
  overallScore: number;
  /** Summary of issues found */
  summary: string[];
}

/**
 * Performs a comprehensive scan combining all detection methods.
 *
 * @param prompt - The prompt text to scan
 * @param options - Configuration options for the scan
 * @returns Composite scan result with all findings
 */
export function performCompositeScan(
  prompt: string,
  options: CompositeScanOptions = {}
): CompositeScanResult {
  const {
    injectionLevel = 'standard',
    customJailbreakPatterns,
    scanSensitiveData = true,
    tokenBudget,
    topicPolicy,
  } = options;

  const summary: string[] = [];

  // Run all scans
  const injection = scanForInjection(prompt, injectionLevel);
  const jailbreak = scanForJailbreak(prompt, customJailbreakPatterns);

  if (injection.detected) {
    summary.push(injection.reason || 'Injection patterns detected');
  }

  if (jailbreak.detected) {
    summary.push(jailbreak.reason || 'Jailbreak patterns detected');
  }

  let sensitiveData: SensitiveDataResult | undefined;
  if (scanSensitiveData) {
    sensitiveData = scanForSensitiveData(prompt);
    if (sensitiveData.detected) {
      summary.push(`Sensitive data detected: ${sensitiveData.types.join(', ')}`);
    }
  }

  let tokenBudgetResult: TokenBudgetResult | undefined;
  if (tokenBudget) {
    tokenBudgetResult = checkTokenBudget(prompt, tokenBudget);
    if (!tokenBudgetResult.allowed) {
      summary.push(tokenBudgetResult.reason || 'Token budget exceeded');
    }
  }

  let topicRestrictions: TopicRestrictionResult | undefined;
  if (topicPolicy) {
    topicRestrictions = scanForTopicRestrictions(prompt, topicPolicy);
    if (!topicRestrictions.allowed) {
      summary.push(topicRestrictions.reason || 'Topic restrictions violated');
    }
  }

  // Calculate overall score
  const scores = [injection.score, jailbreak.score];
  if (sensitiveData?.detected) {
    // Weight sensitive data findings by their severity
    const sensitiveScore = sensitiveData.types.reduce((acc, type) => {
      return acc + (PATTERN_WEIGHTS.sensitive[type] || 0.5);
    }, 0) / Math.max(sensitiveData.types.length, 1);
    scores.push(sensitiveScore);
  }

  const overallScore = Math.min(1, scores.reduce((a, b) => a + b, 0) / scores.length);

  // Determine overall allowed status
  const allowed =
    !injection.detected &&
    !jailbreak.detected &&
    (!sensitiveData || !sensitiveData.detected) &&
    (!tokenBudgetResult || tokenBudgetResult.allowed) &&
    (!topicRestrictions || topicRestrictions.allowed);

  return {
    allowed,
    injection,
    jailbreak,
    sensitiveData,
    tokenBudget: tokenBudgetResult,
    topicRestrictions,
    overallScore,
    summary,
  };
}
