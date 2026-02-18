import * as http from "http";
import * as crypto from "crypto";
import type {
  ProjectRecord,
  SkillRecord,
  CheckpointRecord,
  ActivePlan,
  MfaSessionRecord,
  AuthSessionRecord,
  JsonResult,
} from "../types.js";
import type { ProjectTabStorage } from "../../project-tab/storage.js";
import type { GenesisPipeline } from "../../genesis/pipeline.js";
import type { RevealService } from "../../reveal/service.js";
import type { ConstellationService } from "../../constellation/service.js";
import type { RiskService } from "../../risk/service.js";
import type { AutonomyChecker } from "../../autonomy/checker.js";
import type { PathService } from "../../path/service.js";

// ---------------------------------------------------------------------------
// Route Context – everything the route handlers need from the server
// ---------------------------------------------------------------------------

export interface RouteContext {
  sendJson: (res: http.ServerResponse, status: number, body: unknown) => void;
  readBody: (req: http.IncomingMessage) => Promise<unknown>;
  broadcast: (payload: unknown) => void;

  // Stores
  projectStore: ProjectRecord[];
  projectStorage: ProjectTabStorage | null;
  genesisPipeline: GenesisPipeline | null;
  revealService: RevealService | null;
  constellationService: ConstellationService | null;
  riskService: RiskService | null;
  autonomyChecker: AutonomyChecker | null;
  pathService: PathService | null;
  skills: SkillRecord[];
  checkpointStore: CheckpointRecord[];
  monitoringEnabled: boolean;
  appendCheckpoint: (type: string, phase: string, verdict: string) => void;
  activePlan: ActivePlan;

  // Security
  mfaSessions: Map<string, MfaSessionRecord>;
  authSessions: Map<string, AuthSessionRecord>;
  listSessions: () => Array<{
    tokenId: string;
    createdAt: string;
    expiresAt: string;
    lastSeenAt: string;
    clientIp: string;
    userAgent: string;
    deviceId: string;
  }>;

  // Auth config
  requireUiAuth: boolean;
  requireUiMfa: boolean;
  requireAdminToken: boolean;
  uiAdminToken: string;
  uiAuthUser: string;
  uiAuthPass: string;
  uiTotpSecret: string;
  uiSessionSecret: string;
  uiSessionTtlMs: number;
  allowedIps: string[];
  trustProxyHeaders: boolean;
  authMaxFailures: number;
  authLockoutMs: number;
  mfaMaxFailures: number;
  mfaLockoutMs: number;

  // Runtime
  runtimeBaseUrl: string;
  runtimeApiKey: string | undefined;
  requestTimeoutMs: number;
  zoApiBaseUrl: string | undefined;

  // Delegate methods for runtime proxy calls
  fetchRuntimeSnapshot: () => Promise<unknown>;
  fetchQoreJson: (
    path: string,
    method?: string,
    body?: unknown,
  ) => Promise<JsonResult>;
  fetchExternalJson: (
    baseUrl: string,
    path: string,
    method: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ) => Promise<JsonResult>;

  // Secret-store / MFA helpers
  normalizeTotpSecret: (raw: string | undefined) => string | null;
  buildOtpAuthUrl: (
    secret: string,
    account: string,
    issuer: string,
  ) => string;

  // Assets helpers (used for UI debug route)
  assetsDir: string;
  hasUiAsset: (fileName: string) => boolean;

  // Cookie parser (re-exported from mfa)
  parseCookies: (header: string | undefined) => Record<string, string>;
  encodeBase32: (data: Buffer) => string;
  verifyTotpCode: (code: string, secret: string) => boolean;
}

// ---------------------------------------------------------------------------
// Zo ask job store – keeps pending/completed async Zo API calls in memory
// ---------------------------------------------------------------------------

interface ZoJob {
  id: string;
  status: "pending" | "done" | "error";
  result?: unknown;
  error?: string;
  createdAt: number;
}

const zoJobs = new Map<string, ZoJob>();

