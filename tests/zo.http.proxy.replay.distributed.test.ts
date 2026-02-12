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

async function startUpstream(): Promise<string> {
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

describe("Zo HTTP distributed replay protection", () => {
  it("rejects nonce replay across proxy instances using shared sqlite store", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-http-replay-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "replay.db");
    const upstreamUrl = await startUpstream();

    const ledgerA = new LedgerManager({
      ledgerPath: path.join(dir, "ledgerA.db"),
      secretStore: new InMemorySecretStore(),
    });
    const ledgerB = new LedgerManager({
      ledgerPath: path.join(dir, "ledgerB.db"),
      secretStore: new InMemorySecretStore(),
    });
    const runtimeA = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledgerA,
      defaultQoreConfig,
    );
    const runtimeB = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledgerB,
      defaultQoreConfig,
    );
    await runtimeA.initialize(path.join(process.cwd(), "policy", "definitions"));
    await runtimeB.initialize(path.join(process.cwd(), "policy", "definitions"));

    const proxyA = new ZoHttpProxyServer(
      runtimeA,
      ledgerA,
      new ZoApiForwarder({ upstreamUrl, timeoutMs: 1000 }),
      {
        apiKey: "proxy-key",
        actorSigningKey: "actor-signing-key",
        replayProtection: { strategy: "sqlite", sqlitePath: dbPath },
      },
    );
    const proxyB = new ZoHttpProxyServer(
      runtimeB,
      ledgerB,
      new ZoApiForwarder({ upstreamUrl, timeoutMs: 1000 }),
      {
        apiKey: "proxy-key",
        actorSigningKey: "actor-signing-key",
        replayProtection: { strategy: "sqlite", sqlitePath: dbPath },
      },
    );

    try {
      await proxyA.start();
      await proxyB.start();
      const addrA = proxyA.getAddress();
      const addrB = proxyB.getAddress();
      const body = JSON.stringify({ prompt: "Summarize release notes.", model: "zo-fast-1" });
      const proof = createActorProofHeaders("did:myth:proxy-http", body, "actor-signing-key");

      const first = await fetch(`http://${addrA.host}:${addrA.port}/zo/ask`, {
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
      expect(first.status).toBe(200);

      const second = await fetch(`http://${addrB.host}:${addrB.port}/zo/ask`, {
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
      expect(second.status).toBe(409);
    } finally {
      await proxyA.stop();
      await proxyB.stop();
      ledgerA.close();
      ledgerB.close();
    }
  });
});

