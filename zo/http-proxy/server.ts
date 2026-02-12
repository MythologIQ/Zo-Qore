import * as crypto from "crypto";
import * as http from "http";
import * as path from "path";
import { ZodError } from "zod";
import { RuntimeError } from "../../runtime/service/errors";
import { QoreRuntimeService } from "../../runtime/service/QoreRuntimeService";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { ActorKeyring } from "../security/actor-keyring";
import { verifyActorProof } from "../security/actor-proof";
import { ZoAskRequest, ZoAskRequestSchema } from "@mythologiq/qore-contracts/schemas/ZoApiTypes";
import { ZoApiForwarder, ZoApiTimeoutError, ZoApiUpstreamError } from "./forwarder";
import { extractModelId, toDecisionRequest } from "./translator";
import { MemoryReplayStore, ReplayStoreCloseable, SqliteReplayStore } from "../security/replay-store";
import { createPromptTransparencyEvent, logPromptTransparency } from "../prompt-transparency";

export interface ZoHttpProxyOptions {
  host?: string;
  port?: number;
  apiKey?: string;
  requireAuth?: boolean;
  requireSignedActor?: boolean;
  actorSigningKey?: string;
  actorKeys?: Record<string, string>;
  maxBodyBytes?: number;
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
}

export class ZoHttpProxyServer {
  private server: http.Server | undefined;
  private replayStore: ReplayStoreCloseable | undefined;

  constructor(
    private readonly runtime: QoreRuntimeService,
    private readonly ledger: LedgerManager,
    private readonly forwarder: ZoApiForwarder,
    private readonly options: ZoHttpProxyOptions = {},
  ) {}

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
    this.replayStore = this.buildReplayStore();

