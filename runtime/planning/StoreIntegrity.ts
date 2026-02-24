import { createHash } from "crypto";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { createLogger, planningLogger } from "./Logger";
import { PlanningStoreError } from "./StoreErrors";

interface ChecksumEntry {
  file: string;
  hash: string;
  size: number;
  lastModified: number;
}

interface Checksums {
  version: string;
  generatedAt: string;
  files: ChecksumEntry[];
}

const logger = createLogger("store-integrity");
const CHECKSUM_FILE = "checksums.json";
const CHECKSUM_VERSION = "1.0";

export class StoreIntegrity {
  constructor(private basePath: string) {}

  private getChecksumPath(projectId: string): string {
    return join(this.basePath, projectId, CHECKSUM_FILE);
  }

  async computeFileHash(filePath: string): Promise<ChecksumEntry> {
    const content = await readFile(filePath);
    const stats = await stat(filePath);
    const hash = createHash("sha256").update(content).digest("hex");

    return {
      file: filePath,
      hash,
      size: stats.size,
      lastModified: stats.mtimeMs,
    };
  }

  async updateChecksums(projectId: string): Promise<void> {
    logger.info("Updating checksums", { projectId });
    const projectPath = join(this.basePath, projectId);

    const entries: ChecksumEntry[] = [];

    const subdirs = ["void", "reveal", "constellation", "path", "risk", "autonomy"];

    for (const subdir of subdirs) {
      const subdirPath = join(projectPath, subdir);
      try {
        const files = await readdir(subdirPath);
        for (const file of files) {
          const filePath = join(subdirPath, file);
          try {
            const entry = await this.computeFileHash(filePath);
            entry.file = `${subdir}/${file}`;
            entries.push(entry);
          } catch {
            logger.warn("Skipping file during checksum", { file: filePath });
          }
        }
      } catch {
        logger.debug("Subdir not found, skipping", { subdir });
      }
    }

    const projectJsonPath = join(projectPath, "project.json");
    try {
      const entry = await this.computeFileHash(projectJsonPath);
      entry.file = "project.json";
      entries.push(entry);
    } catch {
      logger.debug("project.json not found, skipping");
    }

    const checksums: Checksums = {
      version: CHECKSUM_VERSION,
      generatedAt: new Date().toISOString(),
      files: entries,
    };

    const checksumPath = this.getChecksumPath(projectId);
    await writeFile(checksumPath, JSON.stringify(checksums, null, 2), "utf-8");

    logger.info("Checksums updated", { projectId, fileCount: entries.length });
  }

  async verify(projectId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    logger.info("Verifying store integrity", { projectId });
    const errors: string[] = [];
    const projectPath = join(this.basePath, projectId);
    const checksumPath = this.getChecksumPath(projectId);

    let checksums: Checksums;
    try {
      const content = await readFile(checksumPath, "utf-8");
      checksums = JSON.parse(content);
    } catch (e) {
      throw new PlanningStoreError(
        "INTEGRITY_CHECK_FAILED",
        `Failed to read checksums: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId },
      );
    }

    for (const entry of checksums.files) {
      const filePath = join(projectPath, entry.file);

      let currentEntry: ChecksumEntry;
      try {
        currentEntry = await this.computeFileHash(filePath);
      } catch {
        errors.push(`File missing: ${entry.file}`);
        continue;
      }

      if (currentEntry.hash !== entry.hash) {
        errors.push(
          `Checksum mismatch for ${entry.file}: expected ${entry.hash}, got ${currentEntry.hash}`,
        );
      }

      if (currentEntry.size !== entry.size) {
        errors.push(`Size mismatch for ${entry.file}`);
      }
    }

    const valid = errors.length === 0;
    logger.info("Integrity check complete", { projectId, valid, errorCount: errors.length, errors });

    return { valid, errors };
  }

  async getChecksum(projectId: string, file: string): Promise<string | null> {
    const checksumPath = this.getChecksumPath(projectId);
    try {
      const content = await readFile(checksumPath, "utf-8");
      const checksums: Checksums = JSON.parse(content);
      const entry = checksums.files.find((f) => f.file === file);
      return entry?.hash ?? null;
    } catch {
      return null;
    }
  }
}

export function createStoreIntegrity(basePath: string): StoreIntegrity {
  return new StoreIntegrity(basePath);
}