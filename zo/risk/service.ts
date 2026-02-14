/**
 * Risk Service
 *
 * Service for managing risks and their lifecycle.
 *
 * @module zo/risk/service
 */

import type { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import type { Risk, Guardrail, RiskLikelihood, RiskImpact } from "../project-tab/types.js";
import type { RiskState, RiskView, RiskEvent, RiskMatrixCell } from "./types.js";

type RiskEventHandler = (event: RiskEvent) => void;

const LIKELIHOOD_SCORES: Record<RiskLikelihood, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const IMPACT_SCORES: Record<RiskImpact, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export class RiskService {
  private readonly storage: ProjectTabStorage;
  private eventHandlers: RiskEventHandler[] = [];

  constructor(db: DuckDBClient) {
    this.storage = new ProjectTabStorage(db);
  }

  onEvent(handler: RiskEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  async loadRiskState(projectId: string): Promise<RiskState> {
    const risks = await this.storage.listRisksForProject(projectId);
    const guardrails = await this.storage.listGuardrailsForProject(projectId);

    const views = risks.map((r) => this.buildRiskView(r, guardrails));
    const matrix = this.buildRiskMatrix(views);

    return {
      projectId,
      risks: views,
      matrix,
      unresolvedCount: views.filter((r) => r.status !== "resolved").length,
      mitigatedCount: views.filter((r) => r.status === "mitigated").length,
    };
  }

  async addRisk(projectId: string, risk: Omit<Risk, "id" | "projectId">): Promise<Risk> {
    const id = `risk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newRisk: Risk = { id, projectId, ...risk };
    const created = await this.storage.createRisk(newRisk);
    this.emit({ type: "risk_added", riskId: created.id });
    return created;
  }

  async updateRisk(riskId: string, updates: Partial<Risk>): Promise<void> {
    await this.storage.updateRisk(riskId, updates);
    this.emit({ type: "risk_updated", riskId });
  }

  async mitigateRisk(riskId: string): Promise<void> {
    await this.storage.updateRisk(riskId, { status: "mitigated" });
    this.emit({ type: "risk_mitigated", riskId });
  }

  private buildRiskView(risk: Risk, guardrails: Guardrail[]): RiskView {
    const guardrail = guardrails.find((g) => g.riskId === risk.id);
    return {
      id: risk.id,
      description: risk.description,
      likelihood: risk.likelihood,
      impact: risk.impact,
      avoidance: risk.avoidance,
      mitigation: risk.mitigation,
      contingency: risk.contingency,
      status: risk.status,
      riskScore: this.computeRiskScore(risk.likelihood, risk.impact),
      hasGuardrail: !!guardrail,
      guardrailId: guardrail?.id ?? null,
    };
  }

  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    return LIKELIHOOD_SCORES[likelihood] * IMPACT_SCORES[impact];
  }

  private buildRiskMatrix(risks: RiskView[]): RiskMatrixCell[][] {
    const likelihoods: RiskLikelihood[] = ["low", "medium", "high"];
    const impacts: RiskImpact[] = ["low", "medium", "high"];

    return likelihoods.map((likelihood) =>
      impacts.map((impact) => ({
        likelihood,
        impact,
        risks: risks.filter((r) => r.likelihood === likelihood && r.impact === impact),
      }))
    );
  }

  private emit(event: RiskEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        /* swallow handler errors */
      }
    }
  }
}
