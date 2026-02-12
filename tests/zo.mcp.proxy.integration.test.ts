import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { PolicyEngine } from "../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../risk/engine/EvaluationRouter";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../runtime/support/InMemoryStores";
import { QoreRuntimeService } from "../runtime/service/QoreRuntimeService";
import { McpForwarder } from "../zo/mcp-proxy/forwarder";
import { createActorProofHeaders, ZoMcpProxyServer } from "../zo/mcp-proxy/server";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function startMockUpstream(): Promise<{
  baseUrl: string;
  getCalls: () => number;
  stop: () => Promise<void>;
}> {
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    calls += 1;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: { ok: true, echoedMethod: body.method },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("mock upstream address unavailable");
  return {
    baseUrl: `http://${addr.address}:${addr.port}`,
    getCalls: () => calls,
    stop: async () => {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

describe("Zo MCP proxy integration", () => {
  it("forwards allowed read requests and blocks escalated mutating requests", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-zo-proxy-"));
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

    const upstream = await startMockUpstream();
    const forwarder = new McpForwarder({ upstreamUrl: upstream.baseUrl, timeoutMs: 1000, maxReadRetries: 0 });
    const proxy = new ZoMcpProxyServer(runtime, ledger, forwarder, {
      apiKey: "proxy-key",
      actorSigningKey: "actor-signing-key",
      requireAuth: true,
      replayProtection: { strategy: "memory", maxEntries: 5000 },
      readOnlyRetryTools: ["read_file", "list_files"],
    });

    try {
      await proxy.start();
      const addr = proxy.getAddress();
      const url = `http://${addr.host}:${addr.port}/mcp`;

      const allowedBody = JSON.stringify({
        jsonrpc: "2.0",
        id: "read-1",
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: { path: "docs/README.md", model: "zo-fast-1" },
        },
      });
      const allowedProof = createActorProofHeaders(
        "did:myth:proxy",
        allowedBody,
        "actor-signing-key",
      );
      const allowed = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-kid": allowedProof.actorKid,
          "x-actor-ts": allowedProof.actorTs,
          "x-actor-nonce": allowedProof.actorNonce,
          "x-actor-sig": allowedProof.actorSig,
        },
        body: allowedBody,
      });

      expect(allowed.status).toBe(200);
      const allowedJson = (await allowed.json()) as { result?: { ok: boolean } };
      expect(allowedJson.result?.ok).toBe(true);
      expect(upstream.getCalls()).toBe(1);

      const replay = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-kid": allowedProof.actorKid,
          "x-actor-ts": allowedProof.actorTs,
          "x-actor-nonce": allowedProof.actorNonce,
          "x-actor-sig": allowedProof.actorSig,
        },
        body: allowedBody,
      });
      expect(replay.status).toBe(200);
      const replayJson = (await replay.json()) as { error?: { code: number } };
      expect(replayJson.error?.code).toBe(-32032);
      expect(upstream.getCalls()).toBe(1);

      const blockedBody = JSON.stringify({
        jsonrpc: "2.0",
        id: "write-1",
        method: "tools/call",
        params: {
          name: "write_file",
          arguments: { path: "docs/new.md", content: "x", model: "zo-fast-1" },
        },
      });
      const blockedProof = createActorProofHeaders(
        "did:myth:proxy",
        blockedBody,
        "actor-signing-key",
      );
      const blocked = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-kid": blockedProof.actorKid,
          "x-actor-ts": blockedProof.actorTs,
          "x-actor-nonce": blockedProof.actorNonce,
          "x-actor-sig": blockedProof.actorSig,
        },
        body: blockedBody,
      });

      expect(blocked.status).toBe(200);
      const blockedJson = (await blocked.json()) as {
        error?: { code: number; data?: { traceId?: string } };
      };
      expect(blockedJson.error?.code).toBe(-32010);
      expect(blockedJson.error?.data?.traceId).toMatch(/^trace_/);
      expect(upstream.getCalls()).toBe(1);

      const missingModelBody = JSON.stringify({
        jsonrpc: "2.0",
        id: "missing-model-1",
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: { path: "docs/no-model.md" },
        },
      });
      const missingModelProof = createActorProofHeaders(
        "did:myth:proxy",
        missingModelBody,
        "actor-signing-key",
      );
      const missingModel = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-kid": missingModelProof.actorKid,
          "x-actor-ts": missingModelProof.actorTs,
          "x-actor-nonce": missingModelProof.actorNonce,
          "x-actor-sig": missingModelProof.actorSig,
        },
        body: missingModelBody,
      });
      expect(missingModel.status).toBe(200);
      const missingModelJson = (await missingModel.json()) as { error?: { code?: number } };
      expect(missingModelJson.error?.code).toBe(-32033);
      expect(upstream.getCalls()).toBe(1);

      const unauthorized = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "unauth-1",
          method: "tools/list",
        }),
      });
      expect(unauthorized.status).toBe(200);
      const unauthorizedJson = (await unauthorized.json()) as { error?: { code: number } };
      expect(unauthorizedJson.error?.code).toBe(-32030);

      const tamperedBody = JSON.stringify({
        jsonrpc: "2.0",
        id: "tamper-1",
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: { path: "docs/another.md", model: "zo-fast-1" },
        },
      });
      const tampered = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-ts": `${Date.now()}`,
          "x-actor-sig": "deadbeef",
        },
        body: tamperedBody,
      });
      expect(tampered.status).toBe(200);
      const tamperedJson = (await tampered.json()) as { error?: { code: number } };
      expect(tamperedJson.error?.code).toBe(-32030);
      expect(upstream.getCalls()).toBe(1);
    } finally {
      await proxy.stop();
      await upstream.stop();
      ledger.close();
    }
  });
});

