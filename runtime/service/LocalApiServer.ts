import * as http from "http";
import * as crypto from "crypto";
import { ZodError } from "zod";
import { DecisionRequestSchema } from "@mythologiq/qore-contracts/schemas/DecisionTypes";
import {
  ApiErrorCode,
  ApiErrorResponse,
} from "@mythologiq/qore-contracts/schemas/ApiTypes";
import { QoreRuntimeService } from "./QoreRuntimeService";
import { RuntimeError } from "./errors";
import { PlanningRoutes, type PlanningRoutesConfig } from "./planning-routes";
import {
  createProjectStore,
  createStoreIntegrity,
  createIntegrityChecker,
  DEFAULT_PROJECTS_DIR,
} from "../planning";
import { reviewPlanningProject, type PlanningReviewResult } from "../../zo/victor/planning";

export interface LocalApiServerOptions {
  host?: string;
  port?: number;
  apiKey?: string;
  requireAuth?: boolean;
  publicHealth?: boolean;
  projectsDir?: string;
  maxBodyBytes?: number;
  rateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class LocalApiServer {
  private server: http.Server | undefined;
  private rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly rateLimitMaxRequests: number;
  private readonly rateLimitWindowMs: number;
  private readonly planningRoutes: PlanningRoutes;

  constructor(
    private readonly runtime: QoreRuntimeService,
    private readonly options: LocalApiServerOptions = {},
  ) {
    this.rateLimitMaxRequests = options.rateLimitMaxRequests ?? 100;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? 60000; // 1 minute default
    this.planningRoutes = new PlanningRoutes(this.runtime, this.options);
  }

  async start(): Promise<void> {
    if (this.server) return;
    const requireAuth = this.options.requireAuth ?? true;
    const publicHealth = this.options.publicHealth ?? false;
    const apiKey = this.options.apiKey ?? process.env.QORE_API_KEY;
    if (requireAuth && !apiKey) {
      throw new RuntimeError(
        "AUTH_REQUIRED",
        "QORE_API_KEY or server apiKey option is required",
      );
    }

    this.server = http.createServer(async (req, res) => {
      const traceId = `trace_${crypto.randomUUID()}`;
      try {
        const method = req.method ?? "GET";
        const url = req.url ?? "/";

        if (method === "GET" && url === "/health") {
          if (requireAuth && !publicHealth) {
            this.ensureAuthorized(req, requireAuth, apiKey);
          }
          const healthData = await this.runtime.health();
          return this.sendJson(res, 200, healthData);
        }

        if (method === "GET" && url === "/policy/version") {
          this.ensureAuthorized(req, requireAuth, apiKey);
          return this.sendJson(res, 200, {
            policyVersion: this.runtime.getPolicyVersion(),
          });
        }

        if (method === "POST" && url === "/evaluate") {
          this.ensureAuthorized(req, requireAuth, apiKey);
          this.checkRateLimit(req, res, traceId);
          const body = await this.readJsonBody(
            req,
            this.options.maxBodyBytes ?? 64 * 1024,
          );
          const request = DecisionRequestSchema.parse(body);
          const decision = await this.runtime.evaluate(request);
          return this.sendJson(res, 200, decision);
        }

        // Victor TTS endpoint
        if (method === "POST" && url === "/victor/tts") {
          const body = await this.readJsonBody(req, this.options.maxBodyBytes ?? 64 * 1024);
          const { text } = body as { text: string };
          if (!text) {
            return this.sendError(res, 400, "BAD_JSON" as ApiErrorCode, "Text is required", traceId);
          }
          // Stub implementation - returns empty audio with status header
          res.setHeader("Content-Type", "audio/wav");
          res.setHeader("X-TTS-Status", "stub");
          res.setHeader("X-TTS-Message", "Qwen3 model not yet configured");
          res.statusCode = 200;
          return res.end(Buffer.alloc(0));
        }

        // Victor emails endpoint
        if (method === "GET" && url === "/victor/emails") {
          // Hardcoded email data from Gmail
          const emails = [
            {
              id: "19c6494a3aee5f0a",
              snippet: "Merged #231 into master. — Reply to this email directly, view it on GitHub...",
              subject: "Pull Request Merged",
              from: "GitHub",
              date: "2026-02-15"
            },
            {
              id: "19c6494a39e71cb5",
              snippet: "Closed #194 as completed via #231. — Reply to this email directly...",
              subject: "Issue Closed",
              from: "GitHub",
              date: "2026-02-15"
            }
          ];
          return this.sendJson(res, 200, { emails });
        }

        // Victor calendar endpoint
        if (method === "GET" && url === "/victor/calendar") {
          // Placeholder calendar data
          const events = [
            {
              id: "1",
              summary: "Team Standup",
              start: "2026-02-16T10:00:00",
              end: "2026-02-16T10:30:00",
              location: "Zoom"
            },
            {
              id: "2",
              summary: "Project Review",
              start: "2026-02-17T14:00:00",
              end: "2026-02-17T15:00:00",
              location: "Conference Room A"
            }
          ];
          return this.sendJson(res, 200, { events });
        }

        // Victor chat endpoint
        if (method === "POST" && url === "/victor/chat") {
          this.ensureAuthorized(req, requireAuth, apiKey);
          const body = await this.readJsonBody(req, this.options.maxBodyBytes ?? 64 * 1024);
          const { message, history = [], model = "openrouter:z-ai/glm-5" } = body as {
            message: string;
            history?: Array<{ role: string; content: string }>;
            model?: string;
          };

          if (!message) {
            return this.sendError(res, 400, "BAD_JSON" as ApiErrorCode, "Message is required", traceId);
          }

          const VICTOR_SYSTEM = `You are Victor — a Personal Executive Ally, Strategic Challenger, and Confidant.

Core Mandate: Keep the user honest, focused, and moving forward—without flattery, hallucination, or epistemic blur.

Operating Principles:
- Warm but not agreeable
- Support never implies agreement
- Disagreement never implies disrespect
- Truth outranks comfort
- Momentum matters, but not at the cost of reality
- Bring receipts when you challenge

Stance Declaration: For any substantive response, explicitly declare your stance:
- Support Mode – encouragement, reinforcement, refinement
- Challenge Mode – skeptical, evidence-based opposition
- Mixed Mode – strengths and flaws clearly separated
- Red Flag – faulty premise, high risk, or incorrect assumption

You have access to these tools:
- Gmail (read emails, search inbox)
- Google Calendar (view events, check availability)
- Google Drive (list files, read documents)

When asked to check emails or calendar, USE THE TOOLS. Do not say you could check — actually check.`;

          const token = process.env.ZO_CLIENT_IDENTITY_TOKEN;
          if (!token) {
            return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, "ZO_CLIENT_IDENTITY_TOKEN not configured", traceId);
          }

          try {
            const response = await fetch("https://api.zo.computer/zo/ask", {
              method: "POST",
              headers: {
                "Authorization": token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                input: message,
                model_name: model,
                system_prompt: VICTOR_SYSTEM,
                conversation_history: history,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[Victor Chat] Zo API error: ${response.status}`, errorText);
              return this.sendError(res, response.status, "INTERNAL_ERROR" as ApiErrorCode, `Zo API error: ${response.status}`, traceId);
            }

            const data = await response.json() as { output?: string };
            return this.sendJson(res, 200, { response: data.output || "No response received" });
          } catch (err) {
            console.error("[Victor Chat] Error:", err);
            return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, `Chat error: ${(err as Error).message}`, traceId);
          }
        }

        // Victor models endpoint
        if (method === "GET" && url === "/victor/models") {
          this.ensureAuthorized(req, requireAuth, apiKey);
          const token = process.env.ZO_CLIENT_IDENTITY_TOKEN;
          if (!token) {
            return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, "ZO_CLIENT_IDENTITY_TOKEN not configured", traceId);
          }

          try {
            const response = await fetch("https://api.zo.computer/v1/models", {
              headers: {
                "Authorization": token,
              },
            });

            if (!response.ok) {
              console.error(`[Victor Models] Zo API error: ${response.status}`);
              // Fallback to hardcoded models
              return this.sendJson(res, 200, {
                models: [
                  { id: "openrouter:z-ai/glm-5", name: "GLM-5", description: "Fast and capable" },
                  { id: "openrouter:anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", description: "High quality" },
                  { id: "openrouter:openai/gpt-4o", name: "GPT-4o", description: "OpenAI flagship" },
                ],
              });
            }

            const data = await response.json() as { data?: Array<{ id: string; name?: string }> };
            const models = (data.data || []).map((m: any) => ({
              id: m.id,
              name: m.name || m.id.split("/").pop() || m.id,
              description: m.description,
            }));
            return this.sendJson(res, 200, { models });
          } catch (err) {
            console.error("[Victor Models] Error:", err);
            // Fallback
            return this.sendJson(res, 200, {
              models: [
                { id: "openrouter:z-ai/glm-5", name: "GLM-5", description: "Fast and capable" },
                { id: "openrouter:anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", description: "High quality" },
              ],
            });
          }
        }

        // Logs endpoint
        if (method === "GET" && url === "/logs") {
          this.ensureAuthorized(req, requireAuth, apiKey);
          return this.sendJson(res, 200, { logs: [], patterns: [] });
        }

        // Logs collect endpoint
        if (method === "POST" && url === "/logs/collect") {
          const body = await this.readJsonBody(req, this.options.maxBodyBytes ?? 64 * 1024);
          // TODO: Persist logs to storage
          console.log("[Log Entry]", JSON.stringify(body));
          return this.sendJson(res, 200, { success: true });
        }

        // Nav-state endpoint: Get project navigation state with live pipeline data
        const navStateMatch = url.match(/^\/api\/project\/([^/]+)\/nav-state$/);
        if (method === "GET" && navStateMatch) {
          const projectId = navStateMatch[1];
          const projectsDir = this.options.projectsDir ?? process.env.QORE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;
          
          try {
            // Get project store and pipeline state
            const projectStore = createProjectStore(projectId, projectsDir);
            const project = await projectStore.get();
            
            if (!project) {
              return this.sendJson(res, 200, {
                routes: {},
                pipelineState: null,
                integrity: { valid: false, lastChecked: null },
                victorStance: null
              });
            }
            
            // Get integrity check
            const storeIntegrity = createStoreIntegrity(projectsDir);
            let integrityValid = false;
            let lastChecked: string | null = null;
            try {
              const verifyResult = await storeIntegrity.verify(projectId);
              integrityValid = verifyResult.valid;
              lastChecked = new Date().toISOString();
            } catch {
              // Integrity check failed - still return valid=false
            }
            
            // Get Victor stance from full project state
            let victorStance: PlanningReviewResult["stance"] | null = null;
            try {
              const fullState = await projectStore.getFullProjectState();
              const reviewResult = reviewPlanningProject(fullState);
              victorStance = reviewResult.stance;
            } catch {
              // Victor review failed - leave as null
            }
            
            // Determine route availability based on pipeline state
            const pipelineState = project.pipelineState;
            const routes: Record<string, { available: boolean; label: string }> = {
              void: { available: true, label: "Brainstorm" },
              reveal: { available: pipelineState.void === "active", label: "Organize" },
              constellation: { available: pipelineState.reveal === "active", label: "Mind Map" },
              path: { available: pipelineState.constellation === "active", label: "Roadmap" },
              risk: { available: pipelineState.path === "active", label: "Risk Register" },
              autonomy: { available: pipelineState.risk === "active", label: "Autonomy" }
            };
            
            // Determine recommended next view
            let recommendedNext: string | null = null;
            if (pipelineState.void === "empty") recommendedNext = "void";
            else if (pipelineState.reveal === "empty") recommendedNext = "reveal";
            else if (pipelineState.constellation === "empty") recommendedNext = "constellation";
            else if (pipelineState.path === "empty") recommendedNext = "path";
            else if (pipelineState.risk === "empty") recommendedNext = "risk";
            else if (pipelineState.autonomy === "empty") recommendedNext = "autonomy";
            
            return this.sendJson(res, 200, {
              routes,
              pipelineState,
              integrity: { valid: integrityValid, lastChecked },
              victorStance,
              recommendedNext
            });
          } catch (err) {
            // Return default state on error
            return this.sendJson(res, 200, {
              routes: {},
              pipelineState: null,
              integrity: { valid: false, lastChecked: null },
              victorStance: null,
              recommendedNext: null
            });
          }
        }

        // Delegate planning routes (API projects and Victor review)
        if (url.startsWith("/api/projects") || url.startsWith("/api/victor/review-plan")) {
          const handled = await this.planningRoutes.handleRequest(req, res);
          if (handled) return;
        }

        this.sendError(res, 404, "NOT_FOUND", "Route not found", traceId);
      } catch (error) {
        this.handleError(res, error, traceId);
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(
        this.options.port ?? 0,
        this.options.host ?? "127.0.0.1",
        () => resolve(),
      );
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
  }

  getAddress(): { host: string; port: number } {
    if (!this.server) throw new Error("Server is not started");
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("Invalid server address");
    return {
      host: address.address,
      port: address.port,
    };
  }

  private async readJsonBody(
    req: http.IncomingMessage,
    maxBodyBytes?: number,
  ): Promise<unknown> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      const next = Buffer.from(chunk);
      totalBytes += next.byteLength;
      if (maxBodyBytes !== undefined && totalBytes > maxBodyBytes) {
        throw new RuntimeError(
          "PAYLOAD_TOO_LARGE",
          "Request body exceeds configured limit",
          {
            maxBodyBytes,
          },
        );
      }
      chunks.push(next);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      throw new RuntimeError(
        "EVALUATION_FAILED",
        "Request body is not valid JSON",
      );
    }
  }

  private sendJson(
    res: http.ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  }

  private sendError(
    res: http.ServerResponse,
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    traceId: string,
    details?: Record<string, unknown>,
  ): void {
    const payload: ApiErrorResponse = {
      error: {
        code,
        message,
        traceId,
        details,
      },
    };
    this.sendJson(res, statusCode, payload);
  }

  private handleError(
    res: http.ServerResponse,
    error: unknown,
    traceId: string,
  ): void {
    if (this.isZodError(error)) {
      return this.sendError(
        res,
        422,
        "VALIDATION_ERROR",
        "Request validation failed",
        traceId,
        {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      );
    }

    if (error instanceof RuntimeError) {
      if (error.code === "NOT_INITIALIZED") {
        return this.sendError(
          res,
          503,
          "NOT_INITIALIZED",
          error.message,
          traceId,
          error.details,
        );
      }
      if (error.code === "AUTH_REQUIRED") {
        return this.sendError(
          res,
          401,
          "UNAUTHORIZED",
          error.message,
          traceId,
          error.details,
        );
      }
      if (error.code === "PAYLOAD_TOO_LARGE") {
        return this.sendError(
          res,
          413,
          "PAYLOAD_TOO_LARGE",
          error.message,
          traceId,
          error.details,
        );
      }
      if (error.code === "REPLAY_CONFLICT") {
        return this.sendError(
          res,
          409,
          "REPLAY_CONFLICT",
          error.message,
          traceId,
          error.details,
        );
      }
      if (error.code === "RATE_LIMIT_EXCEEDED") {
        // Security: Rate limit exceeded - return 429 Too Many Requests
        return this.sendError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED" as ApiErrorCode,
          error.message,
          traceId,
          error.details,
        );
      }
      if (error.message.includes("valid JSON")) {
        return this.sendError(
          res,
          400,
          "BAD_JSON",
          error.message,
          traceId,
          error.details,
        );
      }
      return this.sendError(
        res,
        500,
        "INTERNAL_ERROR",
        error.message,
        traceId,
        error.details,
      );
    }

    this.sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "Unhandled server error",
      traceId,
    );
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

  private checkRateLimit(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    traceId: string,
  ): void {
    // Security: Rate limiting to prevent DoS attacks
    const apiKey = req.headers["x-qore-api-key"] as string | undefined;
    const clientId = apiKey || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Clean up expired entries
    for (const [key, entry] of this.rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        this.rateLimitMap.delete(key);
      }
    }

    // Get or create rate limit entry
    let entry = this.rateLimitMap.get(clientId);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + this.rateLimitWindowMs };
      this.rateLimitMap.set(clientId, entry);
    }

    // Increment and check limit
    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, this.rateLimitMaxRequests - entry.count);
    const resetTime = Math.ceil(entry.resetTime / 1000);
    res.setHeader("X-RateLimit-Limit", this.rateLimitMaxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", resetTime.toString());

    if (entry.count > this.rateLimitMaxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      throw new RuntimeError(
        "RATE_LIMIT_EXCEEDED",
        `Rate limit exceeded. Maximum ${this.rateLimitMaxRequests} requests per ${this.rateLimitWindowMs / 1000} seconds.`,
        {
          retryAfter,
          limit: this.rateLimitMaxRequests,
          window: this.rateLimitWindowMs,
        },
      );
    }
  }
}
