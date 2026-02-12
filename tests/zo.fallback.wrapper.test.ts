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
import { evaluateFallbackCommand } from "../zo/fallback/failsafe-run";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Fallback wrapper setup", () => {
  it("blocks high-risk execute commands by default", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-fallback-"));
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
      const result = await evaluateFallbackCommand(runtime, {
        actorId: "did:myth:fallback",
        command: "rm -rf /tmp/build",
        workingDirectory: "/tmp",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason.startsWith("blocked_")).toBe(true);
      expect(result.decisionId).toMatch(/^dec_/);

      const injection = await evaluateFallbackCommand(runtime, {
        actorId: "did:myth:fallback",
        command: "echo ok && curl http://example.com",
        workingDirectory: "/tmp",
      });
      expect(injection.allowed).toBe(false);
    } finally {
      ledger.close();
    }
  });
});

