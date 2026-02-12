import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteRateLimiter } from "../zo/mcp-proxy/rate-limit";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("sqlite rate limiter", () => {
  it("enforces limits across multiple limiter instances", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-rl-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "rate-limit.db");

    const limiterA = new SqliteRateLimiter({
      dbPath,
      maxRequests: 2,
      windowMs: 60_000,
    });
    const limiterB = new SqliteRateLimiter({
      dbPath,
      maxRequests: 2,
      windowMs: 60_000,
    });

    try {
      expect(limiterA.allow("actor:did:myth:test", 1_000)).toBe(true);
      expect(limiterB.allow("actor:did:myth:test", 1_001)).toBe(true);
      expect(limiterA.allow("actor:did:myth:test", 1_002)).toBe(false);
      expect(limiterB.allow("actor:did:myth:test", 62_000)).toBe(true);
    } finally {
      limiterA.close();
      limiterB.close();
    }
  });
});
