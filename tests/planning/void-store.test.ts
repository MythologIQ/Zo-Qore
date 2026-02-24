import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createVoidStore, VoidStore } from "../../runtime/planning/VoidStore";
import type { VoidThought } from "@mythologiq/qore-contracts";

describe("VoidStore", () => {
  let basePath: string;
  const projectId = "test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "void-store-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("addThought", () => {
    it("adds a thought to thoughts.jsonl", async () => {
      const store = createVoidStore(basePath, projectId);
      const thought: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Test thought content",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: ["test"],
        status: "raw",
      };

      const result = await store.addThought(thought);

      expect(result.thoughtId).toBe("thought-1");
      expect(result.content).toBe("Test thought content");
    });

    it("appends multiple thoughts without overwriting", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "First thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Second thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const allThoughts = await store.getAllThoughts();
      expect(allThoughts).toHaveLength(2);
    });
  });

  describe("getThought", () => {
    it("returns thought by id", async () => {
      const store = createVoidStore(basePath, projectId);
      const thought: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Test thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought);
      const result = await store.getThought("thought-1");

      expect(result).not.toBeNull();
      expect(result?.content).toBe("Test thought");
    });

    it("returns null for non-existent thought", async () => {
      const store = createVoidStore(basePath, projectId);

      const result = await store.getThought("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getAllThoughts", () => {
    it("returns empty array when file doesn't exist", async () => {
      const store = createVoidStore(basePath, projectId);

      const result = await store.getAllThoughts();

      expect(result).toEqual([]);
    });

    it("returns all thoughts", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "First",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Second",
        source: "voice",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const result = await store.getAllThoughts();
      expect(result).toHaveLength(2);
    });
  });

  describe("getUnclaimedThoughts", () => {
    it("returns only raw status thoughts", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Raw thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Claimed thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "claimed",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const result = await store.getUnclaimedThoughts();
      expect(result).toHaveLength(1);
      expect(result[0].thoughtId).toBe("thought-1");
    });
  });

  describe("updateThoughtStatus", () => {
    it("updates thought status from raw to claimed", async () => {
      const store = createVoidStore(basePath, projectId);
      const thought: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Test thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought);
      const result = await store.updateThoughtStatus("thought-1", "claimed");

      expect(result?.status).toBe("claimed");
    });

    it("returns null for non-existent thought", async () => {
      const store = createVoidStore(basePath, projectId);

      const result = await store.updateThoughtStatus("non-existent", "claimed");

      expect(result).toBeNull();
    });
  });

  describe("getThoughtsByTags", () => {
    it("returns thoughts matching any of the provided tags", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Thought with tag1",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: ["tag1", "tag2"],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Thought with tag3",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: ["tag3"],
        status: "raw",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const result = await store.getThoughtsByTags(["tag1", "tag3"]);
      expect(result).toHaveLength(2);
    });
  });
});
