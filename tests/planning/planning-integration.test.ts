import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createProjectStore } from "../../runtime/planning/ProjectStore";
import { createVoidStore } from "../../runtime/planning/VoidStore";
import { createViewStore } from "../../runtime/planning/ViewStore";
import { createPlanningLedger } from "../../runtime/planning/PlanningLedger";
import { createIntegrityChecker } from "../../runtime/planning/IntegrityChecker";
import type { VoidThought, RevealCluster, PathPhase, RiskEntry } from "@mythologiq/qore-contracts";

describe("Planning Integration", () => {
  let basePath: string;
  const projectId = "integration-test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "planning-integration-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it("full pipeline: create project, add thoughts, create clusters, create phases, create risks", async () => {
    const projectStore = createProjectStore(projectId, basePath, { enableLedger: true });

    const project = await projectStore.create({
      name: "Integration Test Project",
      description: "Full pipeline integration test",
      createdBy: "integration-test-actor",
    });

    expect(project.projectId).toBe(projectId);
    expect(project.pipelineState.void).toBe("empty");

    await projectStore.updatePipelineState("void", "active");
    const updatedProject = await projectStore.get();
    expect(updatedProject?.pipelineState.void).toBe("active");

    const voidStore = await projectStore.getVoidStore();
    const thought: VoidThought = {
      thoughtId: "thought-1",
      projectId,
      content: "First idea for the project",
      source: "text",
      capturedAt: new Date().toISOString(),
      capturedBy: "integration-test-actor",
      tags: ["ideation"],
      status: "raw",
    };

    await voidStore.addThought(thought);

    const allThoughts = await voidStore.getAllThoughts();
    expect(allThoughts).toHaveLength(1);
    expect(allThoughts[0].content).toBe("First idea for the project");

    await voidStore.updateThoughtStatus("thought-1", "claimed");
    const claimedThought = await voidStore.getThought("thought-1");
    expect(claimedThought?.status).toBe("claimed");

    const revealStore = await projectStore.getViewStore("reveal");
    const clusters: { clusters: RevealCluster[] } = {
      clusters: [
        {
          clusterId: "cluster-1",
          projectId,
          label: "Core Ideas",
          thoughtIds: ["thought-1"],
          notes: "Main concepts to explore",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "formed",
        },
      ],
    };

    await revealStore.write(clusters);
    await projectStore.updatePipelineState("reveal", "active");

    const constellationStore = await projectStore.getViewStore("constellation");
    const constellation = {
      constellationId: "const-1",
      projectId,
      nodes: [
        {
          nodeId: "node-1",
          clusterId: "cluster-1",
          position: { x: 100, y: 100 },
        },
      ],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "mapped",
    };

    await constellationStore.write(constellation);
    await projectStore.updatePipelineState("constellation", "active");

    const pathStore = await projectStore.getViewStore("path");
    const phases: { phases: PathPhase[] } = {
      phases: [
        {
          phaseId: "phase-1",
          projectId,
          ordinal: 1,
          name: "Research Phase",
          objective: "Research and validate core ideas",
          sourceClusterIds: ["cluster-1"],
          tasks: [],
          status: "planned",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await pathStore.write(phases);
    await projectStore.updatePipelineState("path", "active");

    const riskStore = await projectStore.getViewStore("risk");
    const risks: { risks: RiskEntry[] } = {
      risks: [
        {
          riskId: "risk-1",
          projectId,
          phaseId: "phase-1",
          description: "May need more research time",
          likelihood: "medium",
          impact: "medium",
          mitigation: "Allocate buffer time",
          owner: "integration-test-actor",
          status: "identified",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await riskStore.write(risks);
    await projectStore.updatePipelineState("risk", "active");

    const finalProject = await projectStore.get();
    expect(finalProject?.pipelineState.void).toBe("active");
    expect(finalProject?.pipelineState.reveal).toBe("active");
    expect(finalProject?.pipelineState.constellation).toBe("active");
    expect(finalProject?.pipelineState.path).toBe("active");
    expect(finalProject?.pipelineState.risk).toBe("active");

    const ledger = await projectStore.getLedger();
    const ledgerEntries = await ledger.getEntries();
    expect(ledgerEntries.length).toBeGreaterThan(0);

    const summary = await ledger.getSummary();
    expect(summary.totalEntries).toBeGreaterThan(0);

    const integrityChecker = createIntegrityChecker(basePath, projectId);
    const integrityResult = await integrityChecker.checkPL_INT_01(projectId);
    expect(integrityResult.passed).toBe(true);

    const traceResult = await integrityChecker.checkPL_TRC_01(projectId);
    expect(traceResult.passed).toBe(true);
  });

  it("verifies data persists correctly across restarts", async () => {
    const projectStore1 = createProjectStore(projectId, basePath, { enableLedger: true });

    await projectStore1.create({
      name: "Persistence Test",
      createdBy: "test-actor",
    });

    const voidStore1 = await projectStore1.getVoidStore();
    const thought: VoidThought = {
      thoughtId: "persist-thought",
      projectId,
      content: "This should persist",
      source: "text",
      capturedAt: new Date().toISOString(),
      capturedBy: "test-actor",
      tags: [],
      status: "raw",
    };

    await voidStore1.addThought(thought);

    const projectStore2 = createProjectStore(projectId, basePath, { enableLedger: true });
    const voidStore2 = await projectStore2.getVoidStore();

    const thoughts = await voidStore2.getAllThoughts();
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].content).toBe("This should persist");
  });

  it("tracks all mutations in ledger with checksums", async () => {
    const projectStore = createProjectStore(projectId, basePath, { enableLedger: true });

    await projectStore.create({
      name: "Ledger Test",
      createdBy: "test-actor",
    });

    const voidStore = await projectStore.getVoidStore();
    const thought: VoidThought = {
      thoughtId: "ledger-test-thought",
      projectId,
      content: "Test content",
      source: "text",
      capturedAt: new Date().toISOString(),
      capturedBy: "test-actor",
      tags: [],
      status: "raw",
    };

    await voidStore.addThought(thought);

    const ledger = await projectStore.getLedger();
    const entries = await ledger.getEntries();

    const createProjectEntry = entries.find((e) => e.action === "create" && e.artifactId === projectId);
    expect(createProjectEntry).toBeDefined();
    expect(createProjectEntry?.checksumBefore).toBeNull();
    expect(createProjectEntry?.checksumAfter).toBeDefined();

    const addThoughtEntry = entries.find((e) => e.view === "void" && e.action === "create");
    expect(addThoughtEntry).toBeDefined();
    expect(addThoughtEntry?.checksumBefore).toBeDefined();
    expect(addThoughtEntry?.checksumAfter).toBeDefined();
  });

  it("integrity checker validates full pipeline", async () => {
    const projectStore = createProjectStore(projectId, basePath, { enableLedger: true });

    await projectStore.create({
      name: "Integrity Test",
      createdBy: "test-actor",
    });

    await projectStore.updatePipelineState("void", "active");

    const voidStore = await projectStore.getVoidStore();
    await voidStore.addThought({
      thoughtId: "int-thought-1",
      projectId,
      content: "Test",
      source: "text",
      capturedAt: new Date().toISOString(),
      capturedBy: "test-actor",
      tags: [],
      status: "raw",
    });

    const revealStore = await projectStore.getViewStore("reveal");
    await revealStore.write({
      clusters: [
        {
          clusterId: "int-cluster-1",
          projectId,
          label: "Test",
          thoughtIds: ["int-thought-1"],
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "formed",
        },
      ],
    });

    await projectStore.updatePipelineState("reveal", "active");

    const constellationStore = await projectStore.getViewStore("constellation");
    await constellationStore.write({
      constellationId: "int-const-1",
      projectId,
      nodes: [
        {
          nodeId: "int-node-1",
          clusterId: "int-cluster-1",
          position: { x: 100, y: 100 },
        },
      ],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "mapped",
    });

    await projectStore.updatePipelineState("constellation", "active");

    const pathStore = await projectStore.getViewStore("path");
    await pathStore.write({
      phases: [
        {
          phaseId: "int-phase-1",
          projectId,
          ordinal: 1,
          name: "Test Phase",
          objective: "Test objective",
          sourceClusterIds: ["int-cluster-1"],
          tasks: [],
          status: "planned",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    await projectStore.updatePipelineState("path", "active");

    const riskStore = await projectStore.getViewStore("risk");
    await riskStore.write({
      risks: [
        {
          riskId: "int-risk-1",
          projectId,
          phaseId: "int-phase-1",
          description: "Test risk",
          likelihood: "low",
          impact: "low",
          mitigation: "Test mitigation",
          owner: "test-actor",
          status: "identified",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    await projectStore.updatePipelineState("risk", "active");

    const checker = createIntegrityChecker(basePath, projectId);
    const summary = await checker.runAllChecks(projectId);

    expect(summary.totalChecks).toBe(9);
    expect(summary.overallPassed).toBe(true);
  });
});
