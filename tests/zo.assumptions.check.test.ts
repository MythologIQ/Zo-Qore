import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Zo assumption freshness check", () => {
  it("fails future-dated evidence entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-assumption-"));
    tempDirs.push(dir);
    const evidencePath = path.join(dir, "evidence.json");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    fs.writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          items: [
            {
              id: "future-item",
              surface: "zo-http",
              claim: "future claim",
              source: "docs/x.md",
              validatedAt: tomorrow,
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = spawnSync("node", ["scripts/check-zo-assumptions.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, QORE_ZO_ASSUMPTION_EVIDENCE_PATH: evidencePath },
      encoding: "utf-8",
      shell: process.platform === "win32",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("Future-dated Zo assumption evidence");
  });
});
