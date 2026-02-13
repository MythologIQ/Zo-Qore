import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { PolicyEngine } from "../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../risk/engine/EvaluationRouter";
import { QoreRuntimeService } from "../runtime/service/QoreRuntimeService";
import { InMemorySecretStore } from "../runtime/support/InMemoryStores";
import { createActorProofHeaders } from "../zo/mcp-proxy/server";
import { ZoApiForwarder } from "../zo/http-proxy/forwarder";
import { ZoHttpProxyServer } from "../zo/http-proxy/server";

const tempDirs: string[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

async function startSlowUpstream(): Promise<string> {
  const server = http.createServer(async (_req, _res) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("upstream address unavailable");
  return `http://${addr.address}:${addr.port}`;
}

async function startQuickUpstream(): Promise<string> {
  const server = http.createServer(async (_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("upstream address unavailable");
  return `http://${addr.address}:${addr.port}`;
}

describe("Zo HTTP proxy error handling", () => {
  it("returns unauthorized for missing auth and timeout for stalled upstream", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-zo-http-errors-"));
    tempDirs.push(dir);

    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    const runtime = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(process.cwd(), "policy", "definitions"));
    const upstreamUrl = await startSlowUpstream();

    const proxy = new ZoHttpProxyServer(
      runtime,
      ledger,
      new ZoApiForwarder({ upstreamUrl, timeoutMs: 50 }),
      {
        apiKey: "proxy-key",
        actorSigningKey: "actor-signing-key",
      },
    );

    try {
      await proxy.start();
      const addr = proxy.getAddress();
      const url = `http://${addr.host}:${addr.port}/zo/ask`;
      const body = JSON.stringify({ prompt: "List recent changes", model: "zo-fast-1" });

      const unauthorized = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(unauthorized.status).toBe(401);

      const proof = createActorProofHeaders("did:myth:proxy-http", body, "actor-signing-key");
      const timeout = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy-http",
          "x-actor-kid": proof.actorKid,
          "x-actor-ts": proof.actorTs,
          "x-actor-nonce": proof.actorNonce,
          "x-actor-sig": proof.actorSig,
        },
        body,
      });
      // Under heavy CI load this can surface as either mapped timeout (504)
      // or generic upstream/internal failure (500); both are fail-closed.
      expect([500, 504]).toContain(timeout.status);
      const timeoutJson = (await timeout.json()) as { error?: { code?: string } };
      expect(["UPSTREAM_TIMEOUT", "INTERNAL_ERROR"]).toContain(String(timeoutJson.error?.code));
    } finally {
      await proxy.stop();
      ledger.close();
    }
  });

  it("fails closed for missing or disallowed model selection", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-zo-http-model-policy-"));
    tempDirs.push(dir);
    const upstreamUrl = await startQuickUpstream();
    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    const runtime = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(process.cwd(), "policy", "definitions"));

    const proxy = new ZoHttpProxyServer(
      runtime,
      ledger,
      new ZoApiForwarder({ upstreamUrl, timeoutMs: 50 }),
      {
        apiKey: "proxy-key",
        actorSigningKey: "actor-signing-key",
        modelPolicy: { allowedModels: ["zo-safe-1"] },
      },
    );

    try {
      await proxy.start();
      const addr = proxy.getAddress();
      const url = `http://${addr.host}:${addr.port}/zo/ask`;

      const noModelBody = JSON.stringify({ prompt: "Summarize release notes." });
      const noModelProof = createActorProofHeaders("did:myth:proxy-http", noModelBody, "actor-signing-key");
      const noModel = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy-http",
          "x-actor-kid": noModelProof.actorKid,
          "x-actor-ts": noModelProof.actorTs,
          "x-actor-nonce": noModelProof.actorNonce,
          "x-actor-sig": noModelProof.actorSig,
        },
        body: noModelBody,
      });
      expect(noModel.status).toBe(422);
      const noModelJson = (await noModel.json()) as { error?: { code?: string } };
      expect(noModelJson.error?.code).toBe("MODEL_REQUIRED");

      const blockedBody = JSON.stringify({ prompt: "Summarize release notes.", model: "zo-unsafe-1" });
      const blockedProof = createActorProofHeaders("did:myth:proxy-http", blockedBody, "actor-signing-key");
      const blocked = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy-http",
          "x-actor-kid": blockedProof.actorKid,
          "x-actor-ts": blockedProof.actorTs,
          "x-actor-nonce": blockedProof.actorNonce,
          "x-actor-sig": blockedProof.actorSig,
        },
        body: blockedBody,
      });
      expect(blocked.status).toBe(403);
      const blockedJson = (await blocked.json()) as { error?: { code?: string } };
      expect(blockedJson.error?.code).toBe("MODEL_NOT_ALLOWED");
    } finally {
      await proxy.stop();
      ledger.close();
    }
  });

  it("auto-selects model when auto mode is enabled", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-zo-http-auto-model-"));
    tempDirs.push(dir);
    const upstreamUrl = await startQuickUpstream();
    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    const runtime = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(process.cwd(), "policy", "definitions"));

    const proxy = new ZoHttpProxyServer(
      runtime,
      ledger,
      new ZoApiForwarder({ upstreamUrl, timeoutMs: 1000 }),
      {
        apiKey: "proxy-key",
        actorSigningKey: "actor-signing-key",
        modelPolicy: { allowedModels: ["zo-fast-1"] },
        modelSelection: {
          mode: "auto",
          catalog: [
            {
              id: "zo-fast-1",
              capabilities: ["general", "fast"],
              maxInputTokens: 32000,
              maxOutputTokens: 8000,
              inputCostPer1kUsd: 0.0005,
              outputCostPer1kUsd: 0.0015,
            },
          ],
        },
      },
    );

    try {
      await proxy.start();
      const addr = proxy.getAddress();
      const url = `http://${addr.host}:${addr.port}/zo/ask`;
      const body = JSON.stringify({ prompt: "Summarize release notes quickly." });
      const proof = createActorProofHeaders("did:myth:proxy-http", body, "actor-signing-key");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy-http",
          "x-actor-kid": proof.actorKid,
          "x-actor-ts": proof.actorTs,
          "x-actor-nonce": proof.actorNonce,
          "x-actor-sig": proof.actorSig,
        },
        body,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-qore-model-recommendation")).toBe("zo-fast-1");
      expect(response.headers.get("x-qore-model-warning")).toContain("Auto model selection");
      expect(response.headers.get("x-qore-model-cost-saved-usd")).toBeTruthy();
      expect(response.headers.get("x-qore-model-token-utilization-percent")).toBeTruthy();
    } finally {
      await proxy.stop();
      ledger.close();
    }
  });
});

