import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createPlanningLedger, PlanningLedger } from "../../runtime/planning/PlanningLedger";

describe("PlanningLedger", () => {
  let basePath: string;
  let ledger: PlanningLedger;
  const projectId = "test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "planning-ledger-test-"));
    ledger = createPlanningLedger(projectId, basePath);
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("appendEntry", () => {
    it("appends entry to ledger file", async () => {
      const entry = await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      expect(entry.entryId).toBeDefined();
      expect(entry.projectId).toBe(projectId);
      expect(entry.view).toBe("void");
      expect(entry.action).toBe("create");
      expect(entry.timestamp).toBeDefined();
    });

    it("generates unique entry IDs", async () => {
      const entry1 = await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      const entry2 = await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-2",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "def456",
      });

      expect(entry1.entryId).not.toBe(entry2.entryId);
    });

    it("includes optional payload", async () => {
      const entry = await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
        payload: { source: "voice", status: "raw" },
      });

      expect(entry.payload).toEqual({ source: "voice", status: "raw" });
    });
  });

  describe("getEntries", () => {
    it("returns empty array when no entries exist", async () => {
      const entries = await ledger.getEntries();

      expect(entries).toEqual([]);
    });

    it("returns all entries", async () => {
      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      await ledger.appendEntry({
        projectId,
        view: "reveal",
        action: "create",
        artifactId: "cluster-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "def456",
      });

      const entries = await ledger.getEntries();

      expect(entries).toHaveLength(2);
    });

    it("filters by view", async () => {
      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      await ledger.appendEntry({
        projectId,
        view: "reveal",
        action: "create",
        artifactId: "cluster-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "def456",
      });

      const entries = await ledger.getEntries({ view: "void" });

      expect(entries).toHaveLength(1);
      expect(entries[0].view).toBe("void");
    });

    it("filters by action", async () => {
      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "update",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: "abc123",
        checksumAfter: "def456",
      });

      const entries = await ledger.getEntries({ action: "create" });

      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("create");
    });

    it("filters by artifactId", async () => {
      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-2",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "def456",
      });

      const entries = await ledger.getEntries({ artifactId: "thought-1" });

      expect(entries).toHaveLength(1);
      expect(entries[0].artifactId).toBe("thought-1");
    });

    it("respects limit option", async () => {
      for (let i = 0; i < 5; i++) {
        await ledger.appendEntry({
          projectId,
          view: "void",
          action: "create",
          artifactId: `thought-${i}`,
          actorId: "test-actor",
          checksumBefore: null,
          checksumAfter: `hash${i}`,
        });
      }

      const entries = await ledger.getEntries({ limit: 3 });

      expect(entries).toHaveLength(3);
    });
  });

  describe("getSummary", () => {
    it("returns correct summary counts", async () => {
      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "update",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: "abc123",
        checksumAfter: "def456",
      });

      await ledger.appendEntry({
        projectId,
        view: "reveal",
        action: "create",
        artifactId: "cluster-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "ghi789",
      });

      const summary = await ledger.getSummary();

      expect(summary.totalEntries).toBe(3);
      expect(summary.byView.void).toBe(2);
      expect(summary.byView.reveal).toBe(1);
      expect(summary.byAction.create).toBe(2);
      expect(summary.byAction.update).toBe(1);
    });
  });

  describe("verifyConsistency", () => {
    it("returns valid when ledger and history match", async () => {
      await ledger.appendEntry({
        projectId,
        view: "void",
        action: "create",
        artifactId: "thought-1",
        actorId: "test-actor",
        checksumBefore: null,
        checksumAfter: "abc123",
      });

      const result = await ledger.verifyConsistency();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
