import { McpRequest, McpResponse } from "@mythologiq/qore-contracts/schemas/McpTypes";
import { McpResponseSchema } from "@mythologiq/qore-contracts/schemas/McpTypes";
import { ZodError } from "zod";

export interface McpForwarderOptions {
  upstreamUrl: string;
  timeoutMs?: number;
  maxReadRetries?: number;
}

export class UpstreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

export class UpstreamHttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "UpstreamHttpError";
  }
}

export class UpstreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamProtocolError";
  }
}

export class McpForwarder {
  private readonly timeoutMs: number;
  private readonly maxReadRetries: number;

  constructor(private readonly options: McpForwarderOptions) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxReadRetries = options.maxReadRetries ?? 1;
  }

  async forward(request: McpRequest, allowRetry: boolean): Promise<McpResponse> {
    const maxAttempts = allowRetry ? this.maxReadRetries + 1 : 1;
    let attempt = 0;
    let lastError: unknown = undefined;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await this.forwardOnce(request);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to forward MCP request");
  }

  private async forwardOnce(request: McpRequest): Promise<McpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.options.upstreamUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new UpstreamHttpError(response.status, `Upstream MCP returned HTTP ${response.status}`);
      }
      const json = await response.json();
      try {
        return McpResponseSchema.parse(json) as McpResponse;
      } catch (error) {
        if (this.isZodError(error)) {
          throw new UpstreamProtocolError("Upstream MCP response failed schema validation");
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new UpstreamTimeoutError(`Upstream MCP timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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
}

