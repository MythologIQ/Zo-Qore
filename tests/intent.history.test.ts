import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { IntentHistoryLog } from "../ledger/engine/IntentHistoryLog";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("IntentHistoryLog", () => {
  it("appends entries and validates hash chain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-history-"));
    tempDirs.push(dir);
    const log = new IntentHistoryLog(dir);

    await log.appendEntry({
      intentId: "11111111-1111-4111-8111-111111111111",
      timestamp: new Date().toISOString(),
      event: "CREATED",
      actor: "tester",
    });
    await log.appendEntry({
      intentId: "11111111-1111-4111-8111-111111111111",
      timestamp: new Date().toISOString(),
      event: "STATUS_CHANGED",
      previousStatus: "PULSE",
      newStatus: "PASS",
      actor: "tester",
    });

    const result = await log.verifyChainIntegrity();
    expect(result.valid).toBe(true);
  });

  it("detects tampering", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-history-tamper-"));
    tempDirs.push(dir);
    const log = new IntentHistoryLog(dir);

    await log.appendEntry({
      intentId: "22222222-2222-4222-8222-222222222222",
      timestamp: new Date().toISOString(),
      event: "CREATED",
      actor: "tester",
    });

    const historyPath = path.join(dir, "intent_history.jsonl");
    const [line] = fs.readFileSync(historyPath, "utf-8").trim().split("\n");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    parsed.actor = "tampered";
    fs.writeFileSync(historyPath, `${JSON.stringify(parsed)}\n`, "utf-8");

    const result = await log.verifyChainIntegrity();
    expect(result.valid).toBe(false);
  });
});
