/**
 * Prompt Governance Module
 *
 * This module provides comprehensive prompt scanning and governance capabilities
 * for detecting injection attacks, jailbreak attempts, sensitive data leakage,
 * and enforcing usage policies.
 *
 * @example
 * ```typescript
 * import {
 *   scanForInjection,
 *   scanForJailbreak,
 *   scanForSensitiveData,
 *   performCompositeScan,
 * } from '@zo/prompt-governance';
 *
 * // Simple injection scan
 * const injectionResult = scanForInjection(userPrompt, 'strict');
 * if (injectionResult.detected) {
 *   console.log('Injection detected:', injectionResult.reason);
 * }
 *
 * // Comprehensive scan
 * const result = performCompositeScan(userPrompt, {
 *   injectionLevel: 'standard',
 *   scanSensitiveData: true,
 *   tokenBudget: { maxTokensPerPrompt: 4000 },
 *   topicPolicy: { blockedTopics: ['weapons', 'hacking'] },
 * });
 *
 * if (!result.allowed) {
 *   console.log('Prompt blocked:', result.summary);
 * }
 * ```
 */

// ============================================================================
// Pattern Exports
// ============================================================================

export {
  INJECTION_PATTERNS,
  JAILBREAK_PATTERNS,
  SENSITIVE_PATTERNS,
  PATTERN_WEIGHTS,
  type InjectionPatternCategory,
  type JailbreakPatternCategory,
  type SensitivePatternType,
} from './patterns';

// ============================================================================
// Scanner Exports
// ============================================================================

export {
  // Core scanner functions
  scanForInjection,
  scanForJailbreak,
  scanForSensitiveData,
  checkTokenBudget,
  checkRateLimit,
  scanForTopicRestrictions,

  // Composite scanner
  performCompositeScan,

  // Types
  type ScanResult,
  type SensitiveDataMatch,
  type SensitiveDataResult,
  type TokenBudget,
  type TokenBudgetResult,
  type RateLimits,
  type RateLimitResult,
  type TopicRestrictionPolicy,
  type TopicRestrictionResult,
  type ScanLevel,
  type CompositeScanOptions,
  type CompositeScanResult,
} from './scanners';
