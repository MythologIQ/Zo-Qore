import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const root = process.cwd();
const destination = path.resolve(root, "zo", "ui-shell", "shared");
const localSource = path.resolve(root, "..", "FailSafe", "FailSafe", "extension", "src", "roadmap", "ui");
const branch = process.env.FAILSAFE_UI_BRANCH || "main";
const failsafeRepo = process.env.FAILSAFE_UI_REPO || "https://github.com/MythologIQ/failsafe.git";
const repoUiSubdir = process.env.FAILSAFE_UI_SUBDIR || "FailSafe/extension/src/roadmap/ui";

function log(message) {
  process.stdout.write(`[sync-failsafe-ui] ${message}\n`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function countFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(full);
      continue;
    }
    total += 1;
  }
  return total;
}

function copyTree(sourceDir) {
  ensureDir(destination);
  fs.cpSync(sourceDir, destination, { recursive: true });
}

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function syncFromLocal() {
  if (!fs.existsSync(localSource)) {
    throw new Error(`local UI source not found: ${localSource}`);
  }
  log(`sync source: local (${localSource})`);
  copyTree(localSource);
}

function syncFromRemoteGit() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-ui-sync-"));
  try {
    log(`sync source: repo (${failsafeRepo}#${branch})`);
    execSync(`git clone --depth 1 --filter=blob:none --sparse --branch "${branch}" "${failsafeRepo}" "${tempRoot}"`, {
      stdio: "pipe",
    });
    execSync(`git -C "${tempRoot}" sparse-checkout set "${repoUiSubdir}"`, { stdio: "pipe" });
    const remoteSource = path.join(tempRoot, ...repoUiSubdir.split("/"));
    if (!fs.existsSync(remoteSource)) {
      throw new Error(`UI path not found in cloned repo: ${repoUiSubdir}`);
    }
    copyTree(remoteSource);
  } finally {
    removeIfExists(tempRoot);
  }
}

function syncFromRemoteRaw() {
  const rawBase = process.env.FAILSAFE_UI_RAW_BASE || `https://raw.githubusercontent.com/MythologIQ/failsafe/${branch}/${repoUiSubdir}`;
  const manifestUrl = `${rawBase}/.failsafe-ui-manifest.json`;
  log(`sync source fallback: raw (${rawBase})`);
  throw new Error(
    `git sparse sync failed and raw sync needs a manifest at ${manifestUrl}. Set FAILSAFE_UI_SOURCE=local or install git.`
  );
}

function main() {
  removeIfExists(destination);
  ensureDir(destination);

  const forceRemote = process.env.FAILSAFE_UI_SOURCE === "remote";
  const forceLocal = process.env.FAILSAFE_UI_SOURCE === "local";

  if (forceLocal) {
    syncFromLocal();
    log(`synced ${countFiles(destination)} files to ${destination}`);
    return;
  }

  if (!forceRemote && fs.existsSync(localSource)) {
    syncFromLocal();
    log(`synced ${countFiles(destination)} files to ${destination}`);
    return;
  }

  try {
    syncFromRemoteGit();
    log(`synced ${countFiles(destination)} files to ${destination}`);
  } catch (error) {
    removeIfExists(destination);
    ensureDir(destination);
    syncFromRemoteRaw();
    log(`synced ${countFiles(destination)} files to ${destination}`);
    throw error;
  }
}

Promise.resolve()
  .then(main)
  .catch((error) => {
  log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
  });
