import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

/**
 * Update record representing an installed or available version
 */
export interface UpdateRecord {
  version: string;
  installedAt?: string;
  installedBy?: string;
  releaseNotes?: string;
  checksum?: string;
  rollbackAvailable?: boolean;
  source?: "github" | "local" | "manual";
}

/**
 * Available update from remote source
 */
export interface AvailableUpdate {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl?: string;
  checksum?: string;
  breaking?: boolean;
  size?: number;
}

/**
 * Update check result
 */
export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updates: AvailableUpdate[];
  lastChecked: string;
  error?: string;
}

/**
 * Update history state persisted to disk
 */
interface UpdateState {
  currentVersion: string;
  history: UpdateRecord[];
  lastCheck?: string;
  autoCheckEnabled: boolean;
  autoCheckIntervalMs: number;
  rollbackVersions: string[];
}

const DEFAULT_STATE: UpdateState = {
  currentVersion: "1.0.0",
  history: [],
  autoCheckEnabled: true,
  autoCheckIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  rollbackVersions: [],
};

/**
 * Manages application updates, version tracking, and rollback
 */
export class UpdateManager {
  private readonly stateDir: string;
  private readonly stateFile: string;
  private readonly backupDir: string;
  private state: UpdateState;
  private checkTimer: NodeJS.Timeout | undefined;
  private lastCheckResult: UpdateCheckResult | undefined;

  constructor(
    private readonly projectRoot: string = process.cwd(),
    private readonly updateSourceUrl?: string,
  ) {
    // Store update state in user config directory
    this.stateDir = path.join(os.homedir(), ".config", "failsafe-qore");
    this.stateFile = path.join(this.stateDir, "updates.json");
    this.backupDir = path.join(this.stateDir, "backups");
    this.state = this.loadState();
  }

