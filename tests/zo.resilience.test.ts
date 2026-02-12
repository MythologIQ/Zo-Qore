import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function mkTempWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qore-resilience-test-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".failsafe", "ledger"), { recursive: true });
  fs.writeFileSync(path.join(root, ".failsafe", "ledger", "soa_ledger.db"), "ledger-test");
  fs.writeFileSync(path.join(root, ".failsafe", "ledger", "replay-protection.db"), "replay-test");
  fs.writeFileSync(path.join(root, ".failsafe", "zo-installer.env"), "QORE_API_KEY=test");
  return root;
}

function run(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [path.resolve("scripts/zo-resilience.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const next = tempRoots.pop();
    if (next && fs.existsSync(next)) fs.rmSync(next, { recursive: true, force: true });
  }
});

describe("zo-resilience", () => {
  it("backs up, lists, and dry-runs restore", () => {
    const workspace = mkTempWorkspace();
    const backupRaw = run(["backup", "--workspace", workspace], workspace);
    const backup = JSON.parse(backupRaw) as { ok: boolean; backupDir: string; files: number };
    expect(backup.ok).toBe(true);
    expect(backup.files).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(path.join(backup.backupDir, "manifest.json"))).toBe(true);

    const listRaw = run(["list", "--workspace", workspace], workspace);
    const listed = JSON.parse(listRaw) as { ok: boolean; backups: string[] };
    expect(listed.ok).toBe(true);
    expect(listed.backups.length).toBeGreaterThanOrEqual(1);

    const dryRunRaw = run(
      ["restore", "--workspace", workspace, "--from", backup.backupDir, "--confirm", "RESTORE", "--dry-run"],
      workspace
    );
    const restore = JSON.parse(dryRunRaw) as { ok: boolean; restored: number; dryRun: boolean };
    expect(restore.ok).toBe(true);
    expect(restore.dryRun).toBe(true);
    expect(restore.restored).toBeGreaterThanOrEqual(3);
  });
});
