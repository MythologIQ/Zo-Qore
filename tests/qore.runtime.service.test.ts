import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { PolicyEngine } from "../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../risk/engine/EvaluationRouter";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { QoreRuntimeService } from "../runtime/service/QoreRuntimeService";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../runtime/support/InMemoryStores";
import { RuntimeError } from "../runtime/service/errors";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("QoreRuntimeService", () => {
  it("rejects evaluation before initialization", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-runtime-uninit-"));
    tempDirs.push(dir);
    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    const service = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );

    await expect(
      service.evaluate({
        requestId: "req-preinit",
        actorId: "did:myth:tester",
        action: "read",
        targetPath: "docs/README.md",
      }),
    ).rejects.toBeInstanceOf(RuntimeError);
  });

  it("returns deterministic decision outputs for identical inputs", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-runtime-"));
    tempDirs.push(dir);

    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    try {
      const service = new QoreRuntimeService(
        new PolicyEngine(),
        EvaluationRouter.fromConfig(defaultQoreConfig),
        ledger,
        defaultQoreConfig,
      );

      await service.initialize(path.join(process.cwd(), "policy", "definitions"));
      const request = {
        requestId: "req-001",
        actorId: "did:myth:tester",
        action: "read" as const,
        targetPath: "docs/README.md",
        content: "documentation update",
      };

      const first = await service.evaluate(request);
      const second = await service.evaluate(request);

      expect(first.decision).toBe(second.decision);
      expect(first.riskGrade).toBe(second.riskGrade);
      expect(first.evaluationTier).toBe(second.evaluationTier);
      expect(first.policyVersion).toBe(second.policyVersion);
      expect(first.auditEventId).toBe(second.auditEventId);
      expect(first.decisionId).toMatch(/^dec_/);
      expect(first.auditEventId).toMatch(/^ledger:/);
      expect(second.auditEventId).toMatch(/^ledger:/);
      const health = await service.health();
      expect(health.initialized).toBe(true);
      expect(health.policyLoaded).toBe(true);
    } finally {
      ledger.close();
    }
  });

  it("rejects replay with mismatched payload", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-runtime-replay-"));
    tempDirs.push(dir);
    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    try {
      const service = new QoreRuntimeService(
        new PolicyEngine(),
        EvaluationRouter.fromConfig(defaultQoreConfig),
        ledger,
        defaultQoreConfig,
      );
      await service.initialize(path.join(process.cwd(), "policy", "definitions"));

      await service.evaluate({
        requestId: "replay-1",
        actorId: "did:myth:tester",
        action: "read",
        targetPath: "docs/README.md",
      });

      await expect(
        service.evaluate({
          requestId: "replay-1",
          actorId: "did:myth:tester",
          action: "read",
          targetPath: "docs/OTHER.md",
        }),
      ).rejects.toBeInstanceOf(RuntimeError);
    } finally {
      ledger.close();
    }
  });

  it("applies fail-closed escalation for mutating actions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-runtime-mutating-"));
    tempDirs.push(dir);
    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    try {
      const service = new QoreRuntimeService(
        new PolicyEngine(),
        EvaluationRouter.fromConfig(defaultQoreConfig),
        ledger,
        defaultQoreConfig,
      );
      await service.initialize(path.join(process.cwd(), "policy", "definitions"));

      const result = await service.evaluate({
        requestId: "mutate-1",
        actorId: "did:myth:tester",
        action: "write",
        targetPath: "docs/note.md",
      });

      expect(["ESCALATE", "DENY"]).toContain(result.decision);
      if (result.decision === "ESCALATE") {
        expect(result.requiredActions).toContain("mutating_action_requires_review");
      }
    } finally {
      ledger.close();
    }
  });
});

