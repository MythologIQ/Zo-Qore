import * as crypto from "crypto";
import {
  AgentIdentity,
  FailureMode,
  L3ApprovalRequest,
  ShadowGenomeEntry,
  SentinelVerdict,
} from "@mythologiq/qore-contracts/schemas/shared.types";
import { RuntimeStateStore } from "@mythologiq/qore-contracts/runtime/interfaces";
import { QoreConfig, defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { EventBus } from "../support/EventBus";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { PolicyEngine } from "../../policy/engine/PolicyEngine";
import { TrustEngine } from "./TrustEngine";
import { ShadowGenomeManager } from "./ShadowGenomeManager";
import { CortexEvent, RoutingDecision } from "../../risk/engine/EvaluationRouter";

export class QoreLogicManager {
  private l3Queue: L3ApprovalRequest[] = [];

  constructor(
    private readonly stateStore: RuntimeStateStore,
    private readonly ledgerManager: LedgerManager,
    private readonly trustEngine: TrustEngine,
    private readonly policyEngine: PolicyEngine,
    private readonly shadowGenomeManager: ShadowGenomeManager,
    private readonly eventBus: EventBus,
    private readonly config: QoreConfig = defaultQoreConfig,
  ) {}

  async initialize(): Promise<void> {
    this.l3Queue = this.stateStore.get<L3ApprovalRequest[]>("l3Queue", []);
  }

  getLedgerManager(): LedgerManager {
    return this.ledgerManager;
  }

  getTrustEngine(): TrustEngine {
    return this.trustEngine;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  getShadowGenomeManager(): ShadowGenomeManager {
    return this.shadowGenomeManager;
  }

  getL3Queue(): L3ApprovalRequest[] {
    return [...this.l3Queue];
  }

  async queueL3Approval(
    request: Omit<L3ApprovalRequest, "id" | "state" | "queuedAt" | "slaDeadline">,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    const slaDeadline = new Date(now.getTime() + this.config.qorelogic.l3SLA * 1000);
    const fullRequest: L3ApprovalRequest = {
      ...request,
      id,
      state: "QUEUED",
      queuedAt: now.toISOString(),
      slaDeadline: slaDeadline.toISOString(),
    };

    this.l3Queue.push(fullRequest);
    await this.persistL3Queue();

    await this.ledgerManager.appendEntry({
      eventType: "L3_QUEUED",
      agentDid: request.agentDid,
      agentTrustAtAction: request.agentTrust,
      artifactPath: request.filePath,
      riskGrade: request.riskGrade,
      payload: { sentinelSummary: request.sentinelSummary, flags: request.flags },
    });
    this.eventBus.emit("qorelogic.l3Queued", fullRequest);
    return id;
  }

  async processEvaluationDecision(decision: RoutingDecision, event: CortexEvent): Promise<void> {
    const mappedRisk = this.mapRisk(decision.triage.risk);
    if (decision.writeLedger) {
      await this.ledgerManager.appendEntry({
        eventType: "EVALUATION_ROUTED",
        agentDid: String(event.payload?.intentId ?? "system"),
        artifactPath: String(event.payload?.targetPath ?? ""),
        riskGrade: mappedRisk,
        payload: { tier: decision.tier, triage: decision.triage },
      });
    }

    if (decision.tier === 3) {
      await this.queueL3Approval({
        agentDid: String(event.payload?.intentId ?? "system"),
        agentTrust: decision.triage.confidence === "high" ? 0.9 : 0.7,
        filePath: String(event.payload?.targetPath ?? ""),
        riskGrade: mappedRisk,
        sentinelSummary: `Tier 3 evaluation: ${decision.triage.risk} risk, ${decision.triage.novelty} novelty`,
        flags: decision.requiredActions,
      });
    }
  }

  async processL3Decision(
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    conditions?: string[],
  ): Promise<void> {
    const index = this.l3Queue.findIndex((item) => item.id === requestId);
    if (index < 0) throw new Error(`L3 request not found: ${requestId}`);
    const request = this.l3Queue[index];
    request.state = decision === "APPROVED" && conditions?.length ? "APPROVED_WITH_CONDITIONS" : decision;
    request.decidedAt = new Date().toISOString();
    request.overseerDid = "did:myth:overseer:local";
    request.decision = decision;
    request.conditions = conditions;

    await this.ledgerManager.appendEntry({
      eventType: decision === "APPROVED" ? "L3_APPROVED" : "L3_REJECTED",
      agentDid: request.agentDid,
      agentTrustAtAction: request.agentTrust,
      artifactPath: request.filePath,
      riskGrade: request.riskGrade,
      overseerDid: request.overseerDid,
      overseerDecision: decision,
      payload: { conditions },
    });

    await this.trustEngine.updateTrust(request.agentDid, decision === "APPROVED" ? "success" : "failure");
    this.l3Queue.splice(index, 1);
    await this.persistL3Queue();
    this.eventBus.emit("qorelogic.l3Decided", { request, decision });
  }

  async registerAgent(persona: string, publicKey: string): Promise<AgentIdentity> {
    const identity = await this.trustEngine.registerAgent(persona, publicKey);
    await this.ledgerManager.appendEntry({
      eventType: "SYSTEM_EVENT",
      agentDid: identity.did,
      agentTrustAtAction: identity.trustScore,
      payload: { action: "AGENT_REGISTERED", persona },
    });
    return identity;
  }

  async archiveFailedVerdict(
    verdict: SentinelVerdict,
    inputVector: string,
    environmentContext?: string,
  ): Promise<ShadowGenomeEntry | null> {
    if (verdict.decision === "PASS") return null;
    return this.shadowGenomeManager.archiveFailure({
      verdict,
      inputVector,
      decisionRationale: verdict.summary,
      environmentContext,
      causalVector: verdict.details,
    });
  }

  async getAgentNegativeConstraints(agentDid: string): Promise<string[]> {
    return this.shadowGenomeManager.getNegativeConstraintsForAgent(agentDid);
  }

  async getFailurePatterns(): Promise<
    { failureMode: FailureMode; count: number; agentDids: string[]; recentCauses: string[] }[]
  > {
    return this.shadowGenomeManager.analyzeFailurePatterns();
  }

  async getAgentFailureHistory(agentDid: string, limit = 20): Promise<ShadowGenomeEntry[]> {
    return this.shadowGenomeManager.getEntriesByAgent(agentDid, limit);
  }

  dispose(): void {
    this.shadowGenomeManager.close();
  }

  private async persistL3Queue(): Promise<void> {
    await this.stateStore.set("l3Queue", this.l3Queue);
  }

  private mapRisk(risk: RoutingDecision["triage"]["risk"]): "L1" | "L2" | "L3" {
    if (risk === "R2") return "L2";
    if (risk === "R3") return "L3";
    return "L1";
  }
}

