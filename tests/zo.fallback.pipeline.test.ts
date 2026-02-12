import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { PolicyEngine } from "../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../risk/engine/EvaluationRouter";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../runtime/support/InMemoryStores";
import { QoreRuntimeService } from "../runtime/service/QoreRuntimeService";
import { FallbackGovernancePipeline } from "../zo/fallback/pipeline";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Fallback governance pipeline", () => {
  it("marks privileged path events as fail-closed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-fallback-pipeline-"));
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

    try {
      const pipeline = new FallbackGovernancePipeline(runtime, ledger, {
        actorId: "did:myth:ssh:tester",
        rootPath: dir,
        privilegedPathPrefixes: ["/etc", "/root"],
      });
      const result = await pipeline.processEvent({
        eventId: "evt-1",
        actorId: "did:myth:ssh:tester",
        path: "/etc/shadow",
        operation: "modify",
        timestamp: new Date().toISOString(),
      });
      expect(result.privileged).toBe(true);
      expect(result.allowed).toBe(false);
    } finally {
      ledger.close();
    }
  });
});

