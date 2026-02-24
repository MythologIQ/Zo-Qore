import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { StoreIntegrity } from "../../runtime/planning/StoreIntegrity";

describe("StoreIntegrity", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "store-integrity-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("computeFileHash", () => {
    it("computes SHA-256 hash of a file", async () => {
      const integrity = new StoreIntegrity(basePath);
      const testFile = join(basePath, "test.txt");
      await writeFile(testFile, "hello world");

      const result = await integrity.computeFileHash(testFile);

      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(64);
      expect(result.size).toBe(11);
    });

    it("returns null for non-existent file", async () => {
      const integrity = new StoreIntegrity(basePath);
      const testFile = join(basePath, "nonexistent.txt");

      await expect(integrity.computeFileHash(testFile)).rejects.toThrow();
    });
  });

  describe("updateChecksums", () => {
    it("creates checksums.json with file hashes", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId, "void"), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");
      await writeFile(join(basePath, projectId, "void", "thoughts.jsonl"), "test entry\n", "utf-8");

      await integrity.updateChecksums(projectId);

      const checksumPath = join(basePath, projectId, "checksums.json");
      const content = await readFile(checksumPath, "utf-8");
      const checksums = JSON.parse(content);

      expect(checksums.version).toBe("1.0");
      expect(checksums.files).toHaveLength(2);
      expect(checksums.files.find((f: { file: string }) => f.file === "project.json")).toBeDefined();
    });

    it("skips missing subdirectories", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");

      await expect(integrity.updateChecksums(projectId)).resolves.not.toThrow();
    });
  });

  describe("verify", () => {
    it("returns valid when checksums match", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");
      await integrity.updateChecksums(projectId);

      const result = await integrity.verify(projectId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns errors when file is modified", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");
      await integrity.updateChecksums(projectId);

      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "modified" }), "utf-8");

      const result = await integrity.verify(projectId);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("throws when checksums.json does not exist", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");

      await expect(integrity.verify(projectId)).rejects.toThrow();
    });
  });

  describe("getChecksum", () => {
    it("returns hash for existing file", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");
      await integrity.updateChecksums(projectId);

      const checksum = await integrity.getChecksum(projectId, "project.json");

      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64);
    });

    it("returns null for non-existent file", async () => {
      const integrity = new StoreIntegrity(basePath);
      const projectId = "test-project";

      await mkdir(join(basePath, projectId), { recursive: true });
      await writeFile(join(basePath, projectId, "project.json"), JSON.stringify({ name: "test" }), "utf-8");
      await integrity.updateChecksums(projectId);

      const checksum = await integrity.getChecksum(projectId, "nonexistent.json");

      expect(checksum).toBeNull();
    });
  });
});