  /**
   * Load state from disk
   */
  private loadState(): UpdateState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const content = fs.readFileSync(this.stateFile, "utf-8");
        const parsed = JSON.parse(content) as Partial<UpdateState>;
        return { ...DEFAULT_STATE, ...parsed };
      }
    } catch (error) {
      console.error("Failed to load update state:", error);
    }

    // Initialize with current version from package.json
    const state = { ...DEFAULT_STATE };
    state.currentVersion = this.getPackageVersion();
    return state;
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      console.error("Failed to save update state:", error);
    }
  }

  /**
   * Get version from package.json
   */
  private getPackageVersion(): string {
    try {
      const pkgPath = path.join(this.projectRoot, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        return pkg.version || "0.0.0";
      }
    } catch (error) {
      console.error("Failed to read package.json:", error);
    }
    return "0.0.0";
  }

  /**
   * Get current version info
   */
  getCurrentVersion(): string {
    // Always read fresh from package.json
    return this.getPackageVersion();
  }

  /**
   * Get update history
   */
  getHistory(): UpdateRecord[] {
    return [...this.state.history];
  }

  /**
   * Get available rollback versions
   */
  getRollbackVersions(): string[] {
    return [...this.state.rollbackVersions];
  }

  /**
   * Check if a rollback is available
   */
  canRollback(): boolean {
    return this.state.rollbackVersions.length > 0;
  }

  /**
   * Compare semver versions
   * Returns: -1 if a < b, 0 if equal, 1 if a > b
   */
  private compareVersions(a: string, b: string): number {
    const parseVersion = (v: string): number[] => {
      return v
        .replace(/^v/, "")
        .split(".")
        .map((n) => parseInt(n, 10) || 0);
    };

    const aParts = parseVersion(a);
    const bParts = parseVersion(b);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = this.getCurrentVersion();
    const result: UpdateCheckResult = {
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      updates: [],
      lastChecked: new Date().toISOString(),
    };

    try {
      // Try GitHub releases first if no custom URL
      const updates = await this.fetchAvailableUpdates();
      result.updates = updates;

      if (updates.length > 0) {
        // Sort by version descending
        updates.sort((a, b) => this.compareVersions(b.version, a.version));
        result.latestVersion = updates[0].version;
        result.updateAvailable =
          this.compareVersions(updates[0].version, currentVersion) > 0;
      }

      this.state.lastCheck = result.lastChecked;
      this.saveState();
      this.lastCheckResult = result;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Unknown error checking updates";
    }

    return result;
  }

  /**
   * Fetch available updates from source
   */
  private async fetchAvailableUpdates(): Promise<AvailableUpdate[]> {
    // If custom URL provided, use that
    if (this.updateSourceUrl) {
      return this.fetchFromCustomSource(this.updateSourceUrl);
    }

    // Default: check GitHub releases
    return this.fetchFromGitHub();
  }

  /**
   * Fetch updates from GitHub releases
   */
  private async fetchFromGitHub(): Promise<AvailableUpdate[]> {
    const owner = "MythologIQ";
    const repo = "failsafe-qore";
    const url = `https://api.github.com/repos/${owner}/${repo}/releases`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "FailSafe-Qore-Updater",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No releases yet - this is fine
        return [];
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases = (await response.json()) as Array<{
      tag_name: string;
      published_at: string;
      body: string;
      assets: Array<{
        name: string;
        browser_download_url: string;
        size: number;
      }>;
      prerelease: boolean;
    }>;

    return releases
      .filter((r) => !r.prerelease)
      .map((release) => ({
        version: release.tag_name.replace(/^v/, ""),
        releaseDate: release.published_at,
        releaseNotes: release.body || "No release notes",
        downloadUrl: release.assets.find((a) => a.name.endsWith(".tar.gz"))
          ?.browser_download_url,
        size: release.assets.find((a) => a.name.endsWith(".tar.gz"))?.size,
      }));
  }

  /**
   * Fetch updates from custom source
   */
  private async fetchFromCustomSource(
    url: string,
  ): Promise<AvailableUpdate[]> {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "FailSafe-Qore-Updater",
      },
    });

    if (!response.ok) {
      throw new Error(`Update source error: ${response.status}`);
    }

    return (await response.json()) as AvailableUpdate[];
  }

  /**
   * Create backup of current installation for rollback
   */
  async createBackup(): Promise<string> {
    const version = this.getCurrentVersion();
    const timestamp = Date.now();
    const backupName = `backup-${version}-${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true, mode: 0o700 });
    }

    // Create backup manifest
    const manifest = {
      version,
      createdAt: new Date().toISOString(),
      files: [] as string[],
    };

    // For now, just record the version - actual file backup would require
    // copying dist/, package.json, etc.
    fs.writeFileSync(
      path.join(this.backupDir, `${backupName}.json`),
      JSON.stringify(manifest, null, 2),
    );

    // Track this version as rollback-able
    if (!this.state.rollbackVersions.includes(version)) {
      this.state.rollbackVersions.unshift(version);
      // Keep only last 5 rollback versions
      this.state.rollbackVersions = this.state.rollbackVersions.slice(0, 5);
      this.saveState();
    }

    return backupPath;
  }

  /**
   * Record an update installation
   */
  recordUpdate(
    version: string,
    installedBy: string,
    releaseNotes?: string,
  ): void {
    const record: UpdateRecord = {
      version,
      installedAt: new Date().toISOString(),
      installedBy,
      releaseNotes,
      rollbackAvailable: this.state.rollbackVersions.length > 0,
    };

    this.state.history.unshift(record);
    // Keep only last 50 records
    this.state.history = this.state.history.slice(0, 50);
    this.state.currentVersion = version;
    this.saveState();
  }

  /**
   * Get last check result
   */
  getLastCheckResult(): UpdateCheckResult | undefined {
    return this.lastCheckResult;
  }

  /**
   * Get auto-check settings
   */
  getAutoCheckSettings(): {
    enabled: boolean;
    intervalMs: number;
    lastCheck?: string;
  } {
    return {
      enabled: this.state.autoCheckEnabled,
      intervalMs: this.state.autoCheckIntervalMs,
      lastCheck: this.state.lastCheck,
    };
  }

  /**
   * Update auto-check settings
   */
  setAutoCheckSettings(enabled: boolean, intervalMs?: number): void {
    this.state.autoCheckEnabled = enabled;
    if (intervalMs !== undefined) {
      this.state.autoCheckIntervalMs = intervalMs;
    }
    this.saveState();

    // Restart timer if needed
    if (enabled) {
      this.startAutoCheck();
    } else {
      this.stopAutoCheck();
    }
  }

  /**
   * Start auto-check timer
   */
  startAutoCheck(): void {
    this.stopAutoCheck();
    if (this.state.autoCheckEnabled) {
      this.checkTimer = setInterval(() => {
        this.checkForUpdates().catch(console.error);
      }, this.state.autoCheckIntervalMs);
    }
  }

  /**
   * Stop auto-check timer
   */
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Generate checksum for a file
   */
  generateChecksum(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Get state directory path
   */
  getStateDir(): string {
    return this.stateDir;
  }

  /**
   * Get backup directory path
   */
  getBackupDir(): string {
    return this.backupDir;
  }
}

// Singleton instance
let updateManagerInstance: UpdateManager | undefined;

export function getUpdateManager(
  projectRoot?: string,
  updateSourceUrl?: string,
): UpdateManager {
  if (!updateManagerInstance) {
    updateManagerInstance = new UpdateManager(projectRoot, updateSourceUrl);
  }
  return updateManagerInstance;
}
