import { ZoAskForwardResult, ZoAskForwardResultSchema } from "@mythologiq/qore-contracts/schemas/ZoApiTypes";

export class ZoApiUpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ZoApiUpstreamError";
  }
}

export class ZoApiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZoApiTimeoutError";
  }
}

export interface ZoApiForwarderOptions {
  upstreamUrl: string;
  askPath?: string;
  timeoutMs?: number;
}

export class ZoApiForwarder {
  constructor(private readonly options: ZoApiForwarderOptions) {}

  async forward(rawBody: string): Promise<ZoAskForwardResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    try {
      const response = await fetch(`${this.options.upstreamUrl}${this.options.askPath ?? "/zo/ask"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
        signal: controller.signal,
      });

      const textBody = await response.text();
      const parsedBody = this.tryParseJson(textBody);
      if (!response.ok) {
        throw new ZoApiUpstreamError("Zo upstream rejected request", response.status);
      }

      return ZoAskForwardResultSchema.parse({
        statusCode: response.status,
        body: parsedBody,
      });
    } catch (error) {
      if (error instanceof ZoApiUpstreamError) throw error;
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        errorName === "AbortError"
      ) {
        throw new ZoApiTimeoutError("Zo upstream request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private tryParseJson(payload: string): unknown {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
}

