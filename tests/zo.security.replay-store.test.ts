import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryReplayStore, SqliteReplayStore } from "../zo/security/replay-store";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("replay store", () => {
  it("memory store evicts when capacity is reached", () => {
    const store = new MemoryReplayStore({ maxEntries: 2 });
    expect(store.remember("a", "n1", 60_000, 1_000)).toBe(true);
    expect(store.remember("a", "n2", 60_000, 1_001)).toBe(true);
    expect(store.remember("a", "n3", 60_000, 1_002)).toBe(true);
    // n1 should be evicted by capacity pressure; replay behaves like unseen.
    expect(store.remember("a", "n1", 60_000, 1_003)).toBe(true);
  });

  it("sqlite store blocks replay across instances", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-replay-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "replay.db");
    const a = new SqliteReplayStore({ dbPath });
    const b = new SqliteReplayStore({ dbPath });
    try {
      expect(a.remember("actor-1", "nonce-1", 60_000, 2_000)).toBe(true);
      expect(b.remember("actor-1", "nonce-1", 60_000, 2_001)).toBe(false);
      expect(b.remember("actor-1", "nonce-1", 60_000, 62_001)).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });
});
