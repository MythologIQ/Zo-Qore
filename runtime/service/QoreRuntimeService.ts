import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  DecisionRequest,
  DecisionResponse,
  DecisionRequestSchema,
  DecisionResponseSchema,
} from "@mythologiq/qore-contracts/schemas/DecisionTypes";
import { QoreConfig, defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { PolicyEngine } from "../../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../../risk/engine/EvaluationRouter";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { RuntimeError } from "./errors";
import { AgentOSIntegration, type AgentOSIntegrationConfig } from "./AgentOSIntegration";
import { ServiceRegistry } from "./ServiceRegistry";

export interface RuntimeHealth {
  status: "ok";
  initialized: boolean;
  policyLoaded: boolean;
  ledgerAvailable: boolean;
  policyVersion: string;
  timestamp: string;
  services?: Record<string, boolean>;
}

export class QoreRuntimeService {
  private initialized = false;
  private policyLoaded = false;
  private cachedPolicyVersion = "unknown";
  private readonly replayCache = new Map<
    string,
    { fingerprint: string; response: DecisionResponse; expiresAt: number }
  >();
  private readonly replayTtlMs = 5 * 60 * 1000;
  private agentOS?: AgentOSIntegration;
  private serviceRegistry: ServiceRegistry;

  constructor(
    private readonly policyEngine: PolicyEngine,
    private readonly evaluationRouter: EvaluationRouter,
    private readonly ledgerManager: LedgerManager,
    private readonly config: QoreConfig = defaultQoreConfig,
  ) {
    this.serviceRegistry = new ServiceRegistry();
  }

  async initialize(policyDir?: string): Promise<void> {
    await this.ledgerManager.initialize();
    if (policyDir) {
      this.policyEngine.loadPoliciesFromDirectory(policyDir);
      const validation = this.policyEngine.validatePolicyDefinitions(policyDir);
      this.policyLoaded = validation.valid;
      if (!validation.valid) {
        throw new RuntimeError("POLICY_INVALID", "Policy validation failed", {
          errors: validation.errors,
        });
      }
      this.cachedPolicyVersion = this.computePolicyVersion(policyDir);
    } else {
      await this.policyEngine.loadPolicies();
      this.policyLoaded = true;
      this.cachedPolicyVersion = "runtime-defaults";
    }

    // Load external service registry
    await this.serviceRegistry.loadServices();
    console.log("Service registry loaded");

    // Initialize Agent OS integration with Victor
    const agentOSEnabled = process.env.QORE_AGENT_OS_ENABLED === "true";
    if (agentOSEnabled) {
      this.agentOS = new AgentOSIntegration({
        enabled: true,
        policyMode: "strict",
        victorEnabled: true,
      });
      await this.agentOS.initialize();
    }

    this.initialized = true;
  }

  getPolicyVersion(): string {
    return this.cachedPolicyVersion;
  }

  async health(): Promise<RuntimeHealth> {
    const services: Record<string, boolean> = {};

    // Check health of all registered services
    for (const [serviceId, _] of this.serviceRegistry.getAllServices()) {
      services[serviceId] = await this.serviceRegistry.checkHealth(serviceId);
    }

    return {
      status: "ok",
      initialized: this.initialized,
      policyLoaded: this.policyLoaded,
      ledgerAvailable: this.ledgerManager.getEntryCount() >= 1,
      policyVersion: this.cachedPolicyVersion,
      timestamp: new Date().toISOString(),
      services,
    };
  }

  getServiceRegistry(): ServiceRegistry {
    return this.serviceRegistry;
  }

  async evaluate(input: DecisionRequest): Promise<DecisionResponse> {
    if (!this.initialized) {
      throw new RuntimeError("NOT_INITIALIZED", "Runtime service has not been initialized");
    }

    const request = DecisionRequestSchema.parse(input);

    // Agent OS pre-evaluation: Victor can block early if Red Flag
    if (this.agentOS) {
      const earlyBlock = await this.agentOS.preEvaluate(request);
      if (earlyBlock) {
        return earlyBlock;
      }
    }

    const nowMs = Date.now();
    const replayKey = `${request.actorId}::${request.requestId}`;
    const fingerprint = this.requestFingerprint(request);
    const replay = this.replayCache.get(replayKey);
    if (replay && replay.expiresAt > nowMs) {
      if (replay.fingerprint !== fingerprint) {
        throw new RuntimeError("REPLAY_CONFLICT", "requestId replayed with mismatched payload", {
          requestId: request.requestId,
          actorId: request.actorId,
        });
      }
      return replay.response;
    }
    this.pruneReplayCache(nowMs);

    const riskGrade = this.policyEngine.classifyRisk(request.targetPath, request.content);
    const triage = await this.evaluationRouter.computeTriage({
      id: request.requestId,
      timestamp: new Date().toISOString(),
      category: "system",
      payload: {
        targetPath: request.targetPath,
        action: request.action,
        actorId: request.actorId,
      },
    });
    const tier = this.evaluationRouter.determineTier(triage.risk, triage.novelty, triage.confidence);

    const reasons = [
      `policyRisk=${riskGrade}`,
      `routerRisk=${triage.risk}`,
      `novelty=${triage.novelty}`,
      `confidence=${triage.confidence}`,
    ];

    const requiredActions: string[] = [];
    let decision: DecisionResponse["decision"];
    if (tier >= 3 || riskGrade === "L3") {
      decision = "DENY";
      requiredActions.push("human_review_required");
    } else if (tier === 2 || this.config.qorelogic.strictMode) {
      decision = "ESCALATE";
      requiredActions.push("l3_approval");
    } else {
      decision = "ALLOW";
    }

    const isMutatingAction =
      request.action === "write" ||
      request.action === "execute" ||
      request.action === "admin" ||
      request.action === "network";

    if (isMutatingAction && decision === "ALLOW") {
      decision = "ESCALATE";
      requiredActions.push("mutating_action_requires_review");
      reasons.push("fail_closed_default_for_mutating_action");
    }

    const decisionId = `dec_${crypto.randomUUID()}`;
    const ledgerEntry = await this.ledgerManager.appendEntry({
      eventType: "EVALUATION_ROUTED",
      agentDid: request.actorId,
      artifactPath: request.targetPath,
      riskGrade,
      payload: {
        requestId: request.requestId,
        decisionId,
        action: request.action,
        decision,
        tier,
        triage,
      },
    });

    let response = DecisionResponseSchema.parse({
      requestId: request.requestId,
      decisionId,
      auditEventId: `ledger:${ledgerEntry.id}`,
      decision,
      riskGrade,
      evaluationTier: tier,
      reasons,
      requiredActions,
      policyVersion: this.cachedPolicyVersion,
      evaluatedAt: new Date().toISOString(),
    });

    // Agent OS post-evaluation: Victor enriches response with stance
    if (this.agentOS) {
      response = await this.agentOS.postEvaluate(request, response);
    }

    this.replayCache.set(replayKey, {
      fingerprint,
      response,
      expiresAt: nowMs + this.replayTtlMs,
    });

    return response;
  }

  private computePolicyVersion(policyDir: string): string {
    const files = ["risk_grading.json", "citation_policy.json", "trust_dynamics.json"];
    const hash = crypto.createHash("sha256");
    for (const file of files) {
      const fullPath = path.join(policyDir, file);
      if (!fs.existsSync(fullPath)) continue;
      hash.update(fs.readFileSync(fullPath, "utf-8"));
    }
    return hash.digest("hex");
  }

  private requestFingerprint(request: DecisionRequest): string {
    return crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          actorId: request.actorId,
          action: request.action,
          targetPath: request.targetPath,
          content: request.content ?? "",
          context: request.context ?? {},
        }),
      )
      .digest("hex");
  }

  private pruneReplayCache(nowMs: number): void {
    for (const [key, value] of this.replayCache.entries()) {
      if (value.expiresAt <= nowMs) {
        this.replayCache.delete(key);
      }
    }
  }
}

