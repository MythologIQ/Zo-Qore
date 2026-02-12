#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

function usage() {
  console.log(`zo-resilience

Usage:
  node scripts/zo-resilience.mjs backup [--workspace <path>] [--out <dir>]
  node scripts/zo-resilience.mjs list [--workspace <path>] [--out <dir>]
  node scripts/zo-resilience.mjs restore --from <backupDir> --confirm RESTORE [--workspace <path>] [--dry-run]

Notes:
  - Backup captures runtime state files, not node_modules or build artifacts.
  - Restore requires --confirm RESTORE to reduce accidental overwrite risk.
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);
  const flags = new Map();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token;
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, "true");
      continue;
    }
    flags.set(key, next);
    i += 1;
  }
  return { command, flags };
}

function nowStamp() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}Z`;
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function defaultPaths(workspace) {
  return [
    process.env.QORE_LEDGER_PATH || path.join(workspace, ".failsafe", "ledger", "soa_ledger.db"),
    process.env.QORE_REPLAY_DB_PATH || path.join(workspace, ".failsafe", "ledger", "replay-protection.db"),
    path.join(workspace, ".failsafe", "zo-installer.env"),
    path.join(workspace, ".failsafe", "workspace-config.json"),
  ];
}

function collectExisting(paths) {
  const out = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    const stat = fs.statSync(p);
    if (!stat.isFile()) continue;
    out.push({
      sourcePath: p,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: sha256(p),
    });
  }
  return out;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeRelativeFromWorkspace(workspace, sourcePath) {
  const rel = path.relative(workspace, sourcePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return path.join("external", path.basename(sourcePath));
  }
  return rel;
}

function doBackup(flags) {
  const workspace = path.resolve(flags.get("--workspace") || process.cwd());
  const outRoot = path.resolve(flags.get("--out") || path.join(workspace, ".failsafe", "backups"));
  const backupDir = path.join(outRoot, nowStamp());
  const filesDir = path.join(backupDir, "files");
  ensureDir(filesDir);

  const sources = collectExisting(defaultPaths(workspace));
  for (const file of sources) {
    const rel = safeRelativeFromWorkspace(workspace, file.sourcePath);
    const to = path.join(filesDir, rel);
    ensureDir(path.dirname(to));
    fs.copyFileSync(file.sourcePath, to);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    workspace,
    outRoot,
    files: sources.map((file) => ({
      ...file,
      backupRelativePath: safeRelativeFromWorkspace(workspace, file.sourcePath),
    })),
  };
  writeJson(path.join(backupDir, "manifest.json"), manifest);
  console.log(JSON.stringify({ ok: true, backupDir, files: sources.length }, null, 2));
}

function doList(flags) {
  const workspace = path.resolve(flags.get("--workspace") || process.cwd());
  const outRoot = path.resolve(flags.get("--out") || path.join(workspace, ".failsafe", "backups"));
  if (!fs.existsSync(outRoot)) {
    console.log(JSON.stringify({ ok: true, outRoot, backups: [] }, null, 2));
    return;
  }
  const backups = fs
    .readdirSync(outRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  console.log(JSON.stringify({ ok: true, outRoot, backups }, null, 2));
}

function loadManifest(backupDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(parsed.files)) {
    throw new Error("invalid manifest: files array missing");
  }
  return parsed;
}

function doRestore(flags) {
  const from = flags.get("--from");
  const confirm = flags.get("--confirm");
  const dryRun = flags.get("--dry-run") === "true";
  const workspace = path.resolve(flags.get("--workspace") || process.cwd());

  if (!from) {
    throw new Error("--from is required");
  }
  if (confirm !== "RESTORE") {
    throw new Error("--confirm RESTORE is required");
  }

  const backupDir = path.resolve(from);
  const manifest = loadManifest(backupDir);
  const filesDir = path.join(backupDir, "files");
  let restored = 0;

  for (const file of manifest.files) {
    const rel = String(file.backupRelativePath || "");
    if (!rel) continue;
    const fromFile = path.join(filesDir, rel);
    const toFile = path.join(workspace, rel);
    if (!fs.existsSync(fromFile)) {
      throw new Error(`backup file missing: ${fromFile}`);
    }

    const backupHash = sha256(fromFile);
    if (backupHash !== file.sha256) {
      throw new Error(`checksum mismatch for ${fromFile}`);
    }

    if (!dryRun) {
      ensureDir(path.dirname(toFile));
      fs.copyFileSync(fromFile, toFile);
    }
    restored += 1;
  }

  console.log(JSON.stringify({ ok: true, backupDir, workspace, restored, dryRun }, null, 2));
}

function main() {
  const { command, flags } = parseArgs(process.argv);
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "backup") {
    doBackup(flags);
    return;
  }
  if (command === "list") {
    doList(flags);
    return;
  }
  if (command === "restore") {
    doRestore(flags);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(`zo-resilience failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
