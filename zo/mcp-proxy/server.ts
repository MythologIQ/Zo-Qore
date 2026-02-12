import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as tls from "tls";
import { ZodError } from "zod";
import { McpRequest, McpRequestSchema, McpResponse } from "@mythologiq/qore-contracts/schemas/McpTypes";
import { QoreRuntimeService } from "../../runtime/service/QoreRuntimeService";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { RuntimeError } from "../../runtime/service/errors";
import {
  McpForwarder,
  UpstreamHttpError,
  UpstreamProtocolError,
  UpstreamTimeoutError,
} from "./forwarder";
import { extractMcpModelId, isReadOnlyMcpRequest, toDecisionRequest } from "./translator";
import { buildActorProof, verifyActorProof } from "../security/actor-proof";
import { ActorKeyring } from "../security/actor-keyring";
import { ProxyRateLimiter, RateLimiter, SqliteRateLimiter } from "./rate-limit";
import { ProxyMetrics } from "./metrics";
import { HttpMetricsSink, MetricsSink } from "./metrics-sink";
import {
  certificateMatchesActorId,
  extractActorIdsFromCertificate,
  getPeerCertificate,
} from "../security/mtls-actor-binding";
import { MemoryReplayStore, ReplayStoreCloseable, SqliteReplayStore } from "../security/replay-store";
import { createPromptTransparencyEvent, logPromptTransparency } from "../prompt-transparency";
import {
  recommendModel,
  resolveCatalog,
  ZoModelCatalogEntry,
  ZoModelSelectionMode,
  ZoModelSelectionResult,
} from "../model-selection";

interface CloseableRateLimiter extends RateLimiter {
  close?: () => void;
}

export interface ZoMcpProxyOptions {
  host?: string;
  port?: number;
  apiKey?: string;
  requireAuth?: boolean;
  requireSignedActor?: boolean;
  actorSigningKey?: string;
  actorKeys?: Record<string, string>;
  readOnlyRetryTools?: string[];
  rateLimit?: {
    enabled?: boolean;
    maxRequests: number;
    windowMs: number;
    strategy?: "memory" | "sqlite";
    sqlitePath?: string;
    sqliteTable?: string;
  };
  metrics?: {
    sink?: {
      enabled?: boolean;
      url: string;
      apiKey?: string;
      timeoutMs?: number;
      minIntervalMs?: number;
    };
  };
  tls?: {
    enabled: boolean;
    certPath: string;
    keyPath: string;
    caPath?: string;
    requireClientCert?: boolean;
    bindActorToCertificate?: boolean;
  };
  replayProtection?: {
    enabled?: boolean;
    ttlMs?: number;
    strategy?: "memory" | "sqlite";
    sqlitePath?: string;
    sqliteTable?: string;
    maxEntries?: number;
  };
  modelPolicy?: {
    enforce?: boolean;
    requireModel?: boolean;
    allowedModels?: string[];
  };
  promptTransparency?: {
    enabled?: boolean;
    profile?: string;
  };
  modelSelection?: {
    mode?: ZoModelSelectionMode;
    catalog?: ZoModelCatalogEntry[];
  };
}

export class ZoMcpProxyServer {
  private server: http.Server | undefined;
  private readonly readOnlyTools: ReadonlySet<string>;
  private readonly metrics = new ProxyMetrics();
  private limiter: CloseableRateLimiter | undefined;
  private metricsSink: MetricsSink | undefined;
  private lastMetricsPublishAt = 0;
  private metricsPublishInFlight = false;
  private replayStore: ReplayStoreCloseable | undefined;

  constructor(
    private readonly runtime: QoreRuntimeService,
    private readonly ledger: LedgerManager,
    private readonly forwarder: McpForwarder,
    private readonly options: ZoMcpProxyOptions = {},
  ) {
    this.readOnlyTools = new Set(options.readOnlyRetryTools ?? ["read_file", "list_files", "get_status"]);
  }

