/**
 * Agent OS Integration for Qore Runtime Service
 *
 * Wires Agent OS agent lifecycle management and compliance checking
 * into Zo-Qore's policy evaluation pipeline.
 */

import { AgentOSAdapter, VictorAgent } from "../../zo/agent-os";
import type { DecisionRequest, DecisionResponse } from "@mythologiq/qore-contracts/schemas/DecisionTypes";

export interface AgentOSIntegrationConfig {
  enabled: boolean;
  policyMode?: "strict" | "permissive";
  victorEnabled?: boolean;
}

/**
 * Integrates Agent OS into Qore Runtime evaluation pipeline.
 *
 * When enabled:
 * - All policy evaluations are checked against Agent OS compliance rules
 * - Victor agent provides strategic challenge and truth-checking
 * - Audit trails are synchronized between Qore and Agent OS
 */
export class AgentOSIntegration {
  private adapter!: AgentOSAdapter;
  private victor?: VictorAgent;
  private enabled: boolean;

  constructor(config: AgentOSIntegrationConfig) {
    this.enabled = config.enabled;

    if (!this.enabled) return;

    this.adapter = new AgentOSAdapter({
      policyMode: config.policyMode ?? "strict",
      logLevel: "info",
    });

    if (config.victorEnabled !== false) {
      this.victor = new VictorAgent(this.adapter);
    }
  }

  /**
   * Initialize Agent OS integration.
   * Registers Victor if enabled.
   */
  async initialize(): Promise<void> {
    if (!this.enabled) return;

    if (this.victor) {
      const result = await this.victor.register();
      if (!result.success) {
        console.warn(`Victor registration failed: ${result.message}`);
      } else {
        console.log(`Victor registered: ${result.message}`);
      }
    }
  }

  /**
   * Pre-evaluation hook: Check Agent OS compliance before Qore evaluation.
   *
   * Returns:
   * - null: Continue with Qore evaluation
   * - DecisionResponse: Block early with Agent OS verdict
   */
  async preEvaluate(request: DecisionRequest): Promise<DecisionResponse | null> {
    if (!this.enabled || !this.victor) return null;

    const compliance = await this.victor.checkCompliance(request.action, {
      targetPath: request.targetPath,
      content: request.content,
      actorId: request.actorId,
    });

    // If Victor says Red Flag, deny immediately
    if (compliance.victorStance === "red-flag") {
      return {
        requestId: request.requestId,
        decisionId: `victor-red-flag-${Date.now()}`,
        auditEventId: "victor-pre-eval",
        decision: "DENY",
        riskGrade: "L3",
        evaluationTier: 3,
        reasons: [`Victor Red Flag: ${compliance.violations.join("; ")}`],
        requiredActions: ["fix_violations_before_proceeding"],
        policyVersion: "victor-agent-os",
        evaluatedAt: new Date().toISOString(),
      };
    }

    // Otherwise, let Qore evaluation proceed
    return null;
  }

  /**
   * Post-evaluation hook: Enrich Qore response with Victor's stance.
   */
  async postEvaluate(
    request: DecisionRequest,
    response: DecisionResponse,
  ): Promise<DecisionResponse> {
    if (!this.enabled || !this.victor) return response;

    const compliance = await this.victor.checkCompliance(request.action, {
      targetPath: request.targetPath,
      content: request.content,
      decision: response.decision,
    });

    // Append Victor's stance to the reasons
    if (compliance.victorStance === "support") {
      response.reasons.push("Victor: Support");
    } else if (compliance.victorStance === "challenge") {
      response.reasons.push(`Victor: Challenge - ${compliance.violations.join(", ")}`);
    }

    return response;
  }

  /**
   * Get Victor's current status for UI display.
   */
  async getVictorStatus() {
    if (!this.victor) return null;
    return this.victor.getStatus();
  }

  /**
   * Get Victor's audit trail.
   */
  async getVictorAuditTrail(limit = 50) {
    if (!this.victor) return [];
    return this.victor.getAuditTrail(limit);
  }

  /**
   * Shutdown Agent OS integration.
   */
  async shutdown(): Promise<void> {
    if (!this.enabled) return;
    await this.adapter.shutdown();
  }
}
