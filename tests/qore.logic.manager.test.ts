import { describe, expect, it } from "vitest";
import { QoreLogicManager } from "../runtime/api/QoreLogicManager";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { PolicyEngine } from "../policy/engine/PolicyEngine";
import { ShadowGenomeManager } from "../runtime/api/ShadowGenomeManager";
import { TrustEngine } from "../runtime/api/TrustEngine";
import { EventBus } from "../runtime/support/EventBus";
import { InMemoryStateStore } from "../runtime/support/InMemoryStores";
import { SentinelVerdict } from "@mythologiq/qore-contracts/schemas/shared.types";

type LedgerEntry = Record<string, unknown>;

class LedgerStub {
  entries: LedgerEntry[] = [];

  async appendEntry(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class TrustStub {
  updates: Array<{ agentDid: string; outcome: "success" | "failure" }> = [];

  async registerAgent(persona: string, publicKey: string): Promise<{ did: string; trustScore: number }> {
    return { did: `did:myth:${persona}:1`, trustScore: 0.5 };
  }

  async updateTrust(agentDid: string, outcome: "success" | "failure"): Promise<number> {
    this.updates.push({ agentDid, outcome });
    return outcome === "success" ? 0.55 : 0.4;
  }
}

class ShadowStub {
  archived: Array<Record<string, unknown>> = [];
  closed = false;

  async archiveFailure(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.archived.push(payload);
    return { id: 1, ...payload };
  }

  async getNegativeConstraintsForAgent(_agentDid: string): Promise<string[]> {
    return ["avoid:secret-write"];
  }

  async analyzeFailurePatterns(): Promise<Array<Record<string, unknown>>> {
    return [{ failureMode: "SPEC_VIOLATION", count: 1 }];
  }

  async getEntriesByAgent(_agentDid: string, _limit = 20): Promise<Array<Record<string, unknown>>> {
    return [{ id: 1 }];
  }

  close(): void {
    this.closed = true;
  }
}

function buildManager() {
  const state = new InMemoryStateStore();
  const ledger = new LedgerStub();
  const trust = new TrustStub();
  const shadow = new ShadowStub();
  const bus = new EventBus();
  const policy = {} as object;
  const manager = new QoreLogicManager(
    state,
    ledger as unknown as LedgerManager,
    trust as unknown as TrustEngine,
    policy as PolicyEngine,
    shadow as unknown as ShadowGenomeManager,
    bus,
  );
  return { manager, state, ledger, trust, shadow, bus };
}

describe("QoreLogicManager", () => {
  it("queues L3 approvals, persists state, and emits ledger/event entries", async () => {
    const { manager, ledger, state, bus } = buildManager();
    await manager.initialize();
    const events: unknown[] = [];
    bus.on("qorelogic.l3Queued", (event) => events.push(event.payload));

    const requestId = await manager.queueL3Approval({
      agentDid: "did:myth:test",
      agentTrust: 0.7,
      filePath: "repo://docs/readme.md",
      riskGrade: "L2",
      sentinelSummary: "needs oversight",
      flags: ["review"],
    });

    expect(requestId.length).toBeGreaterThan(10);
    expect(manager.getL3Queue()).toHaveLength(1);
    const queued = manager.getL3Queue()[0];
    expect(queued.state).toBe("QUEUED");
    expect(queued.agentDid).toBe("did:myth:test");
    expect(state.get("l3Queue", [] as unknown[])).toHaveLength(1);
    expect(ledger.entries.some((entry) => entry.eventType === "L3_QUEUED")).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("processes tier 3 evaluation by queuing L3 and writing evaluation ledger entry", async () => {
    const { manager, ledger } = buildManager();
    await manager.initialize();

    await manager.processEvaluationDecision(
      {
        tier: 3,
        triage: { risk: "R3", novelty: "high", confidence: "low" },
        invokeQoreLogic: true,
        writeLedger: true,
        enforceSentinel: true,
        requiredActions: ["human-review"],
      },
      {
        id: "evt-1",
        timestamp: new Date().toISOString(),
        category: "user",
        payload: { intentId: "did:myth:actor", targetPath: "repo://auth/secrets.ts" },
      },
    );

    expect(ledger.entries.some((entry) => entry.eventType === "EVALUATION_ROUTED")).toBe(true);
    expect(manager.getL3Queue()).toHaveLength(1);
    expect(manager.getL3Queue()[0].riskGrade).toBe("L3");
  });

  it("applies L3 decision, updates trust, and removes request from queue", async () => {
    const { manager, trust, ledger, bus } = buildManager();
    await manager.initialize();
    const events: unknown[] = [];
    bus.on("qorelogic.l3Decided", (event) => events.push(event.payload));

    const requestId = await manager.queueL3Approval({
      agentDid: "did:myth:test",
      agentTrust: 0.8,
      filePath: "repo://src/secure.ts",
      riskGrade: "L3",
      sentinelSummary: "critical path",
      flags: ["review", "trace"],
    });

    await manager.processL3Decision(requestId, "APPROVED", ["monitor"]);

    expect(manager.getL3Queue()).toHaveLength(0);
    expect(trust.updates).toEqual([{ agentDid: "did:myth:test", outcome: "success" }]);
    expect(ledger.entries.some((entry) => entry.eventType === "L3_APPROVED")).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("archives failed verdicts and skips PASS verdicts", async () => {
    const { manager, shadow } = buildManager();
    await manager.initialize();

    const skipped = await manager.archiveFailedVerdict(
      {
        id: "v-pass",
        eventId: "evt-pass",
        timestamp: new Date().toISOString(),
        decision: "PASS",
        riskGrade: "L1",
        confidence: 0.9,
        heuristicResults: [],
        agentTrustAtVerdict: 0.8,
        summary: "safe",
        details: "none",
        agentDid: "did:myth:test",
        matchedPatterns: [],
        actions: [],
      } as SentinelVerdict,
      "vector-a",
    );
    expect(skipped).toBeNull();

    const archived = await manager.archiveFailedVerdict(
      {
        id: "v-block",
        eventId: "evt-block",
        timestamp: new Date().toISOString(),
        decision: "BLOCK",
        riskGrade: "L3",
        confidence: 0.1,
        heuristicResults: [],
        agentTrustAtVerdict: 0.2,
        summary: "unsafe",
        details: "detected write escalation",
        agentDid: "did:myth:test",
        matchedPatterns: ["write-escalation"],
        actions: [],
      } as SentinelVerdict,
      "vector-b",
      "env:test",
    );

    expect(archived).not.toBeNull();
    expect(shadow.archived).toHaveLength(1);
  });

  it("throws when deciding unknown L3 request and disposes shadow manager", async () => {
    const { manager, shadow } = buildManager();
    await manager.initialize();

    await expect(manager.processL3Decision("missing-id", "REJECTED")).rejects.toThrow("L3 request not found");

    manager.dispose();
    expect(shadow.closed).toBe(true);
  });
});
