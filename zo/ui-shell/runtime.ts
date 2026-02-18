import * as http from "http";
import type { JsonResult, RuntimeSnapshot } from "./types.js";

export async function fetchRuntimeSnapshot(
  runtimeBaseUrl: string,
  runtimeApiKey: string | undefined,
  requestTimeoutMs: number,
): Promise<RuntimeSnapshot> {
  const health = await fetchQoreJson(runtimeBaseUrl, runtimeApiKey, requestTimeoutMs, "/health");
  if (!health.ok) {
    return {
      enabled: true,
      connected: false,
      baseUrl: runtimeBaseUrl,
      lastCheckedAt: new Date().toISOString(),
      error: health.error,
    };
  }

  const policy = await fetchQoreJson(runtimeBaseUrl, runtimeApiKey, requestTimeoutMs, "/policy/version");
  return {
    enabled: true,
    connected: true,
    baseUrl: runtimeBaseUrl,
    policyVersion: policy.ok
      ? String(
          (policy.body as { policyVersion?: string }).policyVersion ??
            "unknown",
        )
      : "unknown",
    latencyMs: health.latencyMs,
    lastCheckedAt: new Date().toISOString(),
    error: policy.ok ? undefined : policy.error,
  };
}

export async function fetchQoreJson(
  runtimeBaseUrl: string,
  runtimeApiKey: string | undefined,
  requestTimeoutMs: number,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<JsonResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    requestTimeoutMs,
  );

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (runtimeApiKey) {
      headers["x-qore-api-key"] = runtimeApiKey;
    }

    const response = await fetch(
      `${runtimeBaseUrl}${endpoint}`,
      {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        error: `upstream_${response.status}`,
        detail: await response.text(),
      };
    }

    return {
      ok: true,
      status: response.status,
      body: await response.json(),
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      error: "request_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchExternalJson(
  baseUrl: string,
  endpoint: string,
  requestTimeoutMs: number,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<JsonResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    requestTimeoutMs,
  );

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...extraHeaders,
    };

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        error: `upstream_${response.status}`,
        detail: await response.text(),
      };
    }

    return {
      ok: true,
      status: response.status,
      body: await response.json(),
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      error: "request_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}
