import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createIntegrityChecker, IntegrityChecker } from "../../runtime/planning/IntegrityChecker";
import { createProjectStore } from "../../runtime/planning/ProjectStore";

describe("IntegrityChecker", () => {
  let basePath: string;
  let checker: IntegrityChecker;
  const projectId = "test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "integrity-checker-test-"));

    const store = createProjectStore(projectId, basePath);
    await store.create({
      name: "Test Project",
      createdBy: "test-actor",
    });

    checker = createIntegrityChecker(basePath, projectId);
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("checkPL_INT_01", () => {
    it("passes for valid store", async () => {
      const result = await checker.checkPL_INT_01(projectId);

      expect(result.checkId).toBe("PL-INT-01");
      expect(result.passed).toBe(true);
    });

    it("fails when file is modified", async () => {
      await writeFile(join(basePath, projectId, "project.json"), '{"name": "modified"}', "utf-8");

      const result = await checker.checkPL_INT_01(projectId);

      expect(result.passed).toBe(false);
      expect(result.details[0]).toContain("Checksum mismatch");
    });
  });

  describe("checkPL_INT_02", () => {
    it("passes for consistent ledger", async () => {
      const result = await checker.checkPL_INT_02(projectId);

      expect(result.checkId).toBe("PL-INT-02");
      expect(result.passed).toBe(true);
    });
  });

  describe("checkPL_INT_03", () => {
    it("passes when no clusters exist", async () => {
      const result = await checker.checkPL_INT_03(projectId);

      expect(result.checkId).toBe("PL-INT-03");
      expect(result.passed).toBe(true);
    });

    it("fails when cluster references missing thought", async () => {
      await mkdir(join(basePath, projectId, "reveal"), { recursive: true });
      await writeFile(
        join(basePath, projectId, "reveal", "clusters.json"),
        JSON.stringify({
          clusters: [
            {
              clusterId: "cluster-1",
              projectId,
              label: "Test",
              thoughtIds: ["nonexistent-thought"],
              notes: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: "draft",
            },
          ],
        }),
        "utf-8",
      );

      const result = await checker.checkPL_INT_03(projectId);

      expect(result.passed).toBe(false);
      expect(result.details[0]).toContain("references missing thought");
    });
  });

  describe("checkPL_INT_04", () => {
    it("passes when no constellation exists", async () => {
      const result = await checker.checkPL_INT_04(projectId);

      expect(result.checkId).toBe("PL-INT-04");
      expect(result.passed).toBe(true);
    });
  });

  describe("checkPL_INT_05", () => {
    it("passes when no phases exist", async () => {
      const result = await checker.checkPL_INT_05(projectId);

      expect(result.checkId).toBe("PL-INT-05");
      expect(result.passed).toBe(true);
    });
  });

  describe("checkPL_INT_06", () => {
    it("passes when no risks exist", async () => {
      const result = await checker.checkPL_INT_06(projectId);

      expect(result.checkId).toBe("PL-INT-06");
      expect(result.passed).toBe(true);
    });

    it("fails when risk references missing phase", async () => {
      await mkdir(join(basePath, projectId, "risk"), { recursive: true });
      await writeFile(
        join(basePath, projectId, "risk", "register.json"),
        JSON.stringify({
          risks: [
            {
              riskId: "risk-1",
              projectId,
              phaseId: "nonexistent-phase",
              description: "Test risk",
              likelihood: "medium",
              impact: "medium",
              mitigation: "None",
              owner: "test-actor",
              status: "identified",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
        "utf-8",
      );

      const result = await checker.checkPL_INT_06(projectId);

      expect(result.passed).toBe(false);
      expect(result.details[0]).toContain("references missing phase");
    });
  });

  describe("checkPL_TRC_01", () => {
    it("passes for empty project", async () => {
      const result = await checker.checkPL_TRC_01(projectId);

      expect(result.checkId).toBe("PL-TRC-01");
      expect(result.passed).toBe(true);
    });

    it("fails when views beyond Void are populated but Void is empty", async () => {
      await mkdir(join(basePath, projectId, "reveal"), { recursive: true });
      await writeFile(
        join(basePath, projectId, "reveal", "clusters.json"),
        JSON.stringify({ clusters: [] }),
        "utf-8",
      );

      const result = await checker.checkPL_TRC_01(projectId);

      expect(result.passed).toBe(false);
      expect(result.details[0]).toContain("Void is empty");
    });
  });

  describe("checkPL_TRC_02", () => {
    it("passes when no orphan thoughts", async () => {
      const result = await checker.checkPL_TRC_02(projectId);

      expect(result.checkId).toBe("PL-TRC-02");
      expect(result.passed).toBe(true);
    });
  });

  describe("checkPL_TRC_03", () => {
    it("passes for empty project", async () => {
      const result = await checker.checkPL_TRC_03(projectId);

      expect(result.checkId).toBe("PL-TRC-03");
      expect(result.passed).toBe(true);
    });

    it("fails when some views have content but others are empty", async () => {
      await mkdir(join(basePath, projectId, "void"), { recursive: true });
      await writeFile(
        join(basePath, projectId, "void", "thoughts.jsonl"),
        JSON.stringify({
          thoughtId: "thought-1",
          projectId,
          content: "Test",
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        }) + "\n",
        "utf-8",
      );

      const result = await checker.checkPL_TRC_03(projectId);

      expect(result.passed).toBe(false);
      expect(result.details[0]).toContain("Empty views");
    });
  });

  describe("runAllChecks", () => {
    it("runs all checks and returns summary", async () => {
      const summary = await checker.runAllChecks(projectId);

      expect(summary.totalChecks).toBe(9);
      expect(summary.results).toHaveLength(9);
      expect(summary.passed + summary.failed).toBe(9);
      expect(summary.overallPassed).toBeDefined();
    });
  });

  describe("runCheck", () => {
    it("runs specific check by ID", async () => {
      const result = await checker.runCheck(projectId, "PL-INT-01");

      expect(result.checkId).toBe("PL-INT-01");
    });

    it("throws for unknown check ID", async () => {
      await expect(checker.runCheck(projectId, "PL-UNKNOWN" as any)).rejects.toThrow(
        "Unknown check ID",
      );
    });
  });
});
