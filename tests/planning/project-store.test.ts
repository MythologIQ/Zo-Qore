import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createProjectStore } from "../../runtime/planning/ProjectStore";
import { PlanningStoreError } from "../../runtime/planning/StoreErrors";

describe("ProjectStore", () => {
  let basePath: string;
  const projectId = "test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "project-store-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a new project with metadata", async () => {
      const store = createProjectStore(projectId, basePath);

      const project = await store.create({
        name: "Test Project",
        description: "A test project",
        createdBy: "test-actor",
      });

      expect(project.projectId).toBe(projectId);
      expect(project.name).toBe("Test Project");
      expect(project.description).toBe("A test project");
      expect(project.createdBy).toBe("test-actor");
      expect(project.pipelineState.void).toBe("empty");
    });

    it("throws PROJECT_ALREADY_EXISTS when project exists", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      await expect(
        store.create({
          name: "Duplicate Project",
          createdBy: "test-actor",
        }),
      ).rejects.toThrow(PlanningStoreError);
    });

    it("creates project directory structure", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const projectFile = await readFile(join(basePath, projectId, "project.json"), "utf-8");
      const project = JSON.parse(projectFile);

      expect(project).toBeDefined();
    });
  });

  describe("exists", () => {
    it("returns false for non-existent project", async () => {
      const store = createProjectStore(projectId, basePath);

      const result = await store.exists();

      expect(result).toBe(false);
    });

    it("returns true for existing project", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const result = await store.exists();

      expect(result).toBe(true);
    });
  });

  describe("get", () => {
    it("returns null for non-existent project", async () => {
      const store = createProjectStore(projectId, basePath);

      const result = await store.get();

      expect(result).toBeNull();
    });

    it("returns project for existing project", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        description: "Description",
        createdBy: "test-actor",
      });

      const result = await store.get();

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test Project");
    });
  });

  describe("update", () => {
    it("updates project metadata", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const updated = await store.update({
        name: "Updated Project",
      });

      expect(updated.name).toBe("Updated Project");
      expect(updated.updatedAt).not.toBeNull();
    });

    it("throws PROJECT_NOT_FOUND for non-existent project", async () => {
      const store = createProjectStore(projectId, basePath);

      await expect(
        store.update({ name: "Updated" }),
      ).rejects.toThrow(PlanningStoreError);
    });
  });

  describe("delete", () => {
    it("deletes project directory", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      await store.delete();

      const exists = await store.exists();
      expect(exists).toBe(false);
    });
  });

  describe("getVoidStore", () => {
    it("returns a VoidStore instance", async () => {
      const store = createProjectStore(projectId, basePath, { enableLedger: true });

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const voidStore = await store.getVoidStore();

      expect(voidStore).toBeDefined();
    });
  });

  describe("getViewStore", () => {
    it("returns a ViewStore instance for reveal", async () => {
      const store = createProjectStore(projectId, basePath, { enableLedger: true });

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const viewStore = await store.getViewStore("reveal");

      expect(viewStore).toBeDefined();
    });

    it("returns a ViewStore instance for path", async () => {
      const store = createProjectStore(projectId, basePath, { enableLedger: true });

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const viewStore = await store.getViewStore("path");

      expect(viewStore).toBeDefined();
    });
  });

  describe("verifyIntegrity", () => {
    it("returns valid for fresh project", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      const result = await store.verifyIntegrity();

      expect(result.valid).toBe(true);
    });
  });

  describe("updatePipelineState", () => {
    it("updates pipeline state for a view", async () => {
      const store = createProjectStore(projectId, basePath);

      await store.create({
        name: "Test Project",
        createdBy: "test-actor",
      });

      await store.updatePipelineState("void", "active");

      const project = await store.get();
      expect(project?.pipelineState.void).toBe("active");
    });

    it("throws PROJECT_NOT_FOUND for non-existent project", async () => {
      const store = createProjectStore(projectId, basePath);

      await expect(
        store.updatePipelineState("void", "active"),
      ).rejects.toThrow(PlanningStoreError);
    });
  });
});
