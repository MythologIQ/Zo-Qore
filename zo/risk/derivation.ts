/**
 * Guardrail Derivation
 *
 * Derives guardrails from risk mitigation strategies via pattern matching.
 *
 * @module zo/risk/derivation
 */

import type { Risk, Guardrail, GateType, GuardrailCondition } from "../project-tab/types.js";

/** Derivation rule for converting mitigations to guardrails */
interface DerivationRule {
  pattern: RegExp;
  gateType: GateType;
  policyPrefix: string;
}

const DERIVATION_RULES: DerivationRule[] = [
  {
    pattern: /human review|human approval|manual check/i,
    gateType: "human_approval",
    policyPrefix: "*",
  },
  {
    pattern: /stage first|staged deployment|test before/i,
    gateType: "staged_execution",
    policyPrefix: "deploy:*",
  },
  {
    pattern: /validate|verify|check contract/i,
    gateType: "validation",
    policyPrefix: "*",
  },
  {
    pattern: /block|prevent|deny/i,
    gateType: "block",
    policyPrefix: "*",
  },
  {
    pattern: /auth|authentication|credentials/i,
    gateType: "human_approval",
    policyPrefix: "file.write:**/auth/**",
  },
  {
    pattern: /migration|schema change|database/i,
    gateType: "staged_execution",
    policyPrefix: "migration:*",
  },
  {
    pattern: /external api|third.?party|integration/i,
    gateType: "validation",
    policyPrefix: "api.call:*",
  },
];

/**
 * Derive guardrail from risk mitigation strategy.
 * Returns null if no derivation rule matches.
 */
export function deriveGuardrail(
  risk: Risk,
  projectId: string
): Omit<Guardrail, "id"> | null {
  const text = `${risk.mitigation} ${risk.avoidance}`;

  for (const rule of DERIVATION_RULES) {
    if (rule.pattern.test(text)) {
      return {
        projectId,
        riskId: risk.id,
        policyPattern: buildPolicyPattern(risk, rule.policyPrefix),
        gateType: rule.gateType,
        conditions: [],
      };
    }
  }

  return null;
}

function buildPolicyPattern(risk: Risk, prefix: string): string {
  if (prefix !== "*") return prefix;

  const descLower = risk.description.toLowerCase();
  if (descLower.includes("auth")) return "file.write:**/auth/**";
  if (descLower.includes("migration")) return "migration:*";
  if (descLower.includes("deploy")) return "deploy:*";
  if (descLower.includes("api")) return "api.call:*";

  return "*";
}

/**
 * Check if guardrail can be derived from risk.
 */
export function canDeriveGuardrail(risk: Risk): boolean {
  const text = `${risk.mitigation} ${risk.avoidance}`;
  return DERIVATION_RULES.some((rule) => rule.pattern.test(text));
}
