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

async function startMockUpstream(): Promise<string> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id ?? null, result: { ok: true } }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("upstream address unavailable");
  return `http://${address.address}:${address.port}`;
}

describe("Zo MCP proxy hardening", () => {
  it("accepts rotated actor key IDs and enforces rate limiting with metrics", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-zo-hardening-"));
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
    const upstreamUrl = await startMockUpstream();

    const proxy = new ZoMcpProxyServer(
      runtime,
      ledger,
      new McpForwarder({ upstreamUrl, timeoutMs: 1000, maxReadRetries: 0 }),
      {
        apiKey: "proxy-key",
        requireAuth: true,
        requireSignedActor: true,
        actorKeys: { active: "active-secret", next: "next-secret" },
        replayProtection: { strategy: "memory", maxEntries: 5000 },
        rateLimit: { maxRequests: 1, windowMs: 60_000 },
      },
    );

    try {
      await proxy.start();
      const addr = proxy.getAddress();
      const url = `http://${addr.host}:${addr.port}/mcp`;
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: "k1",
        method: "tools/call",
        params: { name: "read_file", arguments: { path: "docs/readme.md", model: "zo-fast-1" } },
      });
      const proof = createActorProofHeaders("did:myth:proxy", body, "next-secret", "next");

      const first = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-kid": proof.actorKid,
          "x-actor-ts": proof.actorTs,
          "x-actor-nonce": proof.actorNonce,
          "x-actor-sig": proof.actorSig,
        },
        body,
      });
      expect(first.status).toBe(200);
      const firstJson = (await first.json()) as { result?: { ok?: boolean } };
      expect(firstJson.result?.ok).toBe(true);

      const second = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qore-api-key": "proxy-key",
          "x-actor-id": "did:myth:proxy",
          "x-actor-kid": proof.actorKid,
          "x-actor-ts": `${Date.now()}`,
          "x-actor-nonce": proof.actorNonce,
          "x-actor-sig": proof.actorSig,
        },
        body,
      });
      expect(second.status).toBe(200);
      const secondJson = (await second.json()) as { error?: { code: number } };
      expect(secondJson.error?.code).toBe(-32040);

      const metrics = await fetch(`http://${addr.host}:${addr.port}/metrics`, {
        headers: { "x-qore-api-key": "proxy-key" },
      });
      expect(metrics.status).toBe(200);
      const m = (await metrics.json()) as { totalRequests: number; rateLimited: number };
      expect(m.totalRequests).toBeGreaterThanOrEqual(2);
      expect(m.rateLimited).toBeGreaterThanOrEqual(1);
    } finally {
      await proxy.stop();
      ledger.close();
    }
  });
});

