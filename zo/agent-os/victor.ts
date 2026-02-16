/**
 * Victor Agent - Primary Zo-Qore Agent Identity
 *
 * Victor is the executive ally and strategic challenger persona,
 * registered through Agent OS with strict governance policies.
 */

import { AgentOSAdapter, type AgentDefinition } from "./adapter";

export const VICTOR_AGENT_DEFINITION: AgentDefinition = {
  id: "victor-zo-qore-primary",
  name: "Victor",
  description: "Personal Executive Ally, Strategic Challenger, Confidant for Zo-Qore governance runtime",
  capabilities: [
    "policy-evaluation",
    "risk-assessment",
    "truth-checking",
    "strategic-challenge",
    "momentum-tracking",
  ],
  policies: [
    "truth-over-comfort",
    "evidence-based-challenge",
    "no-hallucination",
    "explicit-stance-declaration",
  ],
  trustLevel: "high",
};

/**
 * VictorAgent - Wrapper for Victor's Agent OS registration and lifecycle.
 */
export class VictorAgent {
  private adapter: AgentOSAdapter;
  private agentId?: string;
  private initialized = false;

  constructor(adapter: AgentOSAdapter) {
    this.adapter = adapter;
  }

  /**
   * Register Victor with Agent OS.
   */
  async register(): Promise<{ success: boolean; message: string }> {
    if (this.initialized) {
      return { success: true, message: "Victor already registered" };
    }

    const result = await this.adapter.createAgent(VICTOR_AGENT_DEFINITION);

    if (result.success) {
      this.agentId = result.agentId;
      this.initialized = true;
    }

    return result;
  }

  /**
   * Get Victor's current status.
   */
  async getStatus() {
    if (!this.agentId) {
      return null;
    }

    return this.adapter.getAgentStatus(this.agentId);
  }

  /**
   * Check if a proposed action complies with Victor's policies.
   *
   * Victor's policy enforcement:
   * - Truth outranks comfort
   * - Disagreement requires evidence (receipts)
   * - No hallucinated facts or certainty
   */
  async checkCompliance(action: string, context: Record<string, unknown>): Promise<{
    allowed: boolean;
    violations: string[];
    victorStance?: "support" | "challenge" | "mixed" | "red-flag";
    recommendation?: string;
  }> {
    if (!this.agentId) {
      throw new Error("Victor not registered");
    }

    const result = await this.adapter.checkCompliance(this.agentId, action, context);

    // Victor's stance is derived from compliance result
    let victorStance: "support" | "challenge" | "mixed" | "red-flag" = "support";

    if (!result.allowed) {
      victorStance = "red-flag";
    } else if (result.violations.length > 0) {
      victorStance = "challenge";
    }

    return {
      ...result,
      victorStance,
    };
  }

  /**
   * Get Victor's audit trail.
   */
  async getAuditTrail(limit = 50) {
    if (!this.agentId) {
      return [];
    }

    return this.adapter.getAuditTrail(this.agentId, limit);
  }
}
