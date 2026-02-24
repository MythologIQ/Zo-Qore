/**
 * Planning API Routes
 *
 * REST endpoints for the planning pipeline.
 * Mounted under /api/projects
 */

import * as http from "http";
import { randomUUID } from "crypto";
import { createLogger } from "../planning/Logger.js";
import {
  ProjectStore,
  createProjectStore,
  DEFAULT_PROJECTS_DIR,
} from "../planning/ProjectStore.js";
import {
  StoreIntegrity,
  createStoreIntegrity,
} from "../planning/StoreIntegrity.js";
import {
  IntegrityChecker,
  createIntegrityChecker,
  type CheckId,
} from "../planning/IntegrityChecker.js";
import {
  PlanningGovernance,
  createPlanningGovernance,
} from "../planning/PlanningGovernance.js";
import { VoidStore } from "../planning/VoidStore.js";
import { ViewStore } from "../planning/ViewStore.js";
import {
  PlanningLedger,
  createPlanningLedger,
  type PlanningView,
  type PlanningAction,
} from "../planning/PlanningLedger.js";
import type { ApiErrorCode, ApiErrorResponse } from "@mythologiq/qore-contracts/schemas/ApiTypes";
import type { PlanningAction as ContractPlanningAction, FullProjectState } from "@mythologiq/qore-contracts";

export interface PlanningRoutesConfig {
  projectsDir?: string;
  requireAuth?: boolean;
  apiKey?: string;
}

/**
 * Maps local PlanningAction to contract PlanningAction
 */
function toContractAction(_action: PlanningAction): ContractPlanningAction {
  return "planning:create" as ContractPlanningAction;
}

export class PlanningRoutes {
  private readonly logger = createLogger("planning-routes");

  constructor(
    private readonly runtime: {
      evaluate(request: unknown): Promise<unknown>;
    },
    private readonly config: PlanningRoutesConfig = {},
  ) {}

  /**
   * Handle planning routes
   * Returns true if route was handled, false if not found
   */
  async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<boolean> {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Extract projectId from URL if present
    const projectMatch = url.match(/^\/api\/projects\/([^/]+)/);
    const projectId = projectMatch?.[1];

    try {
      // GET /api/projects - List all projects (stub)
      if (method === "GET" && url === "/api/projects") {
        return this.sendJson(res, 200, { projects: [] });
      }

      // POST /api/projects - Create new project
      if (method === "POST" && url === "/api/projects") {
        if (!projectId) {
          const body = await this.readJsonBody(req);
          const { projectId: newProjectId, name, description, createdBy } = body as {
            projectId?: string;
            name: string;
            description?: string;
            createdBy: string;
          };
          if (!name || !createdBy) {
            return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "name and createdBy required", traceId);
          }
          const finalProjectId = newProjectId ?? `proj_${randomUUID().slice(0, 8)}`;
          const store = createProjectStore(finalProjectId);
          const project = await store.create({ name, description: description ?? "", createdBy });
          return this.sendJson(res, 201, project);
        }
      }

      // All other routes require projectId
      if (!projectId) {
        return false;
      }

      // Initialize stores for this project
      const projectsDir = this.config.projectsDir ?? process.env.QORE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;
      const projectStore = createProjectStore(projectId, projectsDir);
      const storeIntegrity = createStoreIntegrity(projectsDir);
      const planningLedger = createPlanningLedger(projectsDir, projectId);
      const planningGovernance = createPlanningGovernance(projectStore, storeIntegrity);
      const voidStore = new VoidStore(projectsDir, projectId, { ledger: planningLedger, integrity: storeIntegrity });

      // GET /api/projects/:projectId - Get project metadata
      if (method === "GET" && url === `/api/projects/${projectId}`) {
        await storeIntegrity.verify(projectId);
        const project = await projectStore.get();
        if (!project) {
          return this.sendError(res, 404, "NOT_FOUND" as ApiErrorCode, "Project not found", traceId);
        }
        return this.sendJson(res, 200, project);
      }

      // DELETE /api/projects/:projectId - Delete project
      if (method === "DELETE" && url === `/api/projects/${projectId}`) {
        await projectStore.delete();
        return this.sendJson(res, 200, { success: true });
      }

      // GET /api/projects/:projectId/integrity - Check integrity
      if (method === "GET" && url === `/api/projects/${projectId}/integrity`) {
        const integrityChecker = createIntegrityChecker(projectsDir, projectId);
        const summary = await integrityChecker.runAllChecks(projectId);
        return this.sendJson(res, 200, summary);
      }

      // POST /api/projects/:projectId/check - Run specific check
      if (method === "POST" && url === `/api/projects/${projectId}/check`) {
        const body = await this.readJsonBody(req);
        const { checkId } = body as { checkId: CheckId };
        if (!checkId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "checkId required", traceId);
        }
        const integrityChecker = createIntegrityChecker(projectsDir, projectId);
        const result = await integrityChecker.runCheck(projectId, checkId);
        return this.sendJson(res, 200, result);
      }

