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
  node scripts/zo-resilience.mjs verify --from <backupDir>

Notes:
  - Backup captures runtime state files, not node_modules or build artifacts.
  - Backup includes planning data (.qore/projects/) with integrity checksums.
  - Restore requires --confirm RESTORE to reduce accidental overwrite risk.
  - Use 'verify' to check backup integrity without restoring.
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

function getPlanningProjectsPath(workspace) {
  return process.env.QORE_PROJECTS_DIR || path.join(workspace, ".qore", "projects");
}

function collectPlanningFiles(projectsPath) {
  const files = [];
  if (!fs.existsSync(projectsPath)) {
    return files;
  }
  const projects = fs.readdirSync(projectsPath, { withFileTypes: true });
  for (const projectDir of projects) {
    if (!projectDir.isDirectory()) continue;
    const projectId = projectDir.name;
    const projectPath = path.join(projectsPath, projectId);
    collectFilesRecursively(projectPath, projectPath, files, projectId);
  }
  return files;
}

function collectFilesRecursively(dir, baseDir, files, projectId) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(fullPath, baseDir, files, projectId);
    } else {
      const relPath = path.relative(baseDir, fullPath);
      const stat = fs.statSync(fullPath);
      files.push({
        sourcePath: fullPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        sha256: sha256(fullPath),
        projectId,
        backupRelativePath: path.join(projectId, relPath),
      });
    }
  }
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

  // Collect existing default files
  const sources = collectExisting(defaultPaths(workspace));
  for (const file of sources) {
    const rel = safeRelativeFromWorkspace(workspace, file.sourcePath);
    const to = path.join(filesDir, rel);
    ensureDir(path.dirname(to));
    fs.copyFileSync(file.sourcePath, to);
  }

  // Collect planning data files
  const planningPath = getPlanningProjectsPath(workspace);
  const planningFiles = collectPlanningFiles(planningPath);
  for (const file of planningFiles) {
    const rel = path.join(".qore", "projects", file.backupRelativePath);
    const to = path.join(filesDir, rel);
    ensureDir(path.dirname(to));
    fs.copyFileSync(file.sourcePath, to);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    workspace,
    outRoot,
    backupType: "full",
    includesPlanningData: true,
    files: [
      ...sources.map((file) => ({
        ...file,
        backupRelativePath: safeRelativeFromWorkspace(workspace, file.sourcePath),
      })),
      ...planningFiles.map((file) => ({
        ...file,
        backupRelativePath: path.join(".qore", "projects", file.backupRelativePath),
      })),
    ],
    planningProjects: planningFiles.map((f) => f.projectId).filter((v, i, a) => a.indexOf(v) === i),
    planningChecksumFile: ".qore/projects/checksums.json",
  };
  writeJson(path.join(backupDir, "manifest.json"), manifest);
  console.log(JSON.stringify({ ok: true, backupDir, files: sources.length, planningProjects: manifest.planningProjects.length }, null, 2));
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

function verifyPlanningChecksums(backupDir, workspace) {
  const filesDir = path.join(backupDir, "files", ".qore", "projects");
  if (!fs.existsSync(filesDir)) {
    return { valid: false, error: "planning projects directory not found in backup" };
  }

  const projects = fs.readdirSync(filesDir, { withFileTypes: true });
  for (const projectDir of projects) {
    if (!projectDir.isDirectory()) continue;
    const projectId = projectDir.name;
    const checksumsPath = path.join(filesDir, projectId, "checksums.json");
    
    if (!fs.existsSync(checksumsPath)) {
      return { valid: false, error: `checksums.json not found for project: ${projectId}` };
    }

    let checksums;
    try {
      checksums = JSON.parse(fs.readFileSync(checksumsPath, "utf8"));
    } catch {
      return { valid: false, error: `invalid checksums.json for project: ${projectId}` };
    }

    // Handle StoreIntegrity format: { version, generatedAt, files: [{file, hash, size, lastModified}] }
    const fileEntries = checksums.files || [];
    if (!Array.isArray(fileEntries)) {
      return { valid: false, error: `invalid checksums.files format for project: ${projectId}` };
    }

    for (const entry of fileEntries) {
      const filePath = entry.file;
      const expectedHash = entry.hash;
      if (!filePath || !expectedHash) continue;
      
      const fullPath = path.join(filesDir, projectId, filePath);
      if (!fs.existsSync(fullPath)) {
        return { valid: false, error: `file missing: ${projectId}/${filePath}` };
      }
      const actualHash = sha256(fullPath);
      if (actualHash !== expectedHash) {
        return { valid: false, error: `checksum mismatch: ${projectId}/${filePath}` };
      }
    }
  }
  return { valid: true };
}

function doVerify(flags) {
  const from = flags.get("--from");
  if (!from) {
    throw new Error("--from is required");
  }
  const backupDir = path.resolve(from);
  const workspace = path.resolve(flags.get("--workspace") || process.cwd());

  const manifest = loadManifest(backupDir);
  const filesDir = path.join(backupDir, "files");
  let verified = 0;
  let errors = [];

  for (const file of manifest.files) {
    const rel = String(file.backupRelativePath || "");
    if (!rel) continue;
    const fromFile = path.join(filesDir, rel);
    if (!fs.existsSync(fromFile)) {
      errors.push(`backup file missing: ${rel}`);
      continue;
    }
    const actualHash = sha256(fromFile);
    if (actualHash !== file.sha256) {
      errors.push(`checksum mismatch: ${rel}`);
      continue;
    }
    verified += 1;
  }

  // Verify planning checksums if present
  const planningCheck = verifyPlanningChecksums(backupDir, workspace);
  if (!planningCheck.valid) {
    errors.push(`planning integrity check failed: ${planningCheck.error}`);
  }

  console.log(JSON.stringify({
    ok: errors.length === 0,
    backupDir,
    verified,
    total: manifest.files.length,
    planningIntegrity: planningCheck.valid,
    errors: errors.length > 0 ? errors : undefined,
  }, null, 2));
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
  let planningRestored = 0;

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
    if (rel.startsWith(".qore" + path.sep + "projects")) {
      planningRestored += 1;
    }
  }

  // Verify planning data integrity after restore
  let planningValid = false;
  if (!dryRun && planningRestored > 0) {
    const planningCheck = verifyPlanningChecksums(backupDir, workspace);
    planningValid = planningCheck.valid;
    if (!planningValid) {
      console.error(`WARNING: planning integrity check failed: ${planningCheck.error}`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    backupDir,
    workspace,
    restored,
    planningRestored,
    planningIntegrityVerified: planningValid,
    dryRun
  }, null, 2));
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
  if (command === "verify") {
    doVerify(flags);
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
