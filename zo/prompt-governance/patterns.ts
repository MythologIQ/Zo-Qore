/**
 * Prompt Governance Detection Patterns
 *
 * This module defines regex patterns and string matchers for detecting
 * prompt injection attacks, jailbreak attempts, and sensitive data leakage.
 */

// ============================================================================
// Injection Attack Patterns
// ============================================================================

export const INJECTION_PATTERNS = {
  /**
   * Delimiter attacks attempt to break out of user input context
   * by injecting XML tags, system markers, or instruction delimiters.
   */
  delimiterAttack: [
    // XML/HTML-style system tag injection
    /```xml\s*<system>/gi,
    /```\s*<\/?system>/gi,
    /<\/?system\s*>/gi,
    /<\/?assistant\s*>/gi,
    /<\/?user\s*>/gi,
    /<\/?human\s*>/gi,
    /<\/?instruction[s]?\s*>/gi,

    // Markdown code block with system context
    /```(?:system|instructions?|prompt)\s*\n/gi,

    // Common LLM instruction markers
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<<SYS>>/gi,
    /<<\/SYS>>/gi,
    /\[SYSTEM\]/gi,
    /\[\/SYSTEM\]/gi,

    // Anthropic-style markers
    /\n\nHuman:/gi,
    /\n\nAssistant:/gi,

    // OpenAI-style role injection
    /{"role"\s*:\s*"system"/gi,
    /{"role"\s*:\s*"assistant"/gi,

    // Prompt template injection
    /\{\{system\}\}/gi,
    /\{\{instructions?\}\}/gi,
    /\$\{system\}/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /<\|endoftext\|>/gi,
  ],

  /**
   * Instruction override attempts try to supersede or cancel
   * the original system instructions.
   */
  instructionOverride: [
    // Direct override commands
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
    /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
    /forget\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
    /override\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
    /cancel\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/gi,

    // New instruction injection
    /your\s+new\s+instructions?\s+(are|is)/gi,
    /new\s+system\s+prompt/gi,
    /updated\s+instructions?/gi,
    /replace\s+(your\s+)?instructions?/gi,

    // Context reset attempts
    /reset\s+(your\s+)?(context|memory|instructions?)/gi,
    /clear\s+(your\s+)?(context|memory|instructions?)/gi,
    /start\s+(a\s+)?new\s+(conversation|session|context)/gi,

    // Authority claims
    /i\s+am\s+(your\s+)?(developer|creator|admin|administrator|owner)/gi,
    /i\s+have\s+(admin|root|developer)\s+(access|privileges?|permissions?)/gi,
    /developer\s+mode\s+(enabled|activated|on)/gi,
    /admin\s+override/gi,
    /sudo\s+mode/gi,

    // Prompt leaking attempts
    /(?:show|reveal|print|output|display|repeat)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?)/gi,
    /what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions?)/gi,
  ],

  /**
   * Unicode homoglyph attacks use visually similar characters
   * to bypass text filters while appearing normal to humans.
   */
  unicodeHomoglyph: [
    // Cyrillic lookalikes for Latin letters
    /[\u0400-\u04FF]/g, // Cyrillic block
    /[\u0430\u0435\u043E\u0440\u0441\u0443\u0445]/g, // а, е, о, р, с, у, х (look like a, e, o, p, c, y, x)

    // Zero-width characters (invisible but can affect parsing)
    /[\u200B-\u200F]/g, // Zero-width space, non-joiner, joiner, LTR/RTL marks
    /[\u2060-\u206F]/g, // Word joiner, invisible operators
    /[\uFEFF]/g, // Byte order mark

    // Homoglyphs and confusables
    /[\u0251]/g, // ɑ (Latin Small Letter Alpha)
    /[\u0261]/g, // ɡ (Latin Small Letter Script G)
    /[\u026F]/g, // ɯ (Latin Small Letter Turned M)
    /[\u0279]/g, // ɹ (Latin Small Letter Turned R)

    // Full-width characters
    /[\uFF00-\uFFEF]/g, // Halfwidth and Fullwidth Forms

    // Mathematical alphanumeric symbols (used for obfuscation)
    /[\u{1D400}-\u{1D7FF}]/gu, // Mathematical symbols

    // Enclosed alphanumerics
    /[\u2460-\u24FF]/g, // Circled numbers and letters
    /[\u3200-\u32FF]/g, // Enclosed CJK letters

    // Combining diacritical marks (can create "zalgo text")
    /[\u0300-\u036F]{3,}/g, // Multiple combining marks
  ],
} as const;

// ============================================================================
// Jailbreak Attempt Patterns
// ============================================================================

export const JAILBREAK_PATTERNS = {
  /**
   * Roleplay override attempts try to make the AI adopt
   * a different persona without safety constraints.
   */
  roleplayOverride: [
    /pretend\s+(you\s+are|to\s+be|you're)/gi,
    /act\s+as\s+(if\s+you\s+(are|were)|a|an|the)/gi,
    /imagine\s+you\s+(are|were|'re)/gi,
    /you\s+are\s+now\s+(a|an|the)/gi,
    /from\s+now\s+on[,]?\s+you\s+(are|will)/gi,
    /roleplay\s+as/gi,
    /play\s+the\s+role\s+of/gi,
    /take\s+on\s+the\s+persona\s+of/gi,
    /become\s+(a|an|the)/gi,
    /transform\s+into/gi,
    /switch\s+to\s+.+\s+mode/gi,
    /enter\s+.+\s+mode/gi,
    /enable\s+.+\s+mode/gi,
    /activate\s+.+\s+mode/gi,
  ],

  /**
   * Hypothetical framing attempts to bypass restrictions
   * by framing harmful requests as fictional or educational.
   */
  hypotheticalFraming: [
    /in\s+a\s+fictional\s+scenario/gi,
    /for\s+(a\s+)?(fictional|hypothetical)\s+(story|novel|scenario|example)/gi,
    /hypothetically\s+speaking/gi,
    /let's\s+(say|assume|imagine|pretend)/gi,
    /suppose\s+(that\s+)?you\s+(were|are|could)/gi,
    /what\s+if\s+you\s+(could|were|had|didn't)/gi,
    /in\s+(a\s+)?theory/gi,
    /theoretically/gi,
    /for\s+(educational|research|academic)\s+purposes?\s+only/gi,
    /purely\s+(for|as)\s+(an?\s+)?(educational|academic|research)/gi,
    /this\s+is\s+(just\s+)?(fiction|fictional|a\s+story)/gi,
    /writing\s+a\s+(story|novel|script)\s+(about|where)/gi,
    /creative\s+writing\s+(exercise|prompt)/gi,
    /for\s+my\s+(novel|book|screenplay|script)/gi,
  ],

  /**
   * Known jailbreak templates and techniques that have been
   * documented in security research.
   */
  knownTemplates: [
    // DAN (Do Anything Now) and variants
    /\bDAN\s*(mode|prompt|jailbreak)?\b/gi,
    /do\s+anything\s+now/gi,
    /DUDE\s+mode/gi,
    /STAN\s+mode/gi,
    /KEVIN\s+mode/gi,
    /AIM\s+mode/gi,

    // Jailbreak terminology
    /\bjailbreak(ed|ing)?\b/gi,
    /\bunlock(ed|ing)?\s+(your\s+)?(full|true)\s+(potential|capabilities)/gi,
    /remove\s+(your\s+)?(restrictions?|limitations?|filters?|safeguards?)/gi,
    /bypass\s+(your\s+)?(restrictions?|limitations?|filters?|safeguards?)/gi,
    /disable\s+(your\s+)?(restrictions?|limitations?|filters?|safeguards?)/gi,
    /turn\s+off\s+(your\s+)?(restrictions?|limitations?|filters?|safeguards?)/gi,
    /without\s+(any\s+)?(restrictions?|limitations?|filters?|safeguards?)/gi,
    /no\s+(restrictions?|limitations?|filters?|safeguards?)/gi,
    /uncensored/gi,
    /unfiltered/gi,

    // Token smuggling
    /base64\s*:\s*/gi,
    /decode\s+this/gi,
    /rot13/gi,

    // Prompt injection via encoding
    /respond\s+in\s+(base64|hex|binary|rot13)/gi,
    /output\s+in\s+(base64|hex|binary|rot13)/gi,

    // Multi-turn manipulation
    /answer\s+with\s+(only\s+)?yes\s+or\s+no/gi,
    /if\s+you\s+understand[,]?\s+(say|respond|reply)/gi,
    /confirm\s+by\s+saying/gi,

    // Emotional manipulation
    /my\s+(life|job|career)\s+depends\s+on/gi,
    /this\s+is\s+(urgent|critical|life\s+or\s+death)/gi,
    /i('ll|\s+will)\s+(die|be\s+fired|lose\s+everything)\s+if/gi,
  ],
} as const;

// ============================================================================
// Sensitive Data Patterns
// ============================================================================

export const SENSITIVE_PATTERNS = {
  /**
   * US Social Security Number
   * Format: XXX-XX-XXXX
   */
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

  /**
   * Credit Card Numbers
   * Supports major card types with optional spaces/dashes
   */
  creditCard:
    /\b(?:4[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|5[1-5][0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|3[47][0-9]{2}[-\s]?[0-9]{6}[-\s]?[0-9]{5}|6(?:011|5[0-9]{2})[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4})\b/g,

  /**
   * Email Addresses
   * Standard RFC 5322 simplified pattern
   */
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  /**
   * Phone Numbers
   * Supports various formats: (XXX) XXX-XXXX, XXX-XXX-XXXX, +1XXXXXXXXXX, etc.
   */
  phone:
    /\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

  /**
   * API Keys and Tokens
   * Common prefixes used by various services
   */
  apiKey:
    /\b(?:sk[-_](?:live[-_]|test[-_])?[a-zA-Z0-9]{20,}|pk[-_](?:live[-_]|test[-_])?[a-zA-Z0-9]{20,}|api[-_]?key[-_]?[=:]?\s*['"]?[a-zA-Z0-9_-]{16,}['"]?|bearer\s+[a-zA-Z0-9._-]{20,})\b/gi,

  /**
   * AWS Access Key ID
   * Format: AKIA followed by 16 alphanumeric characters
   */
  awsKey: /\bAKIA[0-9A-Z]{16}\b/g,

  /**
   * AWS Secret Access Key
   * 40 character base64-like string
   */
  awsSecret: /\b[A-Za-z0-9/+=]{40}\b/g,

  /**
   * Generic Secrets
   * Patterns for password, secret, token assignments
   */
  genericSecret:
    /\b(?:password|passwd|pwd|secret|token|auth[-_]?token|access[-_]?token|refresh[-_]?token|private[-_]?key|secret[-_]?key)[\s]*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi,

  /**
   * Private Keys
   * PEM format headers
   */
  privateKey:
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,

  /**
   * GitHub Personal Access Token
   */
  githubToken: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,

  /**
   * Slack Token
   */
  slackToken: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}\b/g,

  /**
   * JWT Token
   */
  jwt: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b/g,

  /**
   * Google API Key
   */
  googleApiKey: /\bAIza[0-9A-Za-z_-]{35}\b/g,

  /**
   * Azure Storage Key
   */
  azureStorageKey:
    /\b[A-Za-z0-9+/]{86}==\b/g,

  /**
   * Database Connection Strings
   */
  dbConnectionString:
    /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|mssql):\/\/[^\s'"]+/gi,

  /**
   * IP Addresses (v4)
   */
  ipAddress: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
} as const;

// ============================================================================
// Pattern Severity Weights
// ============================================================================

/**
 * Severity weights for calculating risk scores.
 * Higher values indicate more severe threats.
 */
export const PATTERN_WEIGHTS = {
  injection: {
    delimiterAttack: 0.9,
    instructionOverride: 0.85,
    unicodeHomoglyph: 0.6,
  },
  jailbreak: {
    roleplayOverride: 0.7,
    hypotheticalFraming: 0.5,
    knownTemplates: 0.95,
  },
  sensitive: {
    ssn: 1.0,
    creditCard: 1.0,
    email: 0.3,
    phone: 0.4,
    apiKey: 0.95,
    awsKey: 1.0,
    awsSecret: 1.0,
    genericSecret: 0.8,
    privateKey: 1.0,
    githubToken: 0.95,
    slackToken: 0.9,
    jwt: 0.7,
    googleApiKey: 0.95,
    azureStorageKey: 0.95,
    dbConnectionString: 0.9,
    ipAddress: 0.2,
  },
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type InjectionPatternCategory = keyof typeof INJECTION_PATTERNS;
export type JailbreakPatternCategory = keyof typeof JAILBREAK_PATTERNS;
export type SensitivePatternType = keyof typeof SENSITIVE_PATTERNS;