      // GET /api/projects/:projectId/void/thoughts - List thoughts
      if (method === "GET" && url === `/api/projects/${projectId}/void/thoughts`) {
        const thoughts = await voidStore.getAllThoughts();
        return this.sendJson(res, 200, { thoughts });
      }

      // POST /api/projects/:projectId/void/thoughts - Add thought
      if (method === "POST" && url === `/api/projects/${projectId}/void/thoughts`) {
        const body = await this.readJsonBody(req);
        const { content, source, capturedBy, tags } = body as {
          content: string;
          source: "text" | "voice";
          capturedBy: string;
          tags?: string[];
        };
        if (!content || !source || !capturedBy) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "content, source, capturedBy required", traceId);
        }

        const thought = {
          thoughtId: `thought_${randomUUID().slice(0, 8)}`,
          projectId,
          content,
          source,
          capturedAt: new Date().toISOString(),
          capturedBy,
          tags: tags ?? [],
          status: "raw" as const,
        };

        await voidStore.addThought(thought, capturedBy);
        return this.sendJson(res, 201, thought);
      }

      // GET /api/projects/:projectId/reveal/clusters - List clusters
      if (method === "GET" && url === `/api/projects/${projectId}/reveal/clusters`) {
        const revealStore = new ViewStore(projectsDir, projectId, "reveal", { ledger: planningLedger, integrity: storeIntegrity });
        const clusters = await revealStore.read<{ clusters?: Array<{ clusterId: string }> }>();
        return this.sendJson(res, 200, clusters ?? { clusters: [] });
      }

      // POST /api/projects/:projectId/reveal/clusters - Create cluster
      if (method === "POST" && url === `/api/projects/${projectId}/reveal/clusters`) {
        const body = await this.readJsonBody(req);
        const { label, thoughtIds, notes, actorId } = body as {
          label: string;
          thoughtIds: string[];
          notes?: string;
          actorId: string;
        };
        if (!label || !thoughtIds || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "label, thoughtIds, actorId required", traceId);
        }

        const revealStore = new ViewStore(projectsDir, projectId, "reveal", { ledger: planningLedger, integrity: storeIntegrity });

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            const existing = (await revealStore.read<{ clusters?: Array<{ clusterId: string }> }>()) ?? { clusters: [] };
            const clusters = existing.clusters ?? [];
            const newCluster = {
              clusterId: `cluster_${Date.now().toString(36)}`,
              projectId,
              label,
              thoughtIds,
              notes: notes ?? "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: "formed" as const,
            };
            clusters.push(newCluster);
            await revealStore.write({ clusters });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendJson(res, 201, { success: true });
      }

      // GET /api/projects/:projectId/constellation/map - Get constellation
      if (method === "GET" && url === `/api/projects/${projectId}/constellation/map`) {
        const constellationStore = new ViewStore(projectsDir, projectId, "constellation", { ledger: planningLedger, integrity: storeIntegrity });
        const map = await constellationStore.read<{ nodes?: unknown[]; edges?: unknown[] }>();
        return this.sendJson(res, 200, map ?? { nodes: [], edges: [] });
      }

      // POST /api/projects/:projectId/constellation/map - Save constellation
      if (method === "POST" && url === `/api/projects/${projectId}/constellation/map`) {
        const body = await this.readJsonBody(req);
        const { nodes, edges, actorId } = body as {
          nodes: Array<{ nodeId: string; clusterId: string; position: { x: number; y: number } }>;
          edges: Array<{ edgeId: string; fromNodeId: string; toNodeId: string; relationship: string; weight: number }>;
          actorId: string;
        };
        if (!nodes || !edges || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "nodes, edges, actorId required", traceId);
        }

        const constellationStore = new ViewStore(projectsDir, projectId, "constellation", { ledger: planningLedger, integrity: storeIntegrity });

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            await constellationStore.write({
              constellationId: `const_${projectId}`,
              projectId,
              nodes,
              edges,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: "mapped",
            });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendJson(res, 200, { success: true });
      }

      // GET /api/projects/:projectId/path/phases - Get phases
      if (method === "GET" && url === `/api/projects/${projectId}/path/phases`) {
        const pathStore = new ViewStore(projectsDir, projectId, "path", { ledger: planningLedger, integrity: storeIntegrity });
        const phases = await pathStore.read<{ phases?: unknown[] }>();
        return this.sendJson(res, 200, phases ?? { phases: [] });
      }

      // POST /api/projects/:projectId/path/phases - Create phase
      if (method === "POST" && url === `/api/projects/${projectId}/path/phases`) {
        const body = await this.readJsonBody(req);
        const { name, objective, sourceClusterIds, tasks, actorId } = body as {
          name: string;
          objective: string;
          sourceClusterIds: string[];
          tasks?: Array<{ title: string; description: string; acceptance: string[] }>;
          actorId: string;
        };
        if (!name || !objective || !sourceClusterIds || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "name, objective, sourceClusterIds, actorId required", traceId);
        }

        const pathStore = new ViewStore(projectsDir, projectId, "path", { ledger: planningLedger, integrity: storeIntegrity });

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            const existing = (await pathStore.read<{ phases?: unknown[] }>()) ?? { phases: [] };
            const phases = existing.phases ?? [];
            const ordinal = phases.length + 1;
            const newPhase = {
              phaseId: `phase_${Date.now().toString(36)}`,
              projectId,
              ordinal,
              name,
              objective,
              sourceClusterIds,
              tasks: (tasks ?? []).map((t, i) => ({
                taskId: `task_${Date.now().toString(36)}_${i}`,
                phaseId: `phase_${Date.now().toString(36)}`,
                title: t.title,
                description: t.description,
                acceptance: t.acceptance,
                status: "pending" as const,
              })),
              status: "planned" as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            phases.push(newPhase);
            await pathStore.write({ phases });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendJson(res, 201, { success: true });
      }

      // GET /api/projects/:projectId/risk/register - Get risks
      if (method === "GET" && url === `/api/projects/${projectId}/risk/register`) {
        const riskStore = new ViewStore(projectsDir, projectId, "risk", { ledger: planningLedger, integrity: storeIntegrity });
        const risks = await riskStore.read<{ risks?: unknown[] }>();
        return this.sendJson(res, 200, risks ?? { risks: [] });
      }

      // POST /api/projects/:projectId/risk/register - Add risk
      if (method === "POST" && url === `/api/projects/${projectId}/risk/register`) {
        const body = await this.readJsonBody(req);
        const { phaseId, description, likelihood, impact, mitigation, owner, actorId } = body as {
          phaseId: string;
          description: string;
          likelihood: "low" | "medium" | "high";
          impact: "low" | "medium" | "high";
          mitigation: string;
          owner: string;
          actorId: string;
        };
        if (!phaseId || !description || !likelihood || !impact || !mitigation || !owner || !actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "All risk fields and actorId required", traceId);
        }

        const riskStore = new ViewStore(projectsDir, projectId, "risk", { ledger: planningLedger, integrity: storeIntegrity });

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            const existing = (await riskStore.read<{ risks?: unknown[] }>()) ?? { risks: [] };
            const risks = existing.risks ?? [];
            const newRisk = {
              riskId: `risk_${Date.now().toString(36)}`,
              projectId,
              phaseId,
              description,
              likelihood,
              impact,
              mitigation,
              owner,
              status: "identified" as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            risks.push(newRisk);
            await riskStore.write({ risks });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendJson(res, 201, { success: true });
      }

      // GET /api/projects/:projectId/autonomy/config - Get autonomy config
      if (method === "GET" && url === `/api/projects/${projectId}/autonomy/config`) {
        const autonomyStore = new ViewStore(projectsDir, projectId, "autonomy", { ledger: planningLedger, integrity: storeIntegrity });
        const config = await autonomyStore.read();
        return this.sendJson(res, 200, config ?? { guardrails: [], approvalGates: [], allowedActions: [], blockedActions: [], victorMode: "support" });
      }

      // POST /api/projects/:projectId/autonomy/config - Save autonomy config
      if (method === "POST" && url === `/api/projects/${projectId}/autonomy/config`) {
        const body = await this.readJsonBody(req);
        const { guardrails, approvalGates, allowedActions, blockedActions, victorMode, actorId } = body as {
          guardrails?: Array<{ rule: string; enforcement: "block" | "warn" | "log" }>;
          approvalGates?: Array<{ trigger: string; approver: string; timeout: number }>;
          allowedActions?: string[];
          blockedActions?: string[];
          victorMode?: "support" | "challenge" | "mixed" | "red-flag";
          actorId: string;
        };
        if (!actorId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "actorId required", traceId);
        }

        const autonomyStore = new ViewStore(projectsDir, projectId, "autonomy", { ledger: planningLedger, integrity: storeIntegrity });

        const { response } = await planningGovernance.evaluateAndExecute(
          actorId,
          toContractAction("create"),
          projectId,
          async () => {
            await autonomyStore.write({
              autonomyId: `autonomy_${projectId}`,
              projectId,
              guardrails: guardrails ?? [],
              approvalGates: approvalGates ?? [],
              allowedActions: allowedActions ?? [],
              blockedActions: blockedActions ?? [],
              victorMode: victorMode ?? "support",
              status: "active",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        );

        if (!response.allowed) {
          return this.sendError(res, 403, "POLICY_DENIED" as ApiErrorCode, response.reason ?? "Policy denied", traceId);
        }
        return this.sendJson(res, 200, { success: true });
      }

      // GET /api/projects/:projectId/ledger - Get ledger entries
      if (method === "GET" && url === `/api/projects/${projectId}/ledger`) {
        const urlObj = new URL(req.url ?? "", `http://localhost`);
        const view = urlObj.searchParams.get("view") as PlanningView | null;
        const action = urlObj.searchParams.get("action") as PlanningAction | null;
        const entries = await planningLedger.getEntries({ view: view ?? undefined, action: action ?? undefined });
        return this.sendJson(res, 200, { entries });
      }

      // POST /api/victor/review-plan - Victor review endpoint
      if (method === "POST" && url === "/api/victor/review-plan") {
        const body = await this.readJsonBody(req);
        const { projectId: reviewProjectId, actorId, scope } = body as {
          projectId: string;
          actorId?: string;
          scope?: string;
        };
        if (!reviewProjectId) {
          return this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, "projectId required", traceId);
        }

        // Import Victor planning review
        try {
          const { reviewPlanningProject } = await import("../../zo/victor/planning/planning-review.js");
          const reviewProjectStore = createProjectStore(reviewProjectId, projectsDir);
          const projectState = await reviewProjectStore.getFullProjectState();
          const review = await reviewPlanningProject(projectState);
          return this.sendJson(res, 200, review);
        } catch (err) {
          this.logger.error("Failed to load Victor planning review", { error: err });
          return this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, "Victor review unavailable", traceId);
        }
      }

      // Route not found
      return false;
    } catch (error) {
      this.handleError(res, error, traceId);
      return true;
    }
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      throw new Error("BAD_JSON: Request body is not valid JSON");
    }
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): boolean {
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
    return true;
  }

  private sendError(
    res: http.ServerResponse,
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    traceId: string,
    details?: Record<string, unknown>,
  ): boolean {
    const payload: ApiErrorResponse = {
      error: { code, message, traceId, details },
    };
    return this.sendJson(res, statusCode, payload);
  }

  private handleError(res: http.ServerResponse, error: unknown, traceId: string): void {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("BAD_JSON")) {
      this.sendError(res, 400, "BAD_REQUEST" as ApiErrorCode, message, traceId);
      return;
    }
    if (message.includes("not found") || message.includes("NOT_FOUND")) {
      this.sendError(res, 404, "NOT_FOUND" as ApiErrorCode, message, traceId);
      return;
    }
    this.sendError(res, 500, "INTERNAL_ERROR" as ApiErrorCode, message, traceId);
  }
}