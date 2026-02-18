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

export interface LocalApiServerOptions {
  host?: string;
  port?: number;
  apiKey?: string;
  requireAuth?: boolean;
  publicHealth?: boolean;
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

  constructor(
    private readonly runtime: QoreRuntimeService,
    private readonly options: LocalApiServerOptions = {},
  ) {
    this.rateLimitMaxRequests = options.rateLimitMaxRequests ?? 100;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? 60000; // 1 minute default
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