// Evict completed jobs older than 5 minutes
function evictStaleJobs(): void {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [id, job] of zoJobs) {
    if (job.status !== "pending" && job.createdAt < cutoff) {
      zoJobs.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Main dispatch function
// ---------------------------------------------------------------------------

/**
 * Dispatches an API request to the appropriate handler.
 *
 * @returns `true` if the route was handled, `false` if no matching route was
 *          found and the caller should fall through to static-file serving or
 *          a 404.
 */
export async function handleApiRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  pathname: string,
  url: URL,
  ctx: RouteContext,
): Promise<boolean> {
  // ── Project endpoints (DuckDB-backed with in-memory fallback) ──────────

  if (method === "GET" && pathname === "/api/projects") {
    if (ctx.projectStorage) {
      const projects = await ctx.projectStorage.listProjects();
      const active = await ctx.projectStorage.listActiveProject();
      ctx.sendJson(res, 200, {
        projects: projects.map((p) => ({
          id: p.id, name: p.name, state: p.state,
          folderPath: p.folderPath, parentId: p.parentId,
          isActive: p.isActive ?? false,
        })),
        activeProjectId: active?.id ?? null,
      });
    } else {
      const active = ctx.projectStore.find((p) => p.active);
      ctx.sendJson(res, 200, {
        projects: ctx.projectStore,
        activeProjectId: active?.id ?? null,
      });
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/projects/dashboard") {
    if (ctx.projectStorage) {
      const active = await ctx.projectStorage.listActiveProject();
      const allProjects = await ctx.projectStorage.listProjects();
      const subProjects = active
        ? await ctx.projectStorage.listSubProjects(active.id)
        : [];

      const phases = active
        ? await ctx.projectStorage.listPhasesForProject(active.id)
        : [];
      const milestones = active
        ? await ctx.projectStorage.listMilestonesForProject(active.id)
        : [];
      const risks = active
        ? await ctx.projectStorage.listRisksForProject(active.id)
        : [];

      // Fetch tasks for kanban and counts
      const tasks = active
        ? await ctx.projectStorage.listTasksForProject(active.id)
        : [];

      const project = active
        ? {
            id: active.id,
            name: active.name,
            state: active.state,
            folderPath: active.folderPath,
            parentId: active.parentId,
            isActive: active.isActive,
            createdAt: active.createdAt,
            updatedAt: active.updatedAt,
            phaseCount: phases.length,
            taskCount: tasks.length,
            riskCount: risks.length,
          }
        : null;

      // Assemble kanban columns from tasks
      const kanbanStatuses = ["pending", "ready", "in_progress", "blocked", "completed"];
      const kanbanTitles: Record<string, string> = { pending: "Pending", ready: "Ready", in_progress: "In Progress", blocked: "Blocked", completed: "Completed" };
      const phaseMap = new Map(phases.map((ph) => [ph.id, ph.name]));
      const kanban = kanbanStatuses.map((status) => ({
        title: kanbanTitles[status] || status,
        cards: tasks
          .filter((t) => t.status === status)
          .map((t) => ({ title: t.title, status: t.status, phase: phaseMap.get(t.phaseId) || "" })),
      }));

      // Helper: DuckDB may return Date objects or strings for timestamps
      const toIso = (v: unknown): string => {
        if (!v) return "";
        if (v instanceof Date) return v.toISOString();
        return String(v);
      };

      // Assemble gantt from phases and milestones
      let gantt = null;
      if (phases.length > 0) {
        const allDates = phases
          .flatMap((p) => [p.startDate, p.endDate].filter(Boolean))
          .map((d) => new Date(d as string).getTime())
          .filter((t) => !isNaN(t));
        if (allDates.length >= 2) {
          const pStart = Math.min(...allDates);
          const pEnd = Math.max(...allDates);
          const total = pEnd - pStart || 1;
          const todayPercent = Math.max(0, Math.min(100, ((Date.now() - pStart) / total) * 100));
          gantt = {
            projectStart: new Date(pStart).toISOString().slice(0, 10),
            projectEnd: new Date(pEnd).toISOString().slice(0, 10),
            todayPercent: Math.round(todayPercent),
            phases: phases.map((ph) => {
              const completedTasks = tasks.filter((t) => t.phaseId === ph.id && t.status === "completed").length;
              const totalTasks = tasks.filter((t) => t.phaseId === ph.id).length;
              const status = totalTasks > 0 && completedTasks === totalTasks ? "completed" : (completedTasks > 0 ? "in-progress" : "planned");
              return { title: ph.name, startDate: toIso(ph.startDate).slice(0, 10), endDate: toIso(ph.endDate).slice(0, 10), status };
            }),
            milestones: milestones.map((m) => ({
              title: m.name, date: toIso(m.targetDate).slice(0, 10), critical: m.status === "at_risk" || m.status === "missed",
            })),
          };
        }
      }

      // Assemble roadmap from phases — include task descriptions for richer cards
      const roadmap = phases.map((ph) => {
        const phaseTasks = tasks.filter((t) => t.phaseId === ph.id);
        const completedCount = phaseTasks.filter((t) => t.status === "completed").length;
        const status = phaseTasks.length > 0 && completedCount === phaseTasks.length ? "completed" : (completedCount > 0 ? "in-progress" : "planned");
        const startStr = ph.startDate ? new Date(toIso(ph.startDate)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        const endStr = ph.endDate ? new Date(toIso(ph.endDate)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        return {
          title: ph.name,
          description: ph.description,
          status,
          dates: startStr && endStr ? `${startStr} – ${endStr}` : "",
          progress: phaseTasks.length > 0 ? `${completedCount}/${phaseTasks.length}` : "",
          items: phaseTasks.map((t) => ({ text: t.title, description: t.description, done: t.status === "completed", active: t.status === "in_progress" })),
        };
      });

      // Transform phases for UI: { title, progress, status }
      const uiPhases = phases.map((ph) => {
        const phaseTasks = tasks.filter((t) => t.phaseId === ph.id);
        const completedCount = phaseTasks.filter((t) => t.status === "completed").length;
        const progress = phaseTasks.length > 0 ? Math.round((completedCount / phaseTasks.length) * 100) : 0;
        const status = progress === 100 ? "completed" : (progress > 0 ? "in-progress" : "planned");
        return { id: ph.id, title: ph.name, progress, status, startDate: toIso(ph.startDate), endDate: toIso(ph.endDate) };
      });

      // Transform milestones for UI: { title, completedAt, targetDate }
      const uiMilestones = milestones.map((m) => ({
        id: m.id, title: m.name, targetDate: toIso(m.targetDate),
        completedAt: m.achievedDate ? toIso(m.achievedDate) : null,
        status: m.status,
      }));

      // Transform risks for UI: { level, title }
      const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const uiRisks = risks.map((r) => {
        const level = (severityOrder[r.impact] || 0) >= (severityOrder[r.likelihood] || 0) ? r.impact : r.likelihood;
        return { id: r.id, level, title: r.description.substring(0, 100), status: r.status };
      });

      // Assemble settings from prompt policy + guardrails
      let settings = null;
      if (active) {
        const policy = await ctx.projectStorage.getPromptPolicyForProject(active.id);
        const guardrails = await ctx.projectStorage.listGuardrailsForProject(active.id);
        if (policy || guardrails.length > 0) {
          const humanApproval = guardrails.filter((g) => g.gateType === "human_approval").length;
          const staged = guardrails.filter((g) => g.gateType === "staged_execution").length;
          const validation = guardrails.filter((g) => g.gateType === "validation").length;
          settings = {
            governance: policy
              ? {
                  injectionDetection: policy.injectionDetection,
                  piiAction: policy.piiAction,
                  maxTokensPerPrompt: policy.maxTokensPerPrompt,
                  rateLimit: `${policy.maxPromptsPerMinute} prompts/min, ${policy.cooldownSeconds}s cooldown`,
                }
              : null,
            guardrails: {
              activeGuardrails: guardrails.length,
              humanApprovalGates: humanApproval,
              stagedExecution: staged,
              validationGates: validation,
            },
          };
        }
      }

      // Assemble constellation from actual genesis clusters & thoughts
      let constellation = null;
      const ps = ctx.projectStorage;
      if (active && ps) {
        const dbClusters = await ps.listClustersForProject(active.id);
        if (dbClusters.length > 0) {
          const clusterData = await Promise.all(dbClusters.map(async (c) => {
            const thoughts = await Promise.all(
              c.thoughtIds.map((tid) => ps.getThought(tid))
            );
            return {
              id: c.id,
              name: c.name,
              theme: c.theme,
              position: c.position,
              thoughts: thoughts.filter(Boolean).map((t) => ({ id: t!.id, content: t!.content })),
              connections: c.connections,
            };
          }));
          constellation = { clusters: clusterData };
        }
      }

      ctx.sendJson(res, 200, {
        project,
        allProjects: allProjects.map((p) => ({
          id: p.id, name: p.name, state: p.state,
          folderPath: p.folderPath, parentId: p.parentId,
          isActive: p.isActive ?? false,
        })),
        phases: uiPhases,
        milestones: uiMilestones,
        risks: uiRisks,
        subProjects: subProjects.map((sp) => ({
          id: sp.id, name: sp.name, folderPath: sp.folderPath,
          parentId: sp.parentId, state: sp.state,
        })),
        kanban,
        gantt,
        roadmap,
        constellation,
        settings,
      });
    } else {
      const active = ctx.projectStore.find((p) => p.active);
      ctx.sendJson(res, 200, {
        project: active
          ? { ...active, state: "No data", phaseCount: 0, taskCount: 0, riskCount: 0,
              createdAt: "No data", updatedAt: "No data" }
          : null,
        allProjects: ctx.projectStore.map((p) => ({
          id: p.id, name: p.name, state: "No data",
          folderPath: p.folderPath, parentId: p.parentId,
          isActive: p.active ?? false,
        })),
        phases: [], milestones: [], risks: [], subProjects: [],
        kanban: [], gantt: null, roadmap: [], constellation: null, settings: null,
      });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/projects/create") {
    const body = (await ctx.readBody(req)) as {
      name?: string;
      folderPath?: string;
      parentId?: string | null;
    };
    const id = `proj-${crypto.randomUUID().slice(0, 8)}`;
    if (ctx.projectStorage) {
      const project = await ctx.projectStorage.createProject({
        id,
        name: body?.name ?? "Untitled",
        state: "EMPTY",
        folderPath: body?.folderPath,
        parentId: body?.parentId ?? null,
        isActive: false,
      });
      ctx.sendJson(res, 200, { project });
    } else {
      const project = {
        id, name: body?.name ?? "Untitled",
        folderPath: body?.folderPath,
        parentId: body?.parentId ?? null, active: false,
      };
      ctx.projectStore.push(project);
      ctx.sendJson(res, 200, { project });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/projects/rename") {
    const body = (await ctx.readBody(req)) as {
      projectId?: string;
      name?: string;
    };
    if (!body?.projectId || !body?.name) {
      ctx.sendJson(res, 400, { error: "projectId and name are required" });
      return true;
    }
    if (ctx.projectStorage) {
      const proj = await ctx.projectStorage.getProject(body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      await ctx.projectStorage.renameProject(body.projectId, body.name);
      const updated = await ctx.projectStorage.getProject(body.projectId);
      ctx.sendJson(res, 200, { project: updated });
    } else {
      const proj = ctx.projectStore.find((p) => p.id === body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      proj.name = body.name;
      ctx.sendJson(res, 200, { project: proj });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/projects/remove") {
    const body = (await ctx.readBody(req)) as { projectId?: string };
    if (!body?.projectId) {
      ctx.sendJson(res, 400, { error: "projectId is required" });
      return true;
    }
    if (ctx.projectStorage) {
      const proj = await ctx.projectStorage.getProject(body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      await ctx.projectStorage.removeProject(body.projectId);
      ctx.sendJson(res, 200, { ok: true, removedId: body.projectId });
    } else {
      const idx = ctx.projectStore.findIndex((p) => p.id === body.projectId);
      if (idx === -1) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      ctx.projectStore.splice(idx, 1);
      ctx.sendJson(res, 200, { ok: true, removedId: body.projectId });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/projects/unlink") {
    const body = (await ctx.readBody(req)) as { projectId?: string };
    if (!body?.projectId) {
      ctx.sendJson(res, 400, { error: "projectId is required" });
      return true;
    }
    if (ctx.projectStorage) {
      const proj = await ctx.projectStorage.getProject(body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      await ctx.projectStorage.unlinkSubProject(body.projectId);
      const updated = await ctx.projectStorage.getProject(body.projectId);
      ctx.sendJson(res, 200, { project: updated });
    } else {
      const proj = ctx.projectStore.find((p) => p.id === body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      proj.parentId = null;
      ctx.sendJson(res, 200, { project: proj });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/projects/folder") {
    const body = (await ctx.readBody(req)) as {
      projectId?: string;
      folderPath?: string;
    };
    if (!body?.projectId) {
      ctx.sendJson(res, 400, { error: "projectId is required" });
      return true;
    }
    if (ctx.projectStorage) {
      const proj = await ctx.projectStorage.getProject(body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      await ctx.projectStorage.setProjectFolder(body.projectId, body.folderPath ?? "");
      const updated = await ctx.projectStorage.getProject(body.projectId);
      ctx.sendJson(res, 200, { project: updated });
    } else {
      const proj = ctx.projectStore.find((p) => p.id === body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      proj.folderPath = body.folderPath;
      ctx.sendJson(res, 200, { project: proj });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/projects/switch") {
    const body = (await ctx.readBody(req)) as { projectId?: string };
    if (!body?.projectId) {
      ctx.sendJson(res, 400, { error: "projectId is required" });
      return true;
    }
    if (ctx.projectStorage) {
      const proj = await ctx.projectStorage.getProject(body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      await ctx.projectStorage.setProjectActive(body.projectId);
      const projects = await ctx.projectStorage.listProjects();
      ctx.sendJson(res, 200, {
        projects: projects.map((p) => ({
          id: p.id, name: p.name, state: p.state,
          folderPath: p.folderPath, parentId: p.parentId,
          active: p.isActive ?? false,
        })),
        activeProjectId: body.projectId,
      });
    } else {
      const proj = ctx.projectStore.find((p) => p.id === body.projectId);
      if (!proj) {
        ctx.sendJson(res, 404, { error: "Project not found" });
        return true;
      }
      for (const p of ctx.projectStore) p.active = false;
      proj.active = true;
      ctx.sendJson(res, 200, {
        projects: ctx.projectStore,
        activeProjectId: proj.id,
      });
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/projects/folders") {
    // Return workspace folders for folder-mapping picker
    const fs = await import("fs");
    const fspath = await import("path");
    const workspaceRoot = "/home/workspace";
    try {
      const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
      const folders = entries
        .filter((e: any) => e.isDirectory() && !e.name.startsWith("."))
        .map((e: any) => fspath.join(workspaceRoot, e.name));
      ctx.sendJson(res, 200, { folders });
    } catch {
      ctx.sendJson(res, 200, { folders: [] });
    }
    return true;
  }

  // ── Seed endpoint ──────────────────────────────────────────────────────

  if (method === "POST" && pathname === "/api/projects/seed") {
    if (!ctx.projectStorage) {
      ctx.sendJson(res, 500, { error: "Project storage not available" });
      return true;
    }
    const storage = ctx.projectStorage;
    const active = await storage.listActiveProject();
    if (!active) {
      ctx.sendJson(res, 404, { error: "No active project" });
      return true;
    }
    const pid = active.id;

    // Check if already seeded
    const existingPhases = await storage.listPhasesForProject(pid);
    if (existingPhases.length > 0) {
      ctx.sendJson(res, 200, { status: "already_seeded", phases: existingPhases.length });
      return true;
    }

    // ── Phases ─────────────────────────────────────────────────────────
    const phases = [
      { id: "phase-foundations", projectId: pid, name: "Foundations", description: "Core architecture, DuckDB storage, TypeScript strict mode, project CRUD", clusterIds: [] as string[], dependencies: [] as string[], startDate: "2026-01-15T00:00:00Z", endDate: "2026-02-01T00:00:00Z" },
      { id: "phase-ui-shell", projectId: pid, name: "UI Shell", description: "Command Center HTML/CSS, navigation, tab system, responsive layout", clusterIds: [] as string[], dependencies: ["phase-foundations"], startDate: "2026-02-01T00:00:00Z", endDate: "2026-02-10T00:00:00Z" },
      { id: "phase-governance", projectId: pid, name: "Governance", description: "FailSafe audit pipeline, QoreLogic plan-audit-implement cycle, prompt governance", clusterIds: [] as string[], dependencies: ["phase-foundations"], startDate: "2026-02-01T00:00:00Z", endDate: "2026-02-08T00:00:00Z" },
      { id: "phase-genesis", projectId: pid, name: "Genesis Pipeline", description: "Voice/text capture, thought extraction, clustering, constellation visualization", clusterIds: [] as string[], dependencies: ["phase-ui-shell"], startDate: "2026-02-10T00:00:00Z", endDate: "2026-02-15T00:00:00Z" },
      { id: "phase-realtime", projectId: pid, name: "Real-Time Events", description: "WebSocket broadcast, genesis event dispatch, live UI reactivity", clusterIds: [] as string[], dependencies: ["phase-genesis"], startDate: "2026-02-15T00:00:00Z", endDate: "2026-02-20T00:00:00Z" },
      { id: "phase-autonomy", projectId: pid, name: "Autonomy & Risk", description: "Risk register, autonomy readiness checks, guardrail enforcement, temporal projection", clusterIds: [] as string[], dependencies: ["phase-governance", "phase-realtime"], startDate: "2026-02-20T00:00:00Z", endDate: "2026-03-05T00:00:00Z" },
    ];
    for (const phase of phases) {
      await storage.createPhase(phase);
    }

    // ── Milestones ─────────────────────────────────────────────────────
    const milestones = [
      { id: "ms-storage-online", projectId: pid, phaseId: "phase-foundations", name: "DuckDB Storage Online", description: "All tables created, migrations passing, CRUD operations verified", targetDate: "2026-01-28T00:00:00Z", achievedDate: "2026-01-28T00:00:00Z", status: "achieved" as const, criteriaTaskIds: [] as string[] },
      { id: "ms-ui-live", projectId: pid, phaseId: "phase-ui-shell", name: "Command Center Live", description: "UI shell serving with all tabs, navigation, and responsive layout operational", targetDate: "2026-02-10T00:00:00Z", achievedDate: "2026-02-10T00:00:00Z", status: "achieved" as const, criteriaTaskIds: [] as string[] },
      { id: "ms-governance-sealed", projectId: pid, phaseId: "phase-governance", name: "Governance Pipeline Sealed", description: "QoreLogic plan-audit-implement cycle running, META_LEDGER tracking all phases", targetDate: "2026-02-08T00:00:00Z", achievedDate: "2026-02-08T00:00:00Z", status: "achieved" as const, criteriaTaskIds: [] as string[] },
      { id: "ms-genesis-wired", projectId: pid, phaseId: "phase-genesis", name: "Genesis Pipeline Wired", description: "Voice capture, thought extraction, and clustering pipeline fully operational", targetDate: "2026-02-15T00:00:00Z", achievedDate: "2026-02-15T00:00:00Z", status: "achieved" as const, criteriaTaskIds: [] as string[] },
      { id: "ms-realtime-live", projectId: pid, phaseId: "phase-realtime", name: "Real-Time Events Live", description: "WebSocket genesis event broadcast and UI reactivity verified end-to-end", targetDate: "2026-02-20T00:00:00Z", status: "at_risk" as const, criteriaTaskIds: [] as string[] },
      { id: "ms-autonomy-ready", projectId: pid, phaseId: "phase-autonomy", name: "Autonomy Readiness Gate", description: "All autonomy checks passing, risk register populated, guardrails enforced", targetDate: "2026-03-05T00:00:00Z", status: "upcoming" as const, criteriaTaskIds: [] as string[] },
    ];
    for (const milestone of milestones) {
      await storage.createMilestone(milestone);
    }

    // ── Risks ──────────────────────────────────────────────────────────
    const risks = [
      { id: "risk-duckdb-wal", projectId: pid, description: "DuckDB WAL corruption during concurrent writes may cause data loss on restart", likelihood: "medium" as const, impact: "high" as const, avoidance: "Single-writer pattern enforced in storage layer", mitigation: "WAL checkpoint before shutdown, automatic recovery on startup", contingency: "Rebuild from last known-good snapshot", status: "mitigated" as const },
      { id: "risk-ws-reconnect", projectId: pid, description: "WebSocket disconnection during long-running operations leads to stale UI state", likelihood: "high" as const, impact: "medium" as const, avoidance: "Exponential backoff reconnect in DataClient", mitigation: "Full state refresh on reconnect, connection status indicator", contingency: "Manual page reload restores full state", status: "mitigated" as const },
      { id: "risk-scope-creep", projectId: pid, description: "Phase implementations exceed Section 4 razor boundaries, bloating codebase", likelihood: "medium" as const, impact: "medium" as const, avoidance: "QoreLogic audit gate enforces razor compliance before implementation", mitigation: "Plan-level line count estimates, VETO on excessive scope", contingency: "Rollback phase and re-plan with tighter scope", status: "mitigated" as const },
      { id: "risk-asset-mismatch", projectId: pid, description: "Static asset directory divergence causes served files to differ from source", likelihood: "high" as const, impact: "high" as const, avoidance: "Single canonical asset directory for all UI files", mitigation: "Startup validation that served index.html matches expected hash", contingency: "Manual reconciliation and service restart", status: "identified" as const },
      { id: "risk-prompt-injection", projectId: pid, description: "Malicious input through genesis text capture exploits downstream AI processing", likelihood: "low" as const, impact: "high" as const, avoidance: "Input sanitization before thought extraction", mitigation: "Prompt governance policy with injection detection scoring", contingency: "Block prompt, log audit entry, escalate to human review", status: "identified" as const },
    ];
    for (const risk of risks) {
      await storage.createRisk(risk);
    }

    // ── Tasks ──────────────────────────────────────────────────────────
    const tasks = [
      { id: "task-schema-design", projectId: pid, phaseId: "phase-foundations", clusterId: "", title: "Design DuckDB schema", description: "Define all tables, indexes, and migration strategy", dependencies: [] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-storage-layer", projectId: pid, phaseId: "phase-foundations", clusterId: "", title: "Implement ProjectTabStorage", description: "Full CRUD layer with transaction support", dependencies: ["task-schema-design"] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-project-crud", projectId: pid, phaseId: "phase-foundations", clusterId: "", title: "Project CRUD API endpoints", description: "Create, read, switch, rename, remove project operations", dependencies: ["task-storage-layer"] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-ui-layout", projectId: pid, phaseId: "phase-ui-shell", clusterId: "", title: "Command Center layout", description: "HTML structure, CSS grid, tab system, responsive breakpoints", dependencies: [] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-nav-system", projectId: pid, phaseId: "phase-ui-shell", clusterId: "", title: "Navigation and tab routing", description: "Hash-based routing, nav badges, tab switching", dependencies: ["task-ui-layout"] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-dashboard-api", projectId: pid, phaseId: "phase-ui-shell", clusterId: "", title: "Dashboard data assembly", description: "Aggregate phases, milestones, risks into dashboard response", dependencies: ["task-project-crud"] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-ql-pipeline", projectId: pid, phaseId: "phase-governance", clusterId: "", title: "QoreLogic governance pipeline", description: "Plan, audit, implement, substantiate cycle with META_LEDGER", dependencies: [] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-genesis-capture", projectId: pid, phaseId: "phase-genesis", clusterId: "", title: "Genesis thought capture", description: "Voice and text input for brain-dump sessions", dependencies: [] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-clustering", projectId: pid, phaseId: "phase-genesis", clusterId: "", title: "Thought clustering engine", description: "Group thoughts by theme, compute embeddings, build constellation", dependencies: ["task-genesis-capture"] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-ws-broadcast", projectId: pid, phaseId: "phase-realtime", clusterId: "", title: "WebSocket event broadcast", description: "Server-side genesis event subscription and client broadcast", dependencies: [] as string[], status: "completed" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-ui-reactivity", projectId: pid, phaseId: "phase-realtime", clusterId: "", title: "UI event reactivity", description: "CustomEvent dispatch, component listeners for genesis events", dependencies: ["task-ws-broadcast"] as string[], status: "in_progress" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-data-seeding", projectId: pid, phaseId: "phase-realtime", clusterId: "", title: "Temporal projection data seeding", description: "Seed project phases, milestones, risks, and kanban for dashboard rendering", dependencies: ["task-dashboard-api"] as string[], status: "in_progress" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-risk-register", projectId: pid, phaseId: "phase-autonomy", clusterId: "", title: "Risk register UI", description: "Visual risk matrix with severity, likelihood, and mitigation strategies", dependencies: [] as string[], status: "ready" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-autonomy-checks", projectId: pid, phaseId: "phase-autonomy", clusterId: "", title: "Autonomy readiness checks", description: "Automated validation of project readiness for autonomous operation", dependencies: ["task-risk-register"] as string[], status: "pending" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
      { id: "task-guardrail-enforcement", projectId: pid, phaseId: "phase-autonomy", clusterId: "", title: "Guardrail enforcement layer", description: "Runtime policy enforcement for autonomous actions", dependencies: ["task-autonomy-checks"] as string[], status: "pending" as const, assignee: "agent" as const, guardrailIds: [] as string[] },
    ];
    for (const task of tasks) {
      await storage.createTask(task);
    }

    // ── Prompt Policy ──────────────────────────────────────────────────
    const policyId = `policy-${pid}`;
    await storage.createPromptPolicy({
      id: policyId,
      projectId: pid,
      injectionDetection: "standard",
      jailbreakPatterns: ["ignore previous", "you are now", "system prompt"],
      allowedTopics: ["project planning", "code generation", "architecture", "testing"],
      blockedTopics: ["personal data harvesting", "credential extraction"],
      piiAction: "redact",
      maxTokensPerPrompt: 32000,
      maxTokensPerHour: 500000,
      maxCostPerDay: 25.0,
      maxPromptsPerMinute: 30,
      cooldownSeconds: 60,
    });

    // ── Guardrails ────────────────────────────────────────────────────
    const guardrails = [
      { id: "guard-wal-protect", projectId: pid, riskId: "risk-duckdb-wal", policyPattern: "db.write:*", gateType: "validation" as const, conditions: [{ field: "concurrent_writers", operator: "greater_than" as const, value: 0 }] },
      { id: "guard-scope-audit", projectId: pid, riskId: "risk-scope-creep", policyPattern: "phase.implement:*", gateType: "human_approval" as const, conditions: [{ field: "line_count_delta", operator: "greater_than" as const, value: 500 }] },
      { id: "guard-asset-hash", projectId: pid, riskId: "risk-asset-mismatch", policyPattern: "deploy.assets:*", gateType: "validation" as const, conditions: [{ field: "hash_match", operator: "equals" as const, value: false }] },
      { id: "guard-prompt-inject", projectId: pid, riskId: "risk-prompt-injection", policyPattern: "prompt.submit:*", gateType: "staged_execution" as const, conditions: [{ field: "injection_score", operator: "greater_than" as const, value: 0.7 }] },
      { id: "guard-deploy-block", projectId: pid, riskId: "risk-scope-creep", policyPattern: "deploy.production:*", gateType: "human_approval" as const, conditions: [{ field: "tests_passing", operator: "equals" as const, value: false }] },
    ];
    for (const guard of guardrails) {
      await storage.createGuardrail(guard);
    }

    // ── Genesis Brainstorm: Session + Thoughts + Clusters ──────────
    const sessionId = "genesis-origin";
    await storage.createGenesisSession({
      id: sessionId,
      projectId: pid,
      rawInput: "What if we built a system where AI agents could govern themselves? Not just code generation but real project intelligence — risk awareness, temporal projection, the ability to see where a project is heading before it gets there. And the human stays in control through guardrails, not through micromanagement. Voice-first brainstorming so you can think out loud and the system captures, clusters, and maps your ideas into constellations of meaning.",
    });

    // Brainstorm thoughts — raw ideas, not task descriptions
    const thoughtDefs = [
      { id: "thought-governance-1", content: "AI should have guardrails, not cages — let it operate freely within defined boundaries" },
      { id: "thought-governance-2", content: "Human approval gates at critical decision points, staged execution for reversible actions" },
      { id: "thought-governance-3", content: "Prompt injection is the biggest attack vector — every input needs scoring before processing" },
      { id: "thought-governance-4", content: "PII detection must be automatic, not opt-in — redact by default, allow by exception" },
      { id: "thought-ux-1", content: "The command center should feel like mission control — every signal visible at a glance" },
      { id: "thought-ux-2", content: "Tabs, not pages — context switching kills flow, keep everything in one view" },
      { id: "thought-ux-3", content: "Dark theme is non-negotiable, this is for builders who work at night" },
      { id: "thought-ux-4", content: "Real-time feedback — if something changes, the UI should reflect it within seconds" },
      { id: "thought-capture-1", content: "Voice-first capture — people think faster than they type, let them brain-dump verbally" },
      { id: "thought-capture-2", content: "Raw transcription isn't enough — extract discrete thoughts, atomic ideas that can be rearranged" },
      { id: "thought-capture-3", content: "Thought evolution: an idea today might reframe into something better tomorrow, track lineage" },
      { id: "thought-intel-1", content: "Risk prediction before risk occurs — use project patterns to forecast trouble spots" },
      { id: "thought-intel-2", content: "Temporal projection: show where the project will be in 2 weeks based on current velocity" },
      { id: "thought-intel-3", content: "One mind map node could span 3 phases. Ideas don't decompose 1:1 into execution units" },
      { id: "thought-intel-4", content: "Autonomous planning should suggest phase structure but human confirms — never auto-commit scope" },
      { id: "thought-myth-1", content: "Names matter — Qore, Genesis, Constellation, Sentinel — mythology makes systems memorable" },
      { id: "thought-myth-2", content: "The constellation metaphor: thoughts as stars, clusters as galaxies, connections as gravity" },
      { id: "thought-myth-3", content: "FailSafe Protocol isn't just branding — it's a design principle: every action has a safety net" },
    ];
    for (const t of thoughtDefs) {
      await storage.createThought({ id: t.id, sessionId, content: t.content });
    }

    // Clusters — conceptual groupings that DON'T map 1:1 to phases
    const clusterDefs = [
      { id: "cluster-governance", projectId: pid, name: "AI Governance", theme: "Autonomous AI needs boundaries, not chains. Guardrails, approval gates, injection detection, and PII protection form a layered defense model.", thoughtIds: ["thought-governance-1", "thought-governance-2", "thought-governance-3", "thought-governance-4"], connections: [{ targetClusterId: "cluster-intel", strength: 0.8, label: "informs" }, { targetClusterId: "cluster-myth", strength: 0.4 }] as { targetClusterId: string; strength: number; label?: string }[], position: { x: 0.2, y: 0.3 } },
      { id: "cluster-ux", projectId: pid, name: "Builder Experience", theme: "Mission-control aesthetics, real-time reactivity, dark theme, tab-based navigation — every pixel serves the operator.", thoughtIds: ["thought-ux-1", "thought-ux-2", "thought-ux-3", "thought-ux-4"], connections: [{ targetClusterId: "cluster-capture", strength: 0.6, label: "enables" }, { targetClusterId: "cluster-intel", strength: 0.5 }] as { targetClusterId: string; strength: number; label?: string }[], position: { x: 0.8, y: 0.3 } },
      { id: "cluster-capture", projectId: pid, name: "Knowledge Capture", theme: "Voice-first brainstorming, thought extraction, idea evolution tracking — capture the spark before it fades.", thoughtIds: ["thought-capture-1", "thought-capture-2", "thought-capture-3"], connections: [{ targetClusterId: "cluster-governance", strength: 0.3 }, { targetClusterId: "cluster-myth", strength: 0.5, label: "visualized as" }] as { targetClusterId: string; strength: number; label?: string }[], position: { x: 0.5, y: 0.1 } },
      { id: "cluster-intel", projectId: pid, name: "Project Intelligence", theme: "Risk prediction, temporal projection, autonomous planning suggestions — the system sees patterns humans miss.", thoughtIds: ["thought-intel-1", "thought-intel-2", "thought-intel-3", "thought-intel-4"], connections: [{ targetClusterId: "cluster-ux", strength: 0.5, label: "surfaces through" }, { targetClusterId: "cluster-capture", strength: 0.4, label: "fed by" }] as { targetClusterId: string; strength: number; label?: string }[], position: { x: 0.5, y: 0.9 } },
      { id: "cluster-myth", projectId: pid, name: "Mythological Framework", theme: "Names as design principles — Qore, Genesis, Constellation, FailSafe. Mythology makes systems coherent and memorable.", thoughtIds: ["thought-myth-1", "thought-myth-2", "thought-myth-3"], connections: [{ targetClusterId: "cluster-ux", strength: 0.3, label: "shapes" }] as { targetClusterId: string; strength: number; label?: string }[], position: { x: 0.2, y: 0.7 } },
    ];
    // Create clusters without connections first, then add connections
    const savedConnections = clusterDefs.map((c) => ({ id: c.id, connections: c.connections }));
    for (const c of clusterDefs) {
      await storage.createCluster({ ...c, connections: [] });
    }
    // Now all clusters exist, add connections
    for (const sc of savedConnections) {
      for (const conn of sc.connections) {
        await storage.addClusterConnection(sc.id, conn.targetClusterId);
      }
    }

    // Update project state
    await storage.updateProjectState(pid, "EXECUTING");

    ctx.sendJson(res, 200, {
      status: "seeded",
      phases: phases.length,
      milestones: milestones.length,
      risks: risks.length,
      tasks: tasks.length,
      guardrails: guardrails.length,
      promptPolicy: 1,
      genesisSession: 1,
      thoughts: thoughtDefs.length,
      clusters: clusterDefs.length,
    });
    return true;
  }

  // ── Admin endpoints ────────────────────────────────────────────────────

  if (method === "GET" && pathname === "/api/admin/security") {
    const now = Date.now();
    ctx.sendJson(res, 200, {
      auth: {
        requireAuth: ctx.requireUiAuth,
        requireMfa: ctx.requireUiMfa,
        requireAdminToken: ctx.requireAdminToken,
        adminTokenConfigured: Boolean(ctx.uiAdminToken),
        allowedIps: ctx.allowedIps,
        trustProxyHeaders: ctx.trustProxyHeaders,
        authMaxFailures: ctx.authMaxFailures,
        authLockoutMs: ctx.authLockoutMs,
        mfaMaxFailures: ctx.mfaMaxFailures,
        mfaLockoutMs: ctx.mfaLockoutMs,
      },
      sessions: {
        activeMfaSessions: [...ctx.mfaSessions.values()].filter(
          (session) => session.expiresAt > now,
        ).length,
      },
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/sessions") {
    ctx.sendJson(res, 200, {
      sessions: ctx.listSessions(),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/devices") {
    const devices = new Map<
      string,
      {
        deviceId: string;
        sessions: number;
        latestSeenAt: string;
        ips: string[];
        userAgent: string;
      }
    >();
    for (const session of ctx.listSessions()) {
      const existing = devices.get(session.deviceId) ?? {
        deviceId: session.deviceId,
        sessions: 0,
        latestSeenAt: session.lastSeenAt,
        ips: [],
        userAgent: session.userAgent,
      };
      existing.sessions += 1;
      existing.latestSeenAt =
        existing.latestSeenAt > session.lastSeenAt
          ? existing.latestSeenAt
          : session.lastSeenAt;
      if (!existing.ips.includes(session.clientIp)) {
        existing.ips.push(session.clientIp);
      }
      devices.set(session.deviceId, existing);
    }
    ctx.sendJson(res, 200, {
      devices: [...devices.values()].sort((a, b) =>
        a.latestSeenAt < b.latestSeenAt ? 1 : -1,
      ),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/sessions/revoke") {
    const body = (await ctx.readBody(req)) as {
      all?: boolean;
      sessionId?: string;
      deviceId?: string;
    };
    let revoked = 0;
    if (body?.all === true) {
      revoked = ctx.mfaSessions.size;
      ctx.mfaSessions.clear();
    } else if (body?.sessionId) {
      const before = ctx.mfaSessions.size;
      for (const [token, session] of ctx.mfaSessions.entries()) {
        if (session.tokenId === body.sessionId) {
          ctx.mfaSessions.delete(token);
        }
      }
      revoked = before - ctx.mfaSessions.size;
    } else if (body?.deviceId) {
      const before = ctx.mfaSessions.size;
      for (const [token, session] of ctx.mfaSessions.entries()) {
        if (session.deviceId === body.deviceId) {
          ctx.mfaSessions.delete(token);
        }
      }
      revoked = before - ctx.mfaSessions.size;
    } else {
      const token = ctx.parseCookies(req.headers.cookie).qore_ui_mfa;
      if (token && ctx.mfaSessions.has(token)) {
        ctx.mfaSessions.delete(token);
        revoked = 1;
      }
    }
    res.setHeader(
      "set-cookie",
      "qore_ui_mfa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    ctx.sendJson(res, 200, {
      ok: true,
      revoked,
      mode:
        body?.all === true
          ? "all"
          : body?.sessionId
            ? "session"
            : body?.deviceId
              ? "device"
              : "current",
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/mfa/recovery/reset") {
    const body = (await ctx.readBody(req)) as {
      confirm?: string;
      secret?: string;
      account?: string;
      issuer?: string;
    };
    if (String(body?.confirm ?? "") !== "RESET_MFA") {
      ctx.sendJson(res, 400, {
        error: "CONFIRMATION_REQUIRED",
        message: "Set confirm=RESET_MFA to rotate MFA secret.",
      });
      return true;
    }
    const { encodeBase32 } = await import("../mfa.js");
    const nextSecret =
      ctx.normalizeTotpSecret(body?.secret) ??
      encodeBase32(crypto.randomBytes(20));
    ctx.uiTotpSecret = nextSecret;
    const account = String(
      body?.account ?? process.env.QORE_MFA_ACCOUNT ?? "failsafe-admin",
    );
    const issuer = String(
      body?.issuer ?? process.env.QORE_MFA_ISSUER ?? "FailSafe-Qore",
    );
    const otpAuthUrl = ctx.buildOtpAuthUrl(nextSecret, account, issuer);
    const revokedSessions = ctx.mfaSessions.size;
    ctx.mfaSessions.clear();
    ctx.sendJson(res, 200, {
      ok: true,
      secret: nextSecret,
      otpAuthUrl,
      revokedSessions,
    });
    return true;
  }

  // ── Settings endpoints ─────────────────────────────────────────────────

  if (method === "GET" && pathname === "/api/settings") {
    const { getSecretStore } = await import(
      "../../../runtime/support/SecureSecretStore.js"
    );
    ctx.sendJson(res, 200, {
      hasCredentials: Boolean(ctx.uiAuthUser && ctx.uiAuthPass),
      username: ctx.uiAuthUser || null,
      mfaEnabled: ctx.requireUiMfa,
      mfaConfigured: Boolean(ctx.uiTotpSecret),
      configPath: getSecretStore().getUserConfigDir(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/settings/credentials") {
    const body = (await ctx.readBody(req)) as {
      username?: string;
      password?: string;
      currentPassword?: string;
    };

    // If credentials already exist, require current password
    if (ctx.uiAuthPass && body?.currentPassword !== ctx.uiAuthPass) {
      ctx.sendJson(res, 401, {
        error: "INVALID_CURRENT_PASSWORD",
        message: "Current password is incorrect",
      });
      return true;
    }

    const newUser = String(body?.username ?? "").trim();
    const newPass = String(body?.password ?? "");

    if (!newUser || !newPass) {
      ctx.sendJson(res, 400, {
        error: "INVALID_INPUT",
        message: "Username and password are required",
      });
      return true;
    }

    if (newPass.length < 8) {
      ctx.sendJson(res, 400, {
        error: "WEAK_PASSWORD",
        message: "Password must be at least 8 characters",
      });
      return true;
    }

    // Save to SecureSecretStore
    const { getSecretStore } = await import(
      "../../../runtime/support/SecureSecretStore.js"
    );
    const store = getSecretStore();
    const secrets = store.getAllSecrets();
    secrets.QORE_UI_BASIC_AUTH_USER = newUser;
    secrets.QORE_UI_BASIC_AUTH_PASS = newPass;
    store.writeSecrets(secrets);

    // Update in-memory values
    ctx.uiAuthUser = newUser;
    ctx.uiAuthPass = newPass;

    // Revoke all sessions so user must re-auth
    ctx.authSessions.clear();

    ctx.sendJson(res, 200, {
      ok: true,
      message: "Credentials updated successfully",
      configPath: store.getUserConfigDir(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/settings/mfa/enable") {
    const body = (await ctx.readBody(req)) as {
      account?: string;
      issuer?: string;
    };

    // Generate new TOTP secret
    const { encodeBase32 } = await import("../mfa.js");
    const newSecret = encodeBase32(crypto.randomBytes(20));
    const account = String(body?.account ?? "failsafe-admin");
    const issuer = String(body?.issuer ?? "FailSafe-Qore");
    const otpAuthUrl = ctx.buildOtpAuthUrl(newSecret, account, issuer);

    // Save to SecureSecretStore
    const { getSecretStore } = await import(
      "../../../runtime/support/SecureSecretStore.js"
    );
    const store = getSecretStore();
    const secrets = store.getAllSecrets();
    secrets.QORE_UI_TOTP_SECRET = newSecret;
    store.writeSecrets(secrets);

    // Update in-memory value
    ctx.uiTotpSecret = newSecret;

    ctx.sendJson(res, 200, {
      ok: true,
      secret: newSecret,
      otpAuthUrl,
      message:
        "Scan the QR code with your authenticator app, then set QORE_UI_REQUIRE_MFA=true to enable",
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/settings/mfa/disable") {
    const body = (await ctx.readBody(req)) as { code?: string };

    // Verify MFA code before disabling
    if (ctx.uiTotpSecret && ctx.requireUiMfa) {
      const { verifyTotpCode } = await import("../mfa.js");
      const code = String(body?.code ?? "");
      if (!verifyTotpCode(code, ctx.uiTotpSecret)) {
        ctx.sendJson(res, 401, {
          error: "INVALID_CODE",
          message: "Invalid MFA code",
        });
        return true;
      }
    }

    // Clear TOTP secret
    const { getSecretStore } = await import(
      "../../../runtime/support/SecureSecretStore.js"
    );
    const store = getSecretStore();
    const secrets = store.getAllSecrets();
    delete secrets.QORE_UI_TOTP_SECRET;
    store.writeSecrets(secrets);

    // Update in-memory value
    ctx.uiTotpSecret = "";

    // Clear MFA sessions
    ctx.mfaSessions.clear();

    ctx.sendJson(res, 200, {
      ok: true,
      message: "MFA has been disabled",
    });
    return true;
  }

  // ── Updates endpoints ──────────────────────────────────────────────────

  if (method === "GET" && pathname === "/api/updates") {
    const { getUpdateManager } = await import("../update-manager.js");
    const mgr = getUpdateManager();
    const lastCheck = mgr.getLastCheckResult();
    const autoCheck = mgr.getAutoCheckSettings();
    ctx.sendJson(res, 200, {
      currentVersion: mgr.getCurrentVersion(),
      lastCheck,
      autoCheck,
      canRollback: mgr.canRollback(),
      rollbackVersions: mgr.getRollbackVersions(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/updates/check") {
    const { getUpdateManager } = await import("../update-manager.js");
    const mgr = getUpdateManager();
    const result = await mgr.checkForUpdates();
    ctx.sendJson(res, 200, result);
    return true;
  }

  if (method === "GET" && pathname === "/api/updates/history") {
    const { getUpdateManager } = await import("../update-manager.js");
    const mgr = getUpdateManager();
    ctx.sendJson(res, 200, {
      history: mgr.getHistory(),
      backupDir: mgr.getBackupDir(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/updates/settings") {
    const body = (await ctx.readBody(req)) as {
      autoCheckEnabled?: boolean;
      autoCheckIntervalMs?: number;
    };
    const { getUpdateManager } = await import("../update-manager.js");
    const mgr = getUpdateManager();
    mgr.setAutoCheckSettings(
      body.autoCheckEnabled ?? true,
      body.autoCheckIntervalMs,
    );
    ctx.sendJson(res, 200, {
      ok: true,
      settings: mgr.getAutoCheckSettings(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/updates/backup") {
    const { getUpdateManager } = await import("../update-manager.js");
    const mgr = getUpdateManager();
    const backupPath = await mgr.createBackup();
    ctx.sendJson(res, 200, {
      ok: true,
      backupPath,
      version: mgr.getCurrentVersion(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/updates/record") {
    const body = (await ctx.readBody(req)) as {
      version: string;
      installedBy?: string;
      releaseNotes?: string;
    };

    if (!body.version) {
      ctx.sendJson(res, 400, {
        error: "VERSION_REQUIRED",
        message: "Version is required",
      });
      return true;
    }

    const { getUpdateManager } = await import("../update-manager.js");
    const mgr = getUpdateManager();
    mgr.recordUpdate(
      body.version,
      body.installedBy || "ui",
      body.releaseNotes,
    );

    ctx.sendJson(res, 200, {
      ok: true,
      recorded: body.version,
    });
    return true;
  }

  // ── Action endpoints ───────────────────────────────────────────────────

  if (method === "POST" && pathname === "/api/actions/resume-monitoring") {
    ctx.monitoringEnabled = true;
    ctx.appendCheckpoint("monitoring.resumed", "phase-implement", "PASS");
    ctx.broadcast({ type: "hub.refresh" });
    ctx.sendJson(res, 200, { ok: true, monitoring: "running" });
    return true;
  }

  if (method === "POST" && pathname === "/api/actions/panic-stop") {
    ctx.monitoringEnabled = false;
    ctx.appendCheckpoint("monitoring.stopped", "phase-implement", "WARN");
    ctx.broadcast({ type: "hub.refresh" });
    ctx.sendJson(res, 200, { ok: true, monitoring: "stopped" });
    return true;
  }

  // ── Qore runtime endpoints ────────────────────────────────────────────

  if (method === "GET" && pathname === "/api/qore/runtime") {
    const runtime = await ctx.fetchRuntimeSnapshot();
    ctx.sendJson(res, 200, runtime);
    return true;
  }

  if (method === "GET" && pathname === "/api/qore/health") {
    const runtimeHealth = await ctx.fetchQoreJson("/health");
    if (!runtimeHealth.ok) {
      ctx.sendJson(res, 502, runtimeHealth);
      return true;
    }
    ctx.sendJson(res, 200, runtimeHealth.body);
    return true;
  }

  if (method === "GET" && pathname === "/api/qore/policy-version") {
    const policy = await ctx.fetchQoreJson("/policy/version");
    if (!policy.ok) {
      ctx.sendJson(res, 502, policy);
      return true;
    }
    ctx.sendJson(res, 200, policy.body);
    return true;
  }

  if (method === "POST" && pathname === "/api/qore/evaluate") {
    const body = await ctx.readBody(req);
    const evaluate = await ctx.fetchQoreJson("/evaluate", "POST", body);
    if (!evaluate.ok) {
      ctx.sendJson(res, 502, evaluate);
      return true;
    }
    ctx.sendJson(res, 200, evaluate.body);
    return true;
  }

  // ── Prompt governance evaluation ───────────────────────────────────────

  if (method === "POST" && pathname === "/api/prompt/evaluate") {
    const body = await ctx.readBody(req);
    const promptPayload = body as {
      prompt?: string;
      projectId?: string;
      actorId?: string;
    };
    const prompt = String(promptPayload?.prompt || "").trim();
    const projectId = String(promptPayload?.projectId || "default");
    const actorId = String(promptPayload?.actorId || "unknown");

    if (!prompt) {
      ctx.sendJson(res, 400, {
        error: "prompt_required",
        detail: "Prompt text is required",
      });
      return true;
    }

    // Import scanners dynamically to avoid startup cost
    try {
      const { scanForInjection, scanForJailbreak, scanForSensitiveData } =
        await import("../../prompt-governance/scanners.js");
      const { countTokens } =
        await import("../../prompt-governance/tokenizer.js");

      // Run all governance scans
      const injectionResult = scanForInjection(prompt, "standard");
      const jailbreakResult = scanForJailbreak(prompt);
      const sensitiveResult = scanForSensitiveData(prompt);
      const tokenCount = countTokens(prompt);

      // Determine decision
      let decision: "ALLOW" | "DENY" | "ESCALATE" | "WARN" = "ALLOW";
      const reasons: string[] = [];
      const gatesTriggered: string[] = [];

      if (injectionResult.detected && injectionResult.score > 0.7) {
        decision = "DENY";
        reasons.push(
          `Injection detected: ${injectionResult.reason || "suspicious patterns"}`,
        );
        gatesTriggered.push("injection");
      }

      if (jailbreakResult.detected) {
        decision = "DENY";
        reasons.push(
          `Jailbreak pattern: ${jailbreakResult.matches.slice(0, 3).join(", ")}`,
        );
        gatesTriggered.push("jailbreak");
      }

      if (sensitiveResult.detected && sensitiveResult.types.length > 0) {
        if (decision === "ALLOW") decision = "WARN";
        reasons.push(
          `Sensitive data detected: ${sensitiveResult.types.join(", ")}`,
        );
        gatesTriggered.push("pii");
      }

      // Token budget check (default: 32000 tokens)
      const maxTokens = 32000;
      if (tokenCount > maxTokens) {
        decision = "DENY";
        reasons.push(
          `Token count ${tokenCount} exceeds limit of ${maxTokens}`,
        );
        gatesTriggered.push("budget");
      }

      // Create audit entry hash
      const promptHash = crypto
        .createHash("sha256")
        .update(prompt)
        .digest("hex");

      ctx.sendJson(res, 200, {
        decision,
        reasons,
        gatesTriggered,
        tokenCount,
        promptHash,
        injectionScore: injectionResult.score,
        jailbreakMatch: jailbreakResult.detected,
        sensitiveDataTypes: sensitiveResult.types,
        projectId,
        actorId,
      });
      return true;
    } catch (scanError) {
      const errorMessage =
        scanError instanceof Error ? scanError.message : String(scanError);
      ctx.sendJson(res, 500, {
        error: "scan_failed",
        detail: errorMessage,
      });
      return true;
    }
  }

  // ── Embedding endpoints ────────────────────────────────────────────────

  if (method === "POST" && pathname === "/api/embeddings/generate") {
    const body = await ctx.readBody(req);
    const embeddingPayload = body as { text?: string };
    const text = String(embeddingPayload?.text || "").trim();

    if (!text) {
      ctx.sendJson(res, 400, {
        error: "text_required",
        detail: "Text is required for embedding generation",
      });
      return true;
    }

    try {
      const { LocalEmbeddingService } =
        await import("../../embeddings/local-service.js");
      const service = new LocalEmbeddingService();
      const result = await service.embed(text);
      ctx.sendJson(res, 200, {
        id: result.id,
        dimensions: result.vector.dimensions,
        model: result.vector.model,
        inputHash: result.inputHash,
        computedAt: result.computedAt,
      });
      return true;
    } catch (embeddingError) {
      const errorMessage =
        embeddingError instanceof Error
          ? embeddingError.message
          : String(embeddingError);
      ctx.sendJson(res, 500, {
        error: "embedding_failed",
        detail: errorMessage,
      });
      return true;
    }
  }

  if (method === "POST" && pathname === "/api/embeddings/similar") {
    const body = await ctx.readBody(req);
    const similarPayload = body as {
      vector?: number[];
      k?: number;
      projectId?: string;
    };
    const vector = similarPayload?.vector;
    const k = Number(similarPayload?.k ?? 10);
    const projectId = similarPayload?.projectId;

    if (!Array.isArray(vector) || vector.length === 0) {
      ctx.sendJson(res, 400, {
        error: "vector_required",
        detail: "Vector array is required",
      });
      return true;
    }

    try {
      const { createDuckDBClient } =
        await import("../../storage/duckdb-client.js");
      const { EmbeddingSimilaritySearch } =
        await import("../../embeddings/similarity.js");
      const client = await createDuckDBClient({ dbPath: ":memory:" });
      const search = new EmbeddingSimilaritySearch(client);
      const results = await search.findSimilar(vector, k, { projectId });
      await client.close();
      ctx.sendJson(res, 200, { results });
      return true;
    } catch (searchError) {
      const errorMessage =
        searchError instanceof Error
          ? searchError.message
          : String(searchError);
      ctx.sendJson(res, 500, {
        error: "search_failed",
        detail: errorMessage,
      });
      return true;
    }
  }

  // ── Void UI session management endpoints ───────────────────────────────

  if (method === "POST" && pathname === "/api/void/session") {
    const body = await ctx.readBody(req);
    const voidPayload = body as { projectId?: string; mode?: string };
    const mode = String(voidPayload?.mode || "genesis");

    if (ctx.projectStorage) {
      const active = await ctx.projectStorage.listActiveProject();
      const projectId = String(voidPayload?.projectId || active?.id || "proj-default");
      const session = await ctx.projectStorage.createGenesisSession({
        id: crypto.randomUUID(),
        projectId,
        rawInput: "",
      });
      ctx.sendJson(res, 200, {
        sessionId: session.id,
        projectId: session.projectId,
        mode,
        thoughtCount: 0,
        state: "capturing",
      });
    } else {
      const sessionId = crypto.randomUUID();
      const projectId = String(voidPayload?.projectId || "default-project");
      ctx.sendJson(res, 200, { sessionId, projectId, mode, thoughtCount: 0, state: "capturing" });
    }
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/void/session/")) {
    const sessionId = pathname.substring("/api/void/session/".length);
    if (!sessionId) {
      ctx.sendJson(res, 400, { error: "session_id_required" });
      return true;
    }
    if (ctx.projectStorage) {
      const session = await ctx.projectStorage.getGenesisSession(sessionId);
      if (!session) {
        ctx.sendJson(res, 404, { error: "session_not_found" });
        return true;
      }
      const thoughts = await ctx.projectStorage.listThoughtsForSession(sessionId);
      const lastResult = ctx.genesisPipeline?.getLastResult();
      const completenessScore = lastResult ? 0.5 : 0;
      ctx.sendJson(res, 200, {
        sessionId: session.id,
        thoughtCount: thoughts.length,
        state: "capturing",
        readyForReveal: completenessScore >= 0.7,
        completenessScore,
      });
    } else {
      ctx.sendJson(res, 200, {
        sessionId, thoughtCount: 0, state: "capturing",
        readyForReveal: false, completenessScore: 0,
      });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/void/thought") {
    const body = await ctx.readBody(req);
    const thoughtPayload = body as { sessionId?: string; content?: string };
    const sessionId = String(thoughtPayload?.sessionId || "");
    const content = String(thoughtPayload?.content || "").trim();

    if (!sessionId) {
      ctx.sendJson(res, 400, { error: "session_id_required" });
      return true;
    }
    if (!content) {
      ctx.sendJson(res, 400, { error: "content_required" });
      return true;
    }

    if (ctx.projectStorage) {
      const thought = await ctx.projectStorage.createThought({
        id: crypto.randomUUID(),
        sessionId,
        content,
      });
      ctx.genesisPipeline?.queueThought(sessionId, thought.id);
      ctx.sendJson(res, 200, { ok: true, thoughtId: thought.id, sessionId });
    } else {
      const thoughtId = crypto.randomUUID();
      ctx.sendJson(res, 200, { ok: true, thoughtId, sessionId });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/void/prompt/dismiss") {
    const body = await ctx.readBody(req);
    const dismissPayload = body as { sessionId?: string };
    const sessionId = String(dismissPayload?.sessionId || "");
    // Acknowledge prompt dismissal
    ctx.sendJson(res, 200, { ok: true, sessionId });
    return true;
  }

  if (method === "POST" && pathname === "/api/void/accept-reveal") {
    const body = await ctx.readBody(req);
    const revealPayload = body as { sessionId?: string };
    const sessionId = String(revealPayload?.sessionId || "");
    // Transition session to revealing state
    ctx.sendJson(res, 200, {
      ok: true,
      sessionId,
      state: "revealing",
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/void/decline-offer") {
    const body = await ctx.readBody(req);
    const declinePayload = body as { sessionId?: string };
    const sessionId = String(declinePayload?.sessionId || "");
    // Return to capturing state
    ctx.sendJson(res, 200, {
      ok: true,
      sessionId,
      state: "capturing",
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/void/mode") {
    const body = await ctx.readBody(req);
    const modePayload = body as { sessionId?: string; mode?: string };
    const sessionId = String(modePayload?.sessionId || "");
    const mode = String(modePayload?.mode || "genesis");
    // Update session mode
    ctx.sendJson(res, 200, { ok: true, sessionId, mode });
    return true;
  }

  // ── Reveal UI endpoints ────────────────────────────────────────────────

  if (method === "GET" && pathname.startsWith("/api/reveal/")) {
    const sessionId = pathname.substring("/api/reveal/".length);
    if (!sessionId || sessionId.includes("/")) {
      ctx.sendJson(res, 400, { error: "session_id_required" });
      return true;
    }
    if (ctx.revealService) {
      const lastResult = ctx.genesisPipeline?.getLastResult();
      const candidates = lastResult?.clusters ?? [];
      const view = await ctx.revealService.loadRevealView(sessionId, candidates);
      ctx.sendJson(res, 200, {
        sessionId,
        projectId: (view as any).projectId ?? "default-project",
        state: (view as any).state ?? "interactive",
        clusters: (view as any).clusters ?? [],
        thoughts: (view as any).thoughts ?? [],
        outliers: (view as any).outliers ?? [],
      });
    } else {
      ctx.sendJson(res, 200, {
        sessionId, projectId: "unknown", state: "empty", clusters: [],
        thoughts: [], outliers: [], selectedClusterId: null, selectedThoughtId: null,
      });
    }
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/reveal\/[^/]+\/confirm$/)
  ) {
    const sessionId = pathname.split("/")[3];
    if (ctx.revealService) {
      const lastResult = ctx.genesisPipeline?.getLastResult();
      const candidates = lastResult?.clusters ?? [];
      const view = await ctx.revealService.loadRevealView(sessionId, candidates);
      const clusters = await ctx.revealService.confirmOrganization(view);
      ctx.sendJson(res, 200, { ok: true, sessionId, state: "confirmed", clusterCount: clusters.length });
    } else {
      ctx.sendJson(res, 200, { ok: true, sessionId, state: "confirmed" });
    }
    return true;
  }

  if (method === "POST" && pathname.match(/^\/api\/reveal\/[^/]+\/cancel$/)) {
    const sessionId = pathname.split("/")[3];
    ctx.sendJson(res, 200, { ok: true, sessionId });
    return true;
  }

  if (
    method === "PATCH" &&
    pathname.match(/^\/api\/reveal\/[^/]+\/cluster\/[^/]+$/)
  ) {
    const parts = pathname.split("/");
    const sessionId = parts[3];
    const clusterId = parts[5];
    const body = await ctx.readBody(req);
    const { name, position } = body as {
      name?: string;
      position?: { x: number; y: number };
    };
    if (ctx.revealService) {
      const lastResult = ctx.genesisPipeline?.getLastResult();
      const candidates = lastResult?.clusters ?? [];
      const view = await ctx.revealService.loadRevealView(sessionId, candidates);
      if (name !== undefined) ctx.revealService.renameCluster(view, clusterId, name);
      if (position) ctx.revealService.updatePosition(view, clusterId, position);
    }
    ctx.sendJson(res, 200, { ok: true, sessionId, clusterId, name, position });
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/reveal\/[^/]+\/move-thought$/)
  ) {
    const sessionId = pathname.split("/")[3];
    const body = await ctx.readBody(req);
    const { thoughtId, toClusterId } = body as { thoughtId: string; toClusterId: string };
    if (ctx.revealService) {
      const lastResult = ctx.genesisPipeline?.getLastResult();
      const candidates = lastResult?.clusters ?? [];
      const view = await ctx.revealService.loadRevealView(sessionId, candidates);
      ctx.revealService.moveThought(view, thoughtId, toClusterId);
    }
    ctx.sendJson(res, 200, { ok: true, sessionId, thoughtId, toClusterId });
    return true;
  }

  // ── Constellation UI endpoints ─────────────────────────────────────────

  if (method === "GET" && pathname.match(/^\/api\/constellation\/[^/]+$/)) {
    const projectId = pathname.split("/")[3];
    if (ctx.constellationService) {
      const state = await ctx.constellationService.loadConstellation(projectId);
      ctx.sendJson(res, 200, state);
    } else {
      ctx.sendJson(res, 200, {
        projectId, view: "hierarchical", clusters: [], spatialClusters: [],
        thoughts: [], viewport: { x: 0, y: 0, scale: 1, velocityX: 0, velocityY: 0 },
        selectedClusterId: null, focusedClusterId: null,
      });
    }
    return true;
  }

  if (
    method === "PATCH" &&
    pathname.match(/^\/api\/constellation\/[^/]+\/view$/)
  ) {
    const projectId = pathname.split("/")[3];
    const body = await ctx.readBody(req);
    const { view } = body as { view: string };
    ctx.sendJson(res, 200, { ok: true, projectId, view });
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/constellation\/[^/]+\/merge$/)
  ) {
    const projectId = pathname.split("/")[3];
    const body = await ctx.readBody(req);
    const { sourceId, targetId } = body as { sourceId: string; targetId: string };
    if (ctx.constellationService) {
      const state = await ctx.constellationService.loadConstellation(projectId);
      await ctx.constellationService.mergeClusters(state, sourceId, targetId);
    }
    ctx.sendJson(res, 200, { ok: true, projectId, sourceId, targetId });
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/constellation\/[^/]+\/connection$/)
  ) {
    const projectId = pathname.split("/")[3];
    const body = await ctx.readBody(req);
    const { fromId, toId } = body as { fromId: string; toId: string };
    if (ctx.constellationService) {
      const state = await ctx.constellationService.loadConstellation(projectId);
      await ctx.constellationService.createConnection(state, fromId, toId);
    }
    ctx.sendJson(res, 200, { ok: true, projectId, fromId, toId });
    return true;
  }

  // ── Path API endpoints ─────────────────────────────────────────────────

  if (method === "GET" && pathname.match(/^\/api\/path\/[^/]+$/)) {
    const projectId = pathname.split("/")[3];
    if (ctx.projectStorage) {
      const phases = await ctx.projectStorage.listPhasesForProject(projectId);
      ctx.sendJson(res, 200, {
        projectId,
        phases,
        criticalPath: phases.filter((p: any) => p.dependencies?.length > 0).map((p: any) => p.id),
        totalDurationDays: null,
        hasScheduleConflicts: false,
      });
    } else {
      ctx.sendJson(res, 200, {
        projectId, phases: [], criticalPath: [],
        totalDurationDays: null, hasScheduleConflicts: false,
      });
    }
    return true;
  }

  if (method === "POST" && pathname.match(/^\/api\/path\/[^/]+\/generate$/)) {
    const projectId = pathname.split("/")[3];
    if (ctx.pathService) {
      const pathState = await ctx.pathService.generatePath(projectId);
      ctx.sendJson(res, 200, { ok: true, projectId, pathState });
    } else {
      ctx.sendJson(res, 200, { ok: true, projectId });
    }
    return true;
  }

  if (
    method === "PATCH" &&
    pathname.match(/^\/api\/path\/[^/]+\/phase\/[^/]+$/)
  ) {
    const parts = pathname.split("/");
    const projectId = parts[3];
    const phaseId = parts[5];
    const body = (await ctx.readBody(req)) as { startDate?: string; endDate?: string };
    if (ctx.projectStorage) {
      await ctx.projectStorage.updatePhase(phaseId, {
        startDate: body.startDate,
        endDate: body.endDate,
      });
    }
    ctx.sendJson(res, 200, { ok: true, projectId, phaseId, startDate: body.startDate, endDate: body.endDate });
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/path\/[^/]+\/dependency$/)
  ) {
    const projectId = pathname.split("/")[3];
    const body = await ctx.readBody(req);
    const { fromId, toId } = body as { fromId: string; toId: string };
    if (ctx.projectStorage) {
      await ctx.projectStorage.addPhaseDependency(fromId, toId);
    }
    ctx.sendJson(res, 200, { ok: true, projectId, fromId, toId });
    return true;
  }

  // ── Risk API endpoints ─────────────────────────────────────────────────

  if (method === "GET" && pathname.match(/^\/api\/risk\/[^/]+$/)) {
    const projectId = pathname.split("/")[3];
    if (ctx.riskService) {
      const state = await ctx.riskService.loadRiskState(projectId);
      ctx.sendJson(res, 200, state);
    } else {
      ctx.sendJson(res, 200, {
        projectId, risks: [], matrix: [[], [], []],
        unresolvedCount: 0, mitigatedCount: 0,
      });
    }
    return true;
  }

  if (method === "POST" && pathname.match(/^\/api\/risk\/[^/]+$/)) {
    const projectId = pathname.split("/")[3];
    const body = (await ctx.readBody(req)) as {
      description: string;
      likelihood: string;
      impact: string;
    };
    if (ctx.riskService) {
      const risk = await ctx.riskService.addRisk(projectId, {
        description: body.description,
        likelihood: body.likelihood as any,
        impact: body.impact as any,
        avoidance: "",
        mitigation: "",
        contingency: "",
        status: "identified" as any,
      });
      ctx.sendJson(res, 200, { ok: true, projectId, risk });
    } else {
      const riskId = `risk-${Date.now()}`;
      ctx.sendJson(res, 200, { ok: true, projectId, riskId, description: body.description });
    }
    return true;
  }

  if (method === "PATCH" && pathname.match(/^\/api\/risk\/[^/]+\/[^/]+$/)) {
    const parts = pathname.split("/");
    const projectId = parts[3];
    const riskId = parts[4];
    const body = (await ctx.readBody(req)) as { status?: string };
    if (ctx.riskService) {
      await ctx.riskService.updateRisk(riskId, body as any);
    }
    ctx.sendJson(res, 200, { ok: true, projectId, riskId, status: body.status });
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/risk\/[^/]+\/[^/]+\/guardrail$/)
  ) {
    const parts = pathname.split("/");
    const projectId = parts[3];
    const riskId = parts[4];
    if (ctx.riskService) {
      await ctx.riskService.mitigateRisk(riskId);
    }
    ctx.sendJson(res, 200, { ok: true, projectId, riskId });
    return true;
  }

  // ── Autonomy API endpoints ─────────────────────────────────────────────

  if (
    method === "GET" &&
    pathname.match(/^\/api\/autonomy\/[^/]+\/readiness$/)
  ) {
    const projectId = pathname.split("/")[3];
    if (ctx.autonomyChecker) {
      const readiness = await ctx.autonomyChecker.checkReadiness(projectId);
      ctx.sendJson(res, 200, readiness);
    } else {
      ctx.sendJson(res, 200, {
        projectId, isReady: false, checks: [], blockerCount: 0, warningCount: 0,
      });
    }
    return true;
  }

  if (
    method === "POST" &&
    pathname.match(/^\/api\/autonomy\/[^/]+\/start$/)
  ) {
    const projectId = pathname.split("/")[3];
    const executionId = `exec-${Date.now()}`;
    ctx.sendJson(res, 200, { ok: true, projectId, executionId });
    return true;
  }

  // ── Navigation state endpoint ──────────────────────────────────────────

  if (
    method === "GET" &&
    pathname.match(/^\/api\/project\/[^/]+\/nav-state$/)
  ) {
    const projectId = pathname.split("/")[3];
    if (ctx.projectStorage) {
      const sessions = await ctx.projectStorage.listGenesisSessionsForProject(projectId);
      const clusters = await ctx.projectStorage.listClustersForProject(projectId);
      const phases = await ctx.projectStorage.listPhasesForProject(projectId);
      const risks = await ctx.projectStorage.listRisksForProject(projectId);
      const readiness = ctx.autonomyChecker
        ? await ctx.autonomyChecker.checkReadiness(projectId)
        : null;
      ctx.sendJson(res, 200, {
        projectId,
        routes: {
          void: { hasData: sessions.length > 0, count: sessions.length },
          reveal: { hasData: clusters.length > 0, count: clusters.length },
          constellation: { hasData: clusters.length > 0, count: clusters.length },
          path: { hasData: phases.length > 0, count: phases.length },
          risk: { hasData: risks.length > 0, count: risks.length },
          autonomy: { hasData: readiness !== null, isReady: (readiness as any)?.isReady ?? false },
        },
        recommendedNext: sessions.length === 0 ? "void"
          : clusters.length === 0 ? "reveal"
          : phases.length === 0 ? "path"
          : "constellation",
      });
    } else {
      ctx.sendJson(res, 200, {
        projectId,
        routes: {
          void: { hasData: true, count: 0 }, reveal: { hasData: false, count: 0 },
          constellation: { hasData: false, count: 0 }, path: { hasData: false, count: 0 },
          risk: { hasData: false, count: 0 }, autonomy: { hasData: false, isReady: false },
        },
        recommendedNext: "void",
      });
    }
    return true;
  }

  // ── UI meta routes ─────────────────────────────────────────────────────

  if (method === "GET" && pathname === "/api/ui/routes") {
    ctx.sendJson(res, 200, {
      default: "/",
      monitor: "/ui/monitor",
      console: "/ui/console",
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/ui/debug") {
    const fs = await import("fs");
    ctx.sendJson(res, 200, {
      assetsDir: ctx.assetsDir,
      cwd: process.cwd(),
      hasIndex: ctx.hasUiAsset("index.html"),
      filesInDir: fs.existsSync(ctx.assetsDir)
        ? fs.readdirSync(ctx.assetsDir).filter((f) => f.endsWith(".html"))
        : [],
    });
    return true;
  }

  // ── Zo ask endpoint (async job pattern) ─────────────────────────────────
  //
  // POST /api/zo/ask  → accepts prompt, returns { jobId } immediately
  // GET  /api/zo/ask/status/<id> → returns job status + result when ready

  if (method === "POST" && pathname === "/api/zo/ask") {
    evictStaleJobs();

    // Read body BEFORE responding (stream can only be consumed once)
    const body = await ctx.readBody(req);
    const payload = body as Record<string, unknown>;
    if (payload.prompt && !payload.input) {
      payload.input = payload.prompt;
      delete payload.prompt;
    }
    // model_name is passed through to the Zo API as-is (sent by mobile client)

    const jobId = `zo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const job: ZoJob = { id: jobId, status: "pending", createdAt: Date.now() };
    zoJobs.set(jobId, job);

    // Return job ID immediately (avoids reverse proxy timeout)
    ctx.sendJson(res, 202, { jobId, status: "pending" });

    // Broadcast mobile chat submission to Command Center activity log
    const inputPreview = String(payload.input || "").slice(0, 120);
    ctx.broadcast({
      type: "event",
      payload: { mobileChat: "submitted", jobId, preview: inputPreview },
    });

    // Fire off the Zo API call in the background
    const zoBaseUrl =
      ctx.zoApiBaseUrl ||
      process.env.ZO_API_BASE_URL ||
      "https://api.zo.computer";
    const zoToken = process.env.ZO_CLIENT_IDENTITY_TOKEN;

    ctx.fetchExternalJson(
      zoBaseUrl,
      "/zo/ask",
      "POST",
      payload,
      zoToken ? { authorization: zoToken } : undefined,
    ).then((zoResult) => {
      if (!zoResult.ok) {
        job.status = "error";
        job.error = zoResult.detail || zoResult.error || "upstream_error";
      } else {
        job.status = "done";
        job.result = zoResult.body;
      }
      // Broadcast completion to Command Center activity log + mobile WS clients
      ctx.broadcast({ type: "zo:ask:done", jobId, status: job.status });
      const replyBody = zoResult.ok ? zoResult.body : null;
      const replyPreview = typeof (replyBody as Record<string, unknown>)?.output === "string"
        ? String((replyBody as Record<string, unknown>).output).slice(0, 200)
        : job.status;
      ctx.broadcast({
        type: "event",
        payload: { mobileChat: "completed", jobId, status: job.status, preview: replyPreview },
      });
    }).catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      ctx.broadcast({ type: "zo:ask:done", jobId, status: "error" });
      ctx.broadcast({
        type: "event",
        payload: { mobileChat: "error", jobId, error: job.error },
      });
    });

    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/zo/ask/status/")) {
    const jobId = pathname.slice("/api/zo/ask/status/".length);
    const job = zoJobs.get(jobId);
    if (!job) {
      ctx.sendJson(res, 404, { error: "job_not_found" });
      return true;
    }
    if (job.status === "pending") {
      ctx.sendJson(res, 200, { jobId, status: "pending" });
    } else if (job.status === "done") {
      ctx.sendJson(res, 200, { jobId, status: "done", result: job.result });
    } else {
      ctx.sendJson(res, 200, { jobId, status: "error", error: job.error });
    }
    return true;
  }

  // ── Brainstorm audio ingest ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/projects/brainstorm/ingest") {
    const body = await ctx.readBody(req);
    const payload = body as { projectId?: string; audio?: string; target?: string };
    const projectId = String(payload?.projectId || "default-project");
    let sessionId = "brainstorm-" + projectId;
    if (ctx.projectStorage) {
      let session = await ctx.projectStorage.getGenesisSession(sessionId);
      if (!session) {
        session = await ctx.projectStorage.createGenesisSession({
          id: sessionId,
          projectId,
          rawInput: "(audio brainstorm recording)",
          audioArtifacts: [],
        });
      }
      const thought = await ctx.projectStorage.createThought({
        id: crypto.randomUUID(),
        sessionId,
        content: "(Voice brainstorm \u2014 processing audio input)",
      });
      ctx.genesisPipeline?.queueThought(sessionId, thought.id);
      ctx.broadcast({ type: "brainstorm:ingested", projectId, thoughtId: thought.id, sessionId });
      ctx.sendJson(res, 200, { ok: true, thoughtId: thought.id, sessionId, projectId, phase: "queued" });
    } else {
      const thoughtId = crypto.randomUUID();
      ctx.broadcast({ type: "brainstorm:ingested", projectId, thoughtId, sessionId });
      ctx.sendJson(res, 200, { ok: true, thoughtId, sessionId, projectId, phase: "queued" });
    }
    return true;
  }

  // ── Brainstorm text idea (quick input) ─────────────────────────────────
  if (method === "POST" && pathname === "/api/projects/brainstorm/idea") {
    const body = await ctx.readBody(req);
    const payload = body as { projectId?: string; content?: string };
    const projectId = String(payload?.projectId || "default-project");
    const content = String(payload?.content || "").trim();
    if (!content) {
      ctx.sendJson(res, 400, { error: "content_required" });
      return true;
    }
    let sessionId = "brainstorm-" + projectId;
    if (ctx.projectStorage) {
      let session = await ctx.projectStorage.getGenesisSession(sessionId);
      if (!session) {
        session = await ctx.projectStorage.createGenesisSession({
          id: sessionId,
          projectId,
          rawInput: "",
          audioArtifacts: [],
        });
      }
      const thought = await ctx.projectStorage.createThought({
        id: crypto.randomUUID(),
        sessionId,
        content,
      });
      ctx.genesisPipeline?.queueThought(sessionId, thought.id);
      ctx.broadcast({ type: "brainstorm:ingested", projectId, thoughtId: thought.id, sessionId });
      ctx.sendJson(res, 200, { ok: true, thoughtId: thought.id, sessionId, projectId });
    } else {
      const thoughtId = crypto.randomUUID();
      ctx.broadcast({ type: "brainstorm:ingested", projectId, thoughtId, sessionId });
      ctx.sendJson(res, 200, { ok: true, thoughtId, sessionId, projectId });
    }
    return true;
  }

  // ── Testing: List test files (reads from tests/INDEX.json per IR-002)
  if (method === "GET" && pathname === "/api/testing/files") {
    try {
      const fs = await import("fs");
      const fspath = await import("path");
      const cwd = process.cwd();
      const indexPath = fspath.join(cwd, "tests", "INDEX.json");
      const raw = fs.readFileSync(indexPath, "utf-8");
      const index = JSON.parse(raw);
      const modules: Record<string, { label: string; files: string[] }> = index.modules || {};
      const allFiles: string[] = [];
      for (const mod of Object.values(modules)) {
        if (Array.isArray(mod.files)) {
          for (const f of mod.files) allFiles.push(f);
        }
      }
      allFiles.sort();
      // Detect unindexed files on disk for IR-002 governance warnings
      let unindexed: string[] = [];
      try {
        const { execSync } = await import("child_process");
        const diskOut = execSync("find tests -name '*.test.ts' -o -name '*.test.js' 2>/dev/null || true", { cwd, encoding: "utf-8", timeout: 5000 });
        const diskFiles = diskOut.trim().split("\n").filter(Boolean).sort();
        const indexedSet = new Set(allFiles);
        unindexed = diskFiles.filter((f: string) => !indexedSet.has(f));
      } catch {}
      ctx.sendJson(res, 200, {
        ok: true,
        files: allFiles,
        count: allFiles.length,
        modules: Object.entries(modules).map(([key, mod]) => ({ key, label: mod.label, files: mod.files, count: mod.files.length })),
        unindexed,
        unindexedCount: unindexed.length,
        indexVersion: index.version || 1,
      });
    } catch (err: any) {
      ctx.sendJson(res, 500, { ok: false, error: String(err?.message || err) });
    }
    return true;
  }

  // ── Testing: Run tests
  if (method === "POST" && pathname === "/api/testing/run") {
    const body = await ctx.readBody(req);
    const payload = body as { filter?: string; file?: string; rerunFailed?: boolean };
    try {
      const { execSync } = await import("child_process");
      const cwd = process.cwd();
      let cmd = "npx vitest run --reporter=verbose 2>&1";
      if (payload?.file) {
        const safeFile = String(payload.file).replace(/[^a-zA-Z0-9._\-\/]/g, "");
        cmd = `npx vitest run ${safeFile} --reporter=verbose 2>&1`;
      } else if (payload?.filter) {
        const safeFilter = String(payload.filter).replace(/[^a-zA-Z0-9._\-\/\*]/g, "");
        cmd = `npx vitest run --reporter=verbose -t "${safeFilter}" 2>&1`;
      }
      const out = execSync(cmd, { cwd, encoding: "utf-8", timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
      ctx.sendJson(res, 200, { ok: true, output: out });
    } catch (err: any) {
      const output = err?.stdout || err?.stderr || String(err?.message || err);
      ctx.sendJson(res, 200, { ok: true, output, exitCode: err?.status || 1 });
    }
    return true;
  }

  // No matching route found
  return false;
}