    this.server = http.createServer(async (req, res) => {
      const traceId = `trace_${crypto.randomUUID()}`;
      try {
        if ((req.method ?? "GET") !== "POST" || (req.url ?? "/") !== "/zo/ask") {
          return this.sendJson(res, 404, { error: { code: "NOT_FOUND", traceId } });
        }

        this.ensureAuthorized(req, requireAuth, apiKey);
        const rawBody = await this.readBody(req, this.options.maxBodyBytes ?? 128 * 1024);
        const parsed = ZoAskRequestSchema.parse(JSON.parse(rawBody) as unknown);
        const actorId = this.extractActorId(req);
        this.verifySignedActorContext(req, actorId, rawBody, requireSignedActor, keyring);
        const model = this.resolveModelId(parsed);
        this.enforceModelPolicy(model);
        this.emitPromptEvent({
          stage: "PROMPT_BUILD_STARTED",
          actorId,
          model,
          target: "zo/ask_prompt",
          content: parsed.prompt,
          traceId,
        });
        this.emitPromptEvent({
          stage: "PROMPT_BUILD_COMPLETED",
          actorId,
          model,
          target: "zo/ask_prompt",
          content: parsed.prompt,
          traceId,
        });
        const decision = await this.runtime.evaluate(toDecisionRequest(parsed, actorId));

        if (decision.decision !== "ALLOW") {
          this.emitPromptEvent({
            stage: "PROMPT_DISPATCH_BLOCKED",
            actorId,
            model,
            target: "zo/ask_prompt",
            content: parsed.prompt,
            traceId,
            reason: decision.decision,
          });
          await this.ledger.appendEntry({
            eventType: "AUDIT_FAIL",
            agentDid: actorId,
            artifactPath: "zo/http_api",
            riskGrade: decision.riskGrade,
            payload: {
              traceId,
              decisionId: decision.decisionId,
              governanceDecision: decision.decision,
              requiredActions: decision.requiredActions,
            },
          });
          return this.sendJson(res, 403, {
            error: {
              code: "GOVERNANCE_DENY",
              message: `Governance ${decision.decision.toLowerCase()}`,
              traceId,
              decisionId: decision.decisionId,
              requiredActions: decision.requiredActions,
            },
          });
        }

        this.emitPromptEvent({
          stage: "PROMPT_DISPATCHED",
          actorId,
          model,
          target: "zo/ask_prompt",
          content: parsed.prompt,
          traceId,
        });
        const upstream = await this.forwarder.forward(rawBody);
        await this.ledger.appendEntry({
          eventType: "AUDIT_PASS",
          agentDid: actorId,
          artifactPath: "zo/http_api",
          riskGrade: decision.riskGrade,
          payload: {
            traceId,
            decisionId: decision.decisionId,
            upstreamStatus: upstream.statusCode,
          },
        });
        this.sendJson(res, upstream.statusCode, upstream.body);
      } catch (error) {
        this.handleError(res, traceId, error);
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
    this.replayStore?.close?.();
    this.replayStore = undefined;
  }

  getAddress(): { host: string; port: number } {
    if (!this.server) throw new Error("HTTP proxy is not started");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Invalid proxy server address");
    return { host: address.address, port: address.port };
  }

  private async readBody(req: http.IncomingMessage, maxBodyBytes: number): Promise<string> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const next = Buffer.from(chunk);
      total += next.byteLength;
      if (total > maxBodyBytes) {
        throw new RuntimeError("PAYLOAD_TOO_LARGE", "Zo HTTP payload too large", { maxBodyBytes });
      }
      chunks.push(next);
    }
    return Buffer.concat(chunks).toString("utf-8");
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

  private extractActorId(req: http.IncomingMessage): string {
    const actor = req.headers["x-actor-id"];
    if (typeof actor === "string" && actor.length > 0) return actor;
    return "did:myth:unknown:zo-http";
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
    if (!secret) throw new RuntimeError("AUTH_REQUIRED", "Unknown actor key id");
    const ok = verifyActorProof({ actorId, actorKid, actorTs, actorNonce, actorSig }, rawBody, secret);
    if (!ok) throw new RuntimeError("AUTH_REQUIRED", "Invalid actor signature");
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

  private handleError(res: http.ServerResponse, traceId: string, error: unknown): void {
    if (this.isZodError(error)) {
      return this.sendJson(res, 422, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid Zo ask payload",
          traceId,
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      });
    }
    if (error instanceof ZoApiTimeoutError) {
      return this.sendJson(res, 504, {
        error: { code: "UPSTREAM_TIMEOUT", message: error.message, traceId },
      });
    }
    if (error instanceof ZoApiUpstreamError) {
      return this.sendJson(res, 502, {
        error: {
          code: "UPSTREAM_REJECTED",
          message: error.message,
          traceId,
          statusCode: error.statusCode,
        },
      });
    }
    if (error instanceof RuntimeError && error.code === "AUTH_REQUIRED") {
      return this.sendJson(res, 401, {
        error: { code: "UNAUTHORIZED", message: error.message, traceId },
      });
    }
    if (error instanceof RuntimeError && error.code === "PAYLOAD_TOO_LARGE") {
      return this.sendJson(res, 413, {
        error: { code: "PAYLOAD_TOO_LARGE", message: error.message, traceId, details: error.details },
      });
    }
    if (error instanceof RuntimeError && error.code === "REPLAY_CONFLICT") {
      return this.sendJson(res, 409, {
        error: { code: "REPLAY_CONFLICT", message: error.message, traceId, details: error.details },
      });
    }
    if (error instanceof RuntimeError && error.code === "MODEL_REQUIRED") {
      return this.sendJson(res, 422, {
        error: { code: "MODEL_REQUIRED", message: error.message, traceId, details: error.details },
      });
    }
    if (error instanceof RuntimeError && error.code === "MODEL_NOT_ALLOWED") {
      return this.sendJson(res, 403, {
        error: { code: "MODEL_NOT_ALLOWED", message: error.message, traceId, details: error.details },
      });
    }
    if (error instanceof SyntaxError) {
      return this.sendJson(res, 400, {
        error: { code: "BAD_JSON", message: "Request body is not valid JSON", traceId },
      });
    }
    return this.sendJson(res, 500, {
      error: { code: "INTERNAL_ERROR", message: "Unhandled server error", traceId },
    });
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

  private buildActorKeyring(): ActorKeyring {
    const keyring = ActorKeyring.fromEnv(process.env.QORE_ACTOR_KEYS);
    if (this.options.actorKeys) {
      for (const [kid, secret] of Object.entries(this.options.actorKeys)) {
        keyring.set(kid, secret);
      }
    }
    const single = this.options.actorSigningKey ?? process.env.QORE_ACTOR_SIGNING_KEY;
    if (single) keyring.set("default", single);
    return keyring;
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
        tableName: this.options.replayProtection?.sqliteTable ?? "http_proxy_actor_replay",
      });
    }
    return new MemoryReplayStore({
      maxEntries: this.options.replayProtection?.maxEntries ?? 20_000,
    });
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  }

  private resolveModelId(body: ZoAskRequest): string {
    const model = extractModelId(body);
    return model ?? "unknown";
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
      surface: "zo_http_api",
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
}

