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

async function startServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("server address unavailable");
  return `http://${addr.address}:${addr.port}`;
}

describe("proxy metrics sink", () => {
  it("publishes snapshots to external HTTP sink", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-metrics-"));
    tempDirs.push(dir);
    const sinkPayloads: Array<{ totalRequests?: number }> = [];

    const upstreamUrl = await startServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id ?? null, result: { ok: true } }));
    });
    const sinkUrl = await startServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      sinkPayloads.push(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as { totalRequests?: number });
      res.statusCode = 204;
      res.end();
    });

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

    const proxy = new ZoMcpProxyServer(
      runtime,
      ledger,
      new McpForwarder({ upstreamUrl, timeoutMs: 1000, maxReadRetries: 0 }),
      {
        apiKey: "proxy-key",
        requireAuth: true,
        requireSignedActor: true,
        actorSigningKey: "actor-signing-key",
        replayProtection: { strategy: "memory", maxEntries: 5000 },
        metrics: {
          sink: {
            url: `${sinkUrl}/ingest`,
            minIntervalMs: 0,
          },
        },
      },
    );

    try {
      await proxy.start();
      const addr = proxy.getAddress();
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: "metrics-1",
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: { path: "docs/README.md", model: "zo-fast-1" },
        },
      });
      const proof = createActorProofHeaders("did:myth:proxy", body, "actor-signing-key");

      const response = await fetch(`http://${addr.host}:${addr.port}/mcp`, {
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
      expect(response.status).toBe(200);
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));
      expect(sinkPayloads.length).toBeGreaterThan(0);
      expect(sinkPayloads.some((payload) => (payload.totalRequests ?? 0) >= 1)).toBe(true);
    } finally {
      await proxy.stop();
      ledger.close();
    }
  });
});

