import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { InMemorySecretStore } from "../runtime/support/InMemoryStores";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("LedgerManager", () => {
  it("creates genesis and maintains a valid chain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-ledger-"));
    tempDirs.push(dir);
    const ledgerPath = path.join(dir, "soa_ledger.db");

    const manager = new LedgerManager({
      ledgerPath,
      secretStore: new InMemorySecretStore(),
    });
    await manager.initialize();

    expect(manager.getEntryCount()).toBe(1);

    await manager.appendEntry({
      eventType: "SYSTEM_EVENT",
      agentDid: "did:myth:test",
      payload: { test: true },
    });

    expect(manager.getEntryCount()).toBe(2);
    expect(manager.verifyChain()).toBe(true);
    manager.close();
  });
});
