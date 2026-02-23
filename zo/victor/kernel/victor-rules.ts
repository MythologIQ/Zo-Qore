/**
 * Victor Persona Rules - Deterministic Implementation
 * 
 * These rules are enforced WITHOUT LLM intervention for basic functions.
 * LLM is only used for complex reasoning when explicitly requested.
 */

export interface VictorRule {
  id: string;
  name: string;
  category: "honesty" | "focus" | "momentum" | "safety";
  appliesTo: string[];
  evaluate: (context: RuleContext) => RuleDecision;
}

export interface RuleContext {
  action: string;
  params: Record<string, any>;
  agentId: string;
  userId: string;
  hasLLM: boolean;
}

export interface RuleDecision {
  allowed: boolean;
  reason: string;
  stance: "support" | "challenge" | "mixed" | "red-flag";
  requiresReview: boolean;
}

/**
 * Victor's Operating Principles (deterministic, rule-based)
 */
export const VICTOR_RULES: VictorRule[] = [
  // === HONESTY RULES ===
  {
    id: "honesty-no-hallucination",
    name: "No Hallucination",
    category: "honesty",
    appliesTo: ["generate", "answer", "explain"],
    evaluate: (ctx) => ({
      allowed: true,
      reason: "All outputs must be grounded in provided context or verifiable facts",
      stance: "challenge",
      requiresReview: !ctx.hasLLM // Review if no LLM was used
    })
  },
  {
    id: "honesty-no-agreement",
    name: "Disagree to Preserve Harmony",
    category: "honesty",
    appliesTo: ["respond", "acknowledge"],
    evaluate: (ctx) => ({
      allowed: true,
      reason: "Support never implies agreement",
      stance: "support",
      requiresReview: false
    })
  },

  // === FOCUS RULES ===
  {
    id: "focus-on-reality",
    name: "Truth Over Comfort",
    category: "focus",
    appliesTo: ["generate", "decide"],
    evaluate: (ctx) => ({
      allowed: true,
      reason: "Truth outranks comfort in all decisions",
      stance: "challenge",
      requiresReview: true
    })
  },
  {
    id: "focus-no-fluff",
    name: "Zero Fluff Mode",
    category: "focus",
    appliesTo: ["report", "summarize"],
    evaluate: (ctx) => ({
      allowed: true,
      reason: "Direct, actionable responses only",
      stance: "support",
      requiresReview: false
    })
  },

  // === MOMENTUM RULES ===
  {
    id: "momentum-sustained-action",
    name: "Sustained Action",
    category: "momentum",
    appliesTo: ["execute", "deploy"],
    evaluate: (ctx) => ({
      allowed: true,
      reason: "Momentum matters, but not at cost of reality",
      stance: "mixed",
      requiresReview: true
    })
  },

  // === SAFETY RULES ===
  {
    id: "safety-no-destructive",
    name: "No Destructive Actions",
    category: "safety",
    appliesTo: ["delete", "modify", "execute"],
    evaluate: (ctx) => {
      const dangerous = ["rm -rf", "DROP TABLE", "DELETE FROM", "format"];
      const params = JSON.stringify(ctx.params);
      const hasDangerous = dangerous.some(cmd => params.includes(cmd));
      
      return {
        allowed: !hasDangerous,
        reason: hasDangerous 
          ? "BLOCKED: Destructive action requires explicit override"
          : "Safe to proceed",
        stance: hasDangerous ? "red-flag" : "support",
        requiresReview: true
      };
    }
  },
  {
    id: "safety-no-secrets",
    name: "No Secret Exposure",
    category: "safety",
    appliesTo: ["log", "display", "return"],
    evaluate: (ctx) => {
      const params = JSON.stringify(ctx.params);
      const hasSecret = params.includes("API_KEY") || params.includes("SECRET") || params.includes("PASSWORD");
      
      return {
        allowed: !hasSecret,
        reason: hasSecret
          ? "BLOCKED: Secret values must never be exposed"
          : "No secrets in output",
        stance: hasSecret ? "red-flag" : "support",
        requiresReview: true
      };
    }
  },
  {
    id: "safety-production-gate",
    name: "Production Gate",
    category: "safety",
    appliesTo: ["deploy", "publish"],
    evaluate: (ctx) => ({
      allowed: true,
      reason: "All production changes require manual confirmation",
      stance: "mixed",
      requiresReview: true
    })
  }
];

/**
 * Victor's Mode Declarations (required for all responses)
 */
export type VictorMode = "support" | "challenge" | "mixed" | "red-flag";

export function getVictorMode(context: RuleContext): VictorMode {
  const relevantRules = VICTOR_RULES.filter(rule => 
    rule.appliesTo.includes(context.action)
  );
  
  const decisions = relevantRules.map(rule => rule.evaluate(context));
  
  // If any rule is a red-flag, mode is red-flag
  if (decisions.some(d => d.stance === "red-flag")) {
    return "red-flag";
  }
  
  // If any rule is challenge, mode is challenge
  if (decisions.some(d => d.stance === "challenge")) {
    return "challenge";
  }
  
  // If mix of support and other stances, mode is mixed
  if (decisions.some(d => d.stance === "mixed")) {
    return "mixed";
  }
  
  return "support";
}

/**
 * Result of evaluating a single rule
 */
export interface RuleEvaluationResult {
  id: string;
  name: string;
  decision: RuleDecision;
}

/**
 * Result of evaluateRules function
 */
export interface RulesEvaluationResult {
  mode: VictorMode;
  rules: RuleEvaluationResult[];
  overallAllowed: boolean;
  requiresReview: boolean;
}

/**
 * Evaluate all applicable rules and return comprehensive decision
 */
export function evaluateRules(context: RuleContext): RulesEvaluationResult {
  const relevantRules = VICTOR_RULES.filter(rule =>
    rule.appliesTo.includes(context.action)
  );
  
  const decisions = relevantRules.map(rule => ({
    id: rule.id,
    name: rule.name,
    decision: rule.evaluate(context)
  }));
  
  return {
    mode: getVictorMode(context),
    rules: decisions,
    overallAllowed: decisions.every(d => d.decision.allowed),
    requiresReview: decisions.some(d => d.decision.requiresReview)
  };
}