  async start(): Promise<void> {
    if (this.server) return;
    const requireAuth = this.options.requireAuth ?? true;
    const apiKey = this.options.apiKey ?? process.env.QORE_PROXY_API_KEY;
    const requireSignedActor = this.options.requireSignedActor ?? true;
    const keyring = this.buildActorKeyring();
    if (requireAuth && !apiKey) {
      throw new RuntimeError("AUTH_REQUIRED", "QORE_PROXY_API_KEY or proxy apiKey option is required");
    }
    if (requireSignedActor && !keyring.hasAny()) {
      throw new RuntimeError("AUTH_REQUIRED", "Actor signing keys are required");
    }
    this.limiter = this.buildRateLimiter();
    this.metricsSink = this.buildMetricsSink();
    this.replayStore = this.buildReplayStore();

    this.server = this.createServer(async (req, res) => {
      const traceId = `trace_${crypto.randomUUID()}`;
      let responseId: McpRequest["id"] = null;
      try {
        if ((req.method ?? "GET") === "GET" && (req.url ?? "/") === "/metrics") {
          this.ensureAuthorized(req, requireAuth, apiKey);
          return this.sendJson(res, 200, this.metrics.snapshot());
        }

        if ((req.method ?? "GET") !== "POST" || (req.url ?? "/") !== "/mcp") {
          return this.sendJsonRpcError(res, null, -32601, "Method not found", traceId);
        }

        this.metrics.incTotal();
        this.ensureAuthorized(req, requireAuth, apiKey);
        const actorId = this.resolveActorId(req);

        if (this.limiter) {
          const key = this.rateLimitKey(req, actorId);
          if (!this.limiter.allow(key)) {
            this.metrics.incRateLimited();
            return this.sendJsonRpcError(res, null, -32040, "Rate limit exceeded", traceId);
          }
        }

        const body = await this.readJsonBody(req, 256 * 1024);
        const mcpRequest = McpRequestSchema.parse(body.parsed);
        responseId = mcpRequest.id ?? null;
        this.verifyMutualTlsActorBinding(req, actorId);
        this.verifySignedActorContext(req, actorId, body.rawBody, requireSignedActor, keyring);
        const selected = this.applyModelSelection(mcpRequest);
        const model = selected.model;
        this.enforceModelPolicy(model);
        const decisionRequest = toDecisionRequest(mcpRequest, actorId);
        this.emitPromptEvent({
          stage: "PROMPT_BUILD_STARTED",
          actorId,
          model,
          target: decisionRequest.targetPath,
          content: decisionRequest.content ?? "",
          traceId,
        });
        this.emitPromptEvent({
          stage: "PROMPT_BUILD_COMPLETED",
          actorId,
          model,
          target: decisionRequest.targetPath,
          content: decisionRequest.content ?? "",
          traceId,
        });
        const decision = await this.runtime.evaluate(decisionRequest);

        if (decision.decision !== "ALLOW") {
          this.metrics.incBlocked();
          this.emitPromptEvent({
            stage: "PROMPT_DISPATCH_BLOCKED",
            actorId,
            model,
            target: decisionRequest.targetPath,
            content: decisionRequest.content ?? "",
            traceId,
            reason: decision.decision,
          });
          await this.ledger.appendEntry({
            eventType: "AUDIT_FAIL",
            agentDid: actorId,
            artifactPath: decisionRequest.targetPath,
            riskGrade: decision.riskGrade,
            payload: {
              traceId,
              requestId: decision.requestId,
              decisionId: decision.decisionId,
              governanceDecision: decision.decision,
              requiredActions: decision.requiredActions,
            },
          });
          const code = decision.decision === "DENY" ? -32011 : -32010;
          return this.sendJsonRpcError(
            res,
            mcpRequest.id ?? null,
            code,
            `Governance ${decision.decision.toLowerCase()}`,
            traceId,
            {
              decisionId: decision.decisionId,
              auditEventId: decision.auditEventId,
              requiredActions: decision.requiredActions,
              modelRecommendation: selected.recommendation?.selectedModel,
              modelEstimatedCostUsd: selected.recommendation?.estimatedCostUsd,
              modelBaseline: selected.recommendation?.baselineModel,
              modelBaselineCostUsd: selected.recommendation?.baselineCostUsd,
              modelCostSavedUsd: selected.recommendation?.costSavedUsd,
              modelCostSavedPercent: selected.recommendation?.costSavedPercent,
              modelTokenUtilizationPercent: selected.recommendation?.tokenUtilizationPercent,
            },
          );
        }

        const canRetry = isReadOnlyMcpRequest(mcpRequest, this.readOnlyTools);
        this.emitPromptEvent({
          stage: "PROMPT_DISPATCHED",
          actorId,
          model,
          target: decisionRequest.targetPath,
          content: decisionRequest.content ?? "",
          traceId,
        });
        const upstream = await this.forwarder.forward(mcpRequest, canRetry);
        if (upstream.error) {
          this.metrics.incBlocked();
        } else {
          this.metrics.incAllowed();
        }

        await this.ledger.appendEntry({
          eventType: upstream.error ? "AUDIT_FAIL" : "AUDIT_PASS",
          agentDid: actorId,
          artifactPath: decisionRequest.targetPath,
          riskGrade: decision.riskGrade,
          payload: {
            traceId,
            decisionId: decision.decisionId,
            upstreamHasError: Boolean(upstream.error),
            mcpMethod: mcpRequest.method,
          },
        });

        this.sendJson(res, 200, upstream);
      } catch (error) {
        this.handleError(res, traceId, responseId, error);
      } finally {
        void this.publishMetricsIfDue();
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.options.port ?? 0, this.options.host ?? "127.0.0.1", () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
    this.limiter?.close?.();
    this.limiter = undefined;
    this.metricsSink = undefined;
    this.replayStore?.close?.();
    this.replayStore = undefined;
  }

  getAddress(): { host: string; port: number } {
    if (!this.server) throw new Error("Proxy server is not started");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Invalid proxy server address");
    return {
      host: address.address,
      port: address.port,
    };
  }

  private async readJsonBody(
    req: http.IncomingMessage,
    maxBodyBytes: number,
  ): Promise<{ rawBody: string; parsed: unknown }> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const next = Buffer.from(chunk);
      total += next.byteLength;
      if (total > maxBodyBytes) {
        throw new RuntimeError("PAYLOAD_TOO_LARGE", "MCP payload too large", { maxBodyBytes });
      }
      chunks.push(next);
    }
    if (chunks.length === 0) return { rawBody: "{}", parsed: {} };
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    try {
      return { rawBody, parsed: JSON.parse(rawBody) };
    } catch {
      throw new RuntimeError("EVALUATION_FAILED", "Request body is not valid JSON");
    }
  }

  private ensureAuthorized(
    req: http.IncomingMessage,
    requireAuth: boolean,
    apiKey: string | undefined,
  ): void {
    if (!requireAuth) return;
    const candidate = req.headers["x-qore-api-key"];
    if (typeof candidate !== "string" || !apiKey || candidate !== apiKey) {
      throw new RuntimeError("AUTH_REQUIRED", "Missing or invalid API key");
    }
  }

  private resolveActorId(req: http.IncomingMessage): string {
    const headerActor = req.headers["x-actor-id"];
    const actorFromHeader = typeof headerActor === "string" && headerActor.length > 0 ? headerActor : undefined;
    const actorFromCertificate = this.extractActorIdFromCertificate(req);
    if (actorFromCertificate && actorFromHeader && actorFromCertificate !== actorFromHeader) {
      throw new RuntimeError("AUTH_REQUIRED", "Actor header and certificate identity mismatch");
    }
    return actorFromCertificate ?? actorFromHeader ?? "did:myth:unknown:proxy";
  }

  private verifySignedActorContext(
    req: http.IncomingMessage,
    actorId: string,
    rawBody: string,
    requireSignedActor: boolean,
    keyring: ActorKeyring,
  ): void {
    if (!requireSignedActor) return;
    const actorKid = req.headers["x-actor-kid"];
    const actorTs = req.headers["x-actor-ts"];
    const actorNonce = req.headers["x-actor-nonce"];
    const actorSig = req.headers["x-actor-sig"];
    if (
      typeof actorKid !== "string" ||
      typeof actorTs !== "string" ||
      typeof actorNonce !== "string" ||
      typeof actorSig !== "string"
    ) {
      throw new RuntimeError("AUTH_REQUIRED", "Missing signed actor context");
    }
    const secret = keyring.get(actorKid);
    if (!secret) {
      throw new RuntimeError("AUTH_REQUIRED", "Unknown actor key id");
    }
    const ok = verifyActorProof(
      {
        actorId,
        actorKid,
        actorTs,
        actorNonce,
        actorSig,
      },
      rawBody,
      secret,
    );
    if (!ok) {
      throw new RuntimeError("AUTH_REQUIRED", "Invalid actor signature");
    }
    this.rememberActorNonce(actorId, actorNonce);
  }

  private rememberActorNonce(actorId: string, nonce: string): void {
    if (!this.replayStore) return;
    const remembered = this.replayStore.remember(
      actorId,
      nonce,
      this.options.replayProtection?.ttlMs ?? 5 * 60 * 1000,
    );
    if (!remembered) {
      throw new RuntimeError("REPLAY_CONFLICT", "Actor nonce replayed", { actorId });
    }
  }

  private verifyMutualTlsActorBinding(req: http.IncomingMessage, actorId: string): void {
    if (!this.isMutualTlsActorBindingRequired()) return;
    const socket = req.socket as tls.TLSSocket;
    if (!socket.authorized) {
      throw new RuntimeError("AUTH_REQUIRED", "Unauthorized client certificate");
    }
    const cert = getPeerCertificate(socket);
    if (!cert) {
      throw new RuntimeError("AUTH_REQUIRED", "Missing client certificate");
    }
    if (!certificateMatchesActorId(cert, actorId)) {
      throw new RuntimeError("AUTH_REQUIRED", "Actor identity does not match client certificate");
    }
  }

  private extractActorIdFromCertificate(req: http.IncomingMessage): string | undefined {
    if (!this.isMutualTlsActorBindingRequired()) return undefined;
    const socket = req.socket as tls.TLSSocket;
    if (!socket.authorized) {
      throw new RuntimeError("AUTH_REQUIRED", "Unauthorized client certificate");
    }
    const cert = getPeerCertificate(socket);
    if (!cert) {
      throw new RuntimeError("AUTH_REQUIRED", "Missing client certificate");
    }
    const candidates = extractActorIdsFromCertificate(cert);
    if (candidates.length === 0) {
      throw new RuntimeError("AUTH_REQUIRED", "Client certificate has no actor identity");
    }
    return candidates[0];
  }

  private isMutualTlsActorBindingRequired(): boolean {
    return Boolean(
      this.options.tls?.enabled &&
        this.options.tls.requireClientCert &&
        (this.options.tls.bindActorToCertificate ?? true),
    );
  }

  private handleError(
    res: http.ServerResponse,
    traceId: string,
    id: McpRequest["id"] | null,
    error: unknown,
  ): void {
    if (this.isZodError(error)) {
      return this.sendJsonRpcError(res, id, -32602, "Invalid params", traceId, {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (error instanceof UpstreamTimeoutError) {
      this.metrics.incUpstreamTimeout();
      return this.sendJsonRpcError(res, id, -32020, "Upstream timeout", traceId);
    }
    if (error instanceof UpstreamHttpError) {
      this.metrics.incUpstreamRejected();
      return this.sendJsonRpcError(res, id, -32021, "Upstream rejected request", traceId, {
        statusCode: error.statusCode,
      });
    }
    if (error instanceof UpstreamProtocolError) {
      this.metrics.incUpstreamProtocolError();
      return this.sendJsonRpcError(res, id, -32022, "Upstream invalid response", traceId);
    }

    if (error instanceof RuntimeError) {
      if (error.code === "AUTH_REQUIRED") {
        this.metrics.incUnauthorized();
        return this.sendJsonRpcError(res, id, -32030, "Unauthorized", traceId);
      }
      if (error.code === "PAYLOAD_TOO_LARGE") {
        return this.sendJsonRpcError(res, id, -32031, "Payload too large", traceId, error.details);
      }
      if (error.code === "REPLAY_CONFLICT") {
        this.metrics.incBlocked();
        return this.sendJsonRpcError(res, id, -32032, "Replay conflict", traceId, error.details);
      }
      if (error.code === "MODEL_REQUIRED") {
        this.metrics.incBlocked();
        return this.sendJsonRpcError(res, id, -32033, "Model selection required", traceId, error.details);
      }
      if (error.code === "MODEL_NOT_ALLOWED") {
        this.metrics.incBlocked();
        return this.sendJsonRpcError(res, id, -32034, "Model not allowed", traceId, error.details);
      }
      return this.sendJsonRpcError(res, id, -32000, error.message, traceId, error.details);
    }

    this.metrics.incInternalError();
    this.sendJsonRpcError(res, id, -32603, "Internal error", traceId);
  }

  private isZodError(error: unknown): error is ZodError {
    return (
      error instanceof ZodError ||
      (typeof error === "object" &&
        error !== null &&
        "issues" in error &&
        Array.isArray((error as { issues?: unknown }).issues))
    );
  }

  private createServer(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): http.Server {
    if (!this.options.tls?.enabled) {
      return http.createServer(handler);
    }
    const tlsOptions: https.ServerOptions = {
      cert: fs.readFileSync(this.options.tls.certPath),
      key: fs.readFileSync(this.options.tls.keyPath),
      requestCert: Boolean(this.options.tls.requireClientCert),
      rejectUnauthorized: Boolean(this.options.tls.requireClientCert),
    };
    if (this.options.tls.caPath) {
      tlsOptions.ca = fs.readFileSync(this.options.tls.caPath);
    }
    return https.createServer(tlsOptions, (req, res) => {
      if (this.options.tls?.requireClientCert) {
        const socket = req.socket as tls.TLSSocket;
        if (!socket.authorized) {
          return this.sendJsonRpcError(res, null, -32030, "Unauthorized client certificate", "trace_tls");
        }
      }
      return handler(req, res);
    });
  }

  private buildActorKeyring(): ActorKeyring {
    const keyring = ActorKeyring.fromEnv(process.env.QORE_ACTOR_KEYS);
    if (this.options.actorKeys) {
      for (const [kid, secret] of Object.entries(this.options.actorKeys)) {
        keyring.set(kid, secret);
      }
    }
    const single = this.options.actorSigningKey ?? process.env.QORE_ACTOR_SIGNING_KEY;
    if (single) {
      keyring.set("default", single);
    }
    return keyring;
  }

  private buildRateLimiter(): CloseableRateLimiter | undefined {
    if (this.options.rateLimit?.enabled === false) return undefined;
    const maxRequests = this.options.rateLimit?.maxRequests ?? 120;
    const windowMs = this.options.rateLimit?.windowMs ?? 60_000;
    const strategy = this.options.rateLimit?.strategy ?? "memory";
    if (strategy === "sqlite") {
      const sqlitePath = this.options.rateLimit?.sqlitePath;
      if (!sqlitePath) {
        throw new RuntimeError("EVALUATION_FAILED", "rateLimit.sqlitePath is required for sqlite strategy");
      }
      return new SqliteRateLimiter({
        dbPath: sqlitePath,
        maxRequests,
        windowMs,
        tableName: this.options.rateLimit?.sqliteTable,
      });
    }
    return new ProxyRateLimiter({ maxRequests, windowMs });
  }

  private buildMetricsSink(): MetricsSink | undefined {
    const sink = this.options.metrics?.sink;
    if (!sink || sink.enabled === false) return undefined;
    return new HttpMetricsSink({
      url: sink.url,
      apiKey: sink.apiKey,
      timeoutMs: sink.timeoutMs,
    });
  }

  private buildReplayStore(): ReplayStoreCloseable | undefined {
    if (this.options.replayProtection?.enabled === false) return undefined;
    const strategy = this.options.replayProtection?.strategy ?? "sqlite";
    if (strategy === "sqlite") {
      const sqlitePath =
        this.options.replayProtection?.sqlitePath ??
        process.env.QORE_REPLAY_DB_PATH ??
        path.join(process.cwd(), ".failsafe", "ledger", "replay-protection.db");
      return new SqliteReplayStore({
        dbPath: sqlitePath,
        tableName: this.options.replayProtection?.sqliteTable ?? "mcp_proxy_actor_replay",
      });
    }
    return new MemoryReplayStore({
      maxEntries: this.options.replayProtection?.maxEntries ?? 20_000,
    });
  }

  private async publishMetricsIfDue(): Promise<void> {
    if (!this.metricsSink) return;
    if (this.metricsPublishInFlight) return;
    const minIntervalMs = this.options.metrics?.sink?.minIntervalMs ?? 5000;
    const now = Date.now();
    if (now - this.lastMetricsPublishAt < minIntervalMs) {
      return;
    }
    this.metricsPublishInFlight = true;
    try {
      await this.metricsSink.publish(this.metrics.snapshot());
      this.lastMetricsPublishAt = now;
    } catch {
      this.metrics.incSinkPublishFailure();
    } finally {
      this.metricsPublishInFlight = false;
    }
  }

  private rateLimitKey(req: http.IncomingMessage, actorId: string): string {
    if (actorId && actorId !== "did:myth:unknown:proxy") return `actor:${actorId}`;
    return `ip:${req.socket.remoteAddress ?? "unknown"}`;
  }

  private enforceModelPolicy(model: string): void {
    const enforce = this.options.modelPolicy?.enforce ?? true;
    if (!enforce) return;
    const requireModel = this.options.modelPolicy?.requireModel ?? true;
    const allowlist = this.resolveAllowedModels();
    if (requireModel && model === "unknown") {
      throw new RuntimeError("MODEL_REQUIRED", "Model selection is required for Zo direct mode");
    }
    if (allowlist.size > 0 && !allowlist.has(model)) {
      throw new RuntimeError("MODEL_NOT_ALLOWED", "Model is not allowed by Zo model policy", {
        model,
      });
    }
  }

  private resolveAllowedModels(): ReadonlySet<string> {
    const fromOptions = this.options.modelPolicy?.allowedModels ?? [];
    if (fromOptions.length > 0) return new Set(fromOptions);
    const fromEnv = process.env.QORE_ZO_ALLOWED_MODELS;
    if (!fromEnv) return new Set<string>();
    return new Set(
      fromEnv
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  }

  private emitPromptEvent(input: {
    stage: "PROMPT_BUILD_STARTED" | "PROMPT_BUILD_COMPLETED" | "PROMPT_DISPATCHED" | "PROMPT_DISPATCH_BLOCKED";
    actorId: string;
    model: string;
    target: string;
    content: string;
    traceId: string;
    reason?: string;
  }): void {
    if (this.options.promptTransparency?.enabled === false) return;
    const event = createPromptTransparencyEvent({
      stage: input.stage,
      surface: "zo_mcp",
      actorId: input.actorId,
      model: input.model,
      target: input.target,
      content: input.content,
      traceId: input.traceId,
      profile: this.options.promptTransparency?.profile ?? "zo-direct",
      reason: input.reason,
    });
    logPromptTransparency(event);
    void this.ledger.appendEntry({
      eventType: "SYSTEM_EVENT",
      agentDid: input.actorId,
      payload: {
        type: "prompt_transparency",
        ...event,
      },
    });
  }

  private applyModelSelection(
    request: McpRequest,
  ): { model: string; recommendation?: ZoModelSelectionResult } {
    const mode = this.options.modelSelection?.mode ?? "manual";
    const currentModel = extractMcpModelId(request) ?? "unknown";
    const content = this.extractSelectionContent(request);
    const catalog = resolveCatalog(this.options.modelSelection?.catalog);
    const recommendation = recommendModel({
      content,
      mode,
      currentModel: currentModel === "unknown" ? undefined : currentModel,
      catalog,
      baselineModelId: process.env.QORE_ZO_BASELINE_MODEL,
    });
    if (!recommendation) {
      return { model: currentModel };
    }
    if (mode === "auto") {
      this.setMcpModel(request, recommendation.selectedModel);
      return { model: recommendation.selectedModel, recommendation };
    }
    return { model: currentModel, recommendation };
  }

  private extractSelectionContent(request: McpRequest): string {
    if (!request.params || typeof request.params !== "object") return request.method;
    const params = request.params as Record<string, unknown>;
    const args = (params.arguments as Record<string, unknown> | undefined) ?? params;
    const maybeText = args.content ?? args.text ?? args.body ?? args.patch ?? args.prompt;
    if (typeof maybeText === "string" && maybeText.length > 0) return maybeText;
    return request.method;
  }

  private setMcpModel(request: McpRequest, model: string): void {
    if (!request.params || typeof request.params !== "object") {
      request.params = { model };
      return;
    }
    const params = request.params as Record<string, unknown>;
    if (params.arguments && typeof params.arguments === "object") {
      const args = params.arguments as Record<string, unknown>;
      args.model = model;
      params.arguments = args;
      request.params = params;
      return;
    }
    params.model = model;
    request.params = params;
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  }

  private sendJsonRpcError(
    res: http.ServerResponse,
    id: McpRequest["id"] | undefined,
    code: number,
    message: string,
    traceId: string,
    data?: Record<string, unknown>,
  ): void {
    const payload: McpResponse = {
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code,
        message,
        data: { traceId, ...(data ?? {}) },
      },
    };
    this.sendJson(res, 200, payload);
  }
}

export function createActorProofHeaders(
  actorId: string,
  rawBody: string,
  actorSigningKey: string,
  actorKid: string = "default",
): { actorKid: string; actorTs: string; actorNonce: string; actorSig: string } {
  const actorTs = `${Date.now()}`;
  const actorNonce = crypto.randomUUID();
  const actorSig = buildActorProof(actorId, rawBody, actorTs, actorNonce, actorSigningKey);
  return { actorKid, actorTs, actorNonce, actorSig };
}

