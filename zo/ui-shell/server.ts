import * as fs from "fs";
import * as http from "http";
import * as crypto from "crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { RuntimeError } from "../../runtime/service/errors";
import { getSecretStore } from "../../runtime/support/SecureSecretStore";

// ── Extracted modules ───────────────────────────────────────────────
import type {
  ActivePlan,
  CheckpointRecord,
  HubPayload,
  MfaSessionRecord,
  AuthSessionRecord,
  ProjectRecord,
  SkillRecord,
} from "./types.js";
export type { QoreUiShellOptions } from "./types.js";

import {
  getClientIp,
  isClientAllowed,
  isLockedOut,
  recordFailure,
  clearFailure,
  pruneExpiredSessions,
  listSessions,
  normalizeTotpSecret,
  buildOtpAuthUrl,
  sendBasicAuthChallenge,
  applySecurityHeaders,
  createAuthSession,
  createMfaSession,
  isMfaAuthorized,
  isAuthorized,
  isCookieAuthorized,
  hasValidAdminToken,
} from "./security.js";

import {
  fetchRuntimeSnapshot,
  fetchQoreJson,
  fetchExternalJson,
  readBody,
} from "./runtime.js";

import {
  resolveAssetsDir,
  hasUiAsset,
  serveUiEntry,
  serveStaticPath,
  serveFile,
} from "./assets-serving.js";

import {
  buildHubPayload,
  buildHubPayloadSync,
  getCheckpointSummary,
  seedDefaultCheckpoints,
  appendCheckpoint,
} from "./hub.js";

import {
  serveMfaPage,
  serveLoginPage,
  serveSettingsPage,
  serveUpdatesPage,
  type PageDeps,
} from "./pages.js";

import { handleApiRoute, type RouteContext } from "./routes/index.js";

import {
  encodeBase32,
  parseCookies,
  verifyTotpCode,
} from "./mfa.js";

import * as path from "path";
import { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import { GenesisPipeline } from "../genesis/pipeline.js";
import { RevealService } from "../reveal/service.js";
import { ConstellationService } from "../constellation/service.js";
import { RiskService } from "../risk/service.js";
import { AutonomyChecker } from "../autonomy/checker.js";
import { PathService } from "../path/service.js";

import type { QoreUiShellOptions } from "./types.js";

// ── Server Class ────────────────────────────────────────────────────

export class QoreUiShellServer {
  private server: http.Server | undefined;
  private ws: WebSocketServer | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly assetsDir: string;

  // Auth config
  private readonly requireUiAuth: boolean;
  private readonly requireUiMfa: boolean;
  private readonly requireAdminToken: boolean;
  private uiAuthUser: string;
  private uiAuthPass: string;
  private readonly uiAdminToken: string;
  private uiTotpSecret: string;
  private readonly uiSessionSecret: string;
  private readonly uiSessionTtlMs: number;
  private readonly allowedIps: string[];
  private readonly authMaxFailures: number;
  private readonly authLockoutMs: number;
  private readonly mfaMaxFailures: number;
  private readonly mfaLockoutMs: number;
  private readonly trustProxyHeaders: boolean;
  private readonly allowFrameEmbedding: boolean;
  private readonly frameAncestors: string;

  // Session stores
  private readonly mfaSessions = new Map<string, MfaSessionRecord>();
  private readonly authSessions = new Map<string, AuthSessionRecord>();
  private readonly authFailures = new Map<
    string,
    { count: number; lockUntil: number }
  >();
  private readonly mfaFailures = new Map<
    string,
    { count: number; lockUntil: number }
  >();

  // Data stores
  private readonly skills: SkillRecord[] = [];
  private monitoringEnabled = true;
  private checkpointStore: CheckpointRecord[];
  private projectStore: ProjectRecord[] = [
    { id: "proj-default", name: "Zo-Qore", folderPath: "/home/workspace/MythologIQ/Zo-Qore", active: true },
  ];
  private dbClient: DuckDBClient | null = null;
  private projectStorage: ProjectTabStorage | null = null;
  private genesisPipeline: GenesisPipeline | null = null;
  private revealService: RevealService | null = null;
  private constellationService: ConstellationService | null = null;
  private riskService: RiskService | null = null;
  private autonomyChecker: AutonomyChecker | null = null;
  private pathService: PathService | null = null;

  private readonly activePlan: ActivePlan = {
    id: "zo-standalone-plan",
    title: "FailSafe-Qore Zo Execution",
    currentPhaseId: "phase-implement",
    phases: [
      {
        id: "phase-plan",
        title: "Plan",
        status: "completed",
        progress: 100,
        artifacts: [
          { id: "plan-doc", title: "Architecture Plan", touched: true },
        ],
      },
      {
        id: "phase-audit",
        title: "Audit",
        status: "completed",
        progress: 100,
        artifacts: [
          { id: "audit-doc", title: "Adversarial Review", touched: true },
        ],
      },
      {
        id: "phase-implement",
        title: "Implement",
        status: "active",
        progress: 70,
        artifacts: [{ id: "zo-runtime", title: "Zo Runtime", touched: true }],
      },
      {
        id: "phase-debug",
        title: "Debug",
        status: "pending",
        progress: 0,
        artifacts: [
          { id: "perf-report", title: "Performance Report", touched: false },
        ],
      },
      {
        id: "phase-substantiate",
        title: "Substantiate",
        status: "pending",
        progress: 0,
        artifacts: [
          { id: "release-pack", title: "Release Bundle", touched: false },
        ],
      },
    ],
    blockers: [],
    milestones: [
      {
        id: "m-zo-discovery",
        title: "Zo environment discovery completed",
        completedAt: new Date().toISOString(),
      },
    ],
    risks: [],
    updatedAt: new Date().toISOString(),
  };

  constructor(private readonly options: QoreUiShellOptions) {
    this.assetsDir = resolveAssetsDir(options.assetsDir);

    const secrets = getSecretStore().getAllSecrets();
    this.uiAuthUser = String(secrets.QORE_UI_BASIC_AUTH_USER ?? "");
    this.uiAuthPass = String(secrets.QORE_UI_BASIC_AUTH_PASS ?? "");
    this.uiAdminToken = String(secrets.QORE_UI_ADMIN_TOKEN ?? "").trim();
    this.uiTotpSecret = String(secrets.QORE_UI_TOTP_SECRET ?? "").trim();
    this.uiSessionSecret =
      String(process.env.QORE_UI_SESSION_SECRET ?? "").trim() ||
      crypto.randomBytes(32).toString("hex");
    this.uiSessionTtlMs = Number(
      process.env.QORE_UI_SESSION_TTL_MS ?? "43200000",
    );
    this.allowedIps = String(process.env.QORE_UI_ALLOWED_IPS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    this.authMaxFailures = Number(process.env.QORE_UI_AUTH_MAX_FAILURES ?? "6");
    this.authLockoutMs = Number(
      process.env.QORE_UI_AUTH_LOCKOUT_MS ?? "900000",
    );
    this.mfaMaxFailures = Number(process.env.QORE_UI_MFA_MAX_FAILURES ?? "6");
    this.mfaLockoutMs = Number(process.env.QORE_UI_MFA_LOCKOUT_MS ?? "900000");
    this.trustProxyHeaders =
      String(
        process.env.QORE_UI_TRUST_PROXY_HEADERS ?? "false",
      ).toLowerCase() === "true";
    this.allowFrameEmbedding =
      String(process.env.QORE_UI_ALLOW_FRAME_EMBED ?? "false").toLowerCase() ===
      "true";
    this.frameAncestors =
      String(process.env.QORE_UI_FRAME_ANCESTORS ?? "'self'").trim() ||
      "'self'";
    const defaultRequireAuth = (options.host ?? "127.0.0.1") === "0.0.0.0";
    const defaultRequireAdminToken =
      (options.host ?? "127.0.0.1") === "0.0.0.0";
    this.requireUiAuth =
      String(
        process.env.QORE_UI_REQUIRE_AUTH ??
          (defaultRequireAuth ? "true" : "false"),
      ).toLowerCase() === "true";
    this.requireUiMfa =
      String(process.env.QORE_UI_REQUIRE_MFA ?? "false").toLowerCase() ===
      "true";
    this.requireAdminToken =
      String(
        process.env.QORE_UI_REQUIRE_ADMIN_TOKEN ??
          (defaultRequireAdminToken ? "true" : "false"),
      ).toLowerCase() === "true";
    this.checkpointStore = seedDefaultCheckpoints();
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.server) return;

    // Initialize DuckDB for persistent project storage
    try {
      const dbPath = path.resolve(
        this.options.assetsDir ?? ".",
        "../../data/zoqore.duckdb",
      );
      const walPath = dbPath + ".wal";
      const schemaPath = path.resolve(
        __dirname,
        "../storage/duckdb-schema.sql",
      );

      this.dbClient = new DuckDBClient({ dbPath });
      try {
        await this.dbClient.initialize();
      } catch (walErr) {
        // WAL replay failure — delete corrupt WAL and retry
        const fs = await import("fs");
        if (fs.existsSync(walPath)) {
          console.warn("[QoreUiShell] WAL replay failed, removing corrupt WAL and retrying...");
          fs.unlinkSync(walPath);
          this.dbClient = new DuckDBClient({ dbPath });
          await this.dbClient.initialize();
        } else {
          throw walErr;
        }
      }
      await this.dbClient.runMigrations(schemaPath);
      this.projectStorage = new ProjectTabStorage(this.dbClient);

      // Seed default project if DB is empty
      const existing = await this.projectStorage.listProjects();
      if (existing.length === 0) {
        await this.projectStorage.createProject({
          id: "proj-default",
          name: "Zo-Qore",
          state: "EXECUTING",
          folderPath: "/home/workspace/MythologIQ/Zo-Qore",
          isActive: true,
        });
      }

      // Instantiate pipeline services
      this.genesisPipeline = new GenesisPipeline(this.dbClient, {
        debounceMs: 2000,
        clustering: { minClusterSize: 3 },
      });
      this.genesisPipeline.onEvent((event) => {
        this.broadcast({ type: "genesis", payload: event });
        if (event.type === "clustering_completed") {
          this.broadcast({ type: "hub.refresh" });
        }
      });
      this.revealService = new RevealService(this.dbClient);
      this.constellationService = new ConstellationService(this.dbClient);
      this.riskService = new RiskService(this.dbClient);
      this.autonomyChecker = new AutonomyChecker(this.dbClient);
      this.pathService = new PathService(this.dbClient);
    } catch (err) {
      console.error("[QoreUiShell] DuckDB init failed, using in-memory fallback:", err);
    }

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.sendJson(res, 500, {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    });

    this.ws = new WebSocketServer({ server: this.server });
    this.ws.on("connection", (client, req) => {
      const clientIp = getClientIp(req, this.trustProxyHeaders);
      if (!isClientAllowed(clientIp, this.allowedIps)) {
        client.close(1008, "IP denied");
        return;
      }
      if (!isAuthorized(req.headers.authorization, this.requireUiAuth, this.uiAuthUser, this.uiAuthPass)) {
        client.close(1008, "Unauthorized");
        return;
      }
      if (this.requireUiMfa && !isMfaAuthorized(req.headers.cookie, this.requireUiMfa, this.mfaSessions, this.authSessions)) {
        client.close(1008, "MFA required");
        return;
      }
      this.sendWs(client, {
        type: "init",
        payload: buildHubPayloadSync(
          this.activePlan,
          this.monitoringEnabled,
          this.options.runtimeBaseUrl,
          this.checkpointStore,
          (v) => getCheckpointSummary(this.checkpointStore, v),
        ),
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(
        this.options.port ?? 9380,
        this.options.host ?? "127.0.0.1",
        () => resolve(),
      );
    });

    this.refreshTimer = setInterval(() => {
      this.broadcast({ type: "hub.refresh" });
    }, 15000);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    // Checkpoint and close DuckDB before server shutdown
    if (this.dbClient) {
      try {
        await this.dbClient.close();
      } catch (err) {
        console.error("[QoreUiShell] DuckDB close error:", err);
      }
      this.dbClient = null;
    }

    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
  }

  getAddress(): { host: string; port: number } {
    if (!this.server)
      throw new RuntimeError("NOT_INITIALIZED", "UI server not started");
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new RuntimeError(
        "NOT_INITIALIZED",
        "UI server address unavailable",
      );
    }
    return {
      host: address.address,
      port: address.port,
    };
  }

  // ── Request Dispatcher ──────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    // Page routes (pre-auth)
    const pageDeps = this.buildPageDeps();

    if (method === "GET" && pathname === "/mfa") {
      return serveMfaPage(req, res, pageDeps);
    }
    if (method === "GET" && pathname === "/login") {
      return serveLoginPage(req, res, pageDeps);
    }
    if (method === "GET" && pathname === "/settings") {
      return serveSettingsPage(req, res, pageDeps);
    }
    if (method === "GET" && pathname === "/updates") {
      return serveUpdatesPage(req, res, pageDeps);
    }

    // Auth login / MFA verify (pre-auth)
    if (method === "POST" && pathname === "/api/auth/login") {
      return this.handleAuthLogin(req, res);
    }
    if (method === "POST" && pathname === "/mfa/verify") {
      return this.handleMfaVerify(req, res);
    }

    // Auth enforcement
    if (!this.enforceAuth(req, res, pathname)) {
      return;
    }

    // Health endpoint
    if (method === "GET" && pathname === "/health") {
      const runtime = await fetchRuntimeSnapshot(
        this.options.runtimeBaseUrl,
        this.options.runtimeApiKey,
        this.options.requestTimeoutMs ?? 5000,
      );
      return this.sendJson(res, 200, {
        ready: hasUiAsset(this.assetsDir, "index.html"),
        assetsDir: this.assetsDir,
        runtime,
      });
    }

    // Hub endpoint
    if (method === "GET" && pathname === "/api/hub") {
      const runtime = await fetchRuntimeSnapshot(
        this.options.runtimeBaseUrl,
        this.options.runtimeApiKey,
        this.options.requestTimeoutMs ?? 5000,
      );
      const payload = buildHubPayload(
        runtime,
        this.activePlan,
        this.monitoringEnabled,
        this.checkpointStore,
        (v) => getCheckpointSummary(this.checkpointStore, v),
      );
      return this.sendJson(res, 200, payload);
    }

    // Roadmap/plans/sprint/skills/checkpoints (inline - small)
    if (method === "GET" && pathname === "/api/roadmap") {
      return this.sendJson(res, 200, {
        activePlan: this.activePlan,
        currentSprint: { id: "zo-standalone", name: "Zo Standalone Runtime", status: "active" },
        sprints: [{ id: "zo-standalone", name: "Zo Standalone Runtime", status: "active" }],
      });
    }
    if (method === "GET" && pathname === "/api/plans") {
      return this.sendJson(res, 200, {
        plans: [this.activePlan],
        activePlanId: this.activePlan.id,
      });
    }
    if (method === "GET" && pathname.startsWith("/api/sprint/")) {
      const sprintId = pathname.substring("/api/sprint/".length) || "zo-standalone";
      return this.sendJson(res, 200, {
        sprint: { id: sprintId, name: "Zo Standalone Runtime", status: "active", planId: this.activePlan.id },
      });
    }
    if (method === "GET" && pathname === "/api/skills") {
      return this.sendJson(res, 200, { skills: this.skills });
    }
    if (method === "POST" && pathname === "/api/skills/ingest/auto") {
      this.broadcast({ type: "event", payload: { skillEvent: "auto_ingest" } });
      return this.sendJson(res, 200, { ingested: 0, skills: this.skills });
    }
    if (method === "POST" && pathname === "/api/skills/ingest/manual") {
      const body = (await readBody(req)) as { items?: unknown[] };
      const count = Array.isArray(body?.items) ? body.items.length : 0;
      this.broadcast({ type: "event", payload: { skillEvent: "manual_ingest", count } });
      return this.sendJson(res, 200, { ingested: 0, skills: this.skills });
    }
    if (method === "GET" && pathname === "/api/skills/relevance") {
      const phase = String(url.searchParams.get("phase") ?? "plan");
      return this.sendJson(res, 200, { phase, recommended: [], allRelevant: [], otherAvailable: [] });
    }
    if (method === "GET" && pathname === "/api/checkpoints") {
      return this.sendJson(res, 200, { chainValid: true, checkpoints: this.checkpointStore });
    }

    // Delegate to route modules
    const routeCtx = this.buildRouteContext();
    const handled = await handleApiRoute(req, res, method, pathname, url, routeCtx);
    if (handled) return;

    // Direct view routes
    const viewRoutes = ["/void", "/reveal", "/constellation", "/path", "/risk", "/autonomy"];
    if (method === "GET" && viewRoutes.includes(pathname)) {
      return serveUiEntry(
        res,
        this.assetsDir,
        (r, s, b) => this.sendJson(r, s, b),
        (r, dir, f) => serveFile(r, dir, f, (r2) => this.applyHeaders(r2), (r2, s, b) => this.sendJson(r2, s, b)),
      );
    }

    // UI entry points
    if (method === "GET" && pathname === "/") {
      return serveUiEntry(
        res,
        this.assetsDir,
        (r, s, b) => this.sendJson(r, s, b),
        (r, dir, f) => serveFile(r, dir, f, (r2) => this.applyHeaders(r2), (r2, s, b) => this.sendJson(r2, s, b)),
      );
    }
    if (method === "GET" && (pathname === "/ui/monitor" || pathname === "/ui/monitor/")) {
      return serveUiEntry(
        res,
        this.assetsDir,
        (r, s, b) => this.sendJson(r, s, b),
        (r, dir, f) => serveFile(r, dir, f, (r2) => this.applyHeaders(r2), (r2, s, b) => this.sendJson(r2, s, b)),
      );
    }
    if (method === "GET" && (pathname === "/ui/console" || pathname === "/ui/console/")) {
      return serveUiEntry(
        res,
        this.assetsDir,
        (r, s, b) => this.sendJson(r, s, b),
        (r, dir, f) => serveFile(r, dir, f, (r2) => this.applyHeaders(r2), (r2, s, b) => this.sendJson(r2, s, b)),
      );
    }

    // 404 for non-GET
    if (method !== "GET") {
      this.sendJson(res, 404, {
        error: "NOT_FOUND",
        message: "Route not found",
        path: pathname,
      });
      return;
    }

    // Static file fallback
    serveStaticPath(
      res,
      pathname,
      this.assetsDir,
      (r) => this.applyHeaders(r),
      (r, s, b) => this.sendJson(r, s, b),
    );
  }

  // ── Auth Handlers ──────────────────────────────────────────────

  private async handleAuthLogin(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const clientIp = getClientIp(req, this.trustProxyHeaders);
    if (!isClientAllowed(clientIp, this.allowedIps)) {
      this.sendJson(res, 403, { error: "IP_DENIED", message: "Access denied" });
      return;
    }

    if (isLockedOut(this.authFailures, clientIp)) {
      this.sendJson(res, 429, { error: "AUTH_LOCKED", message: "Too many failures" });
      return;
    }

    const body = (await readBody(req)) as { username?: string; password?: string };
    const user = String(body?.username ?? "").trim();
    const pass = String(body?.password ?? "");

    if (user !== this.uiAuthUser || pass !== this.uiAuthPass) {
      recordFailure(this.authFailures, clientIp, this.authLockoutMs, this.authMaxFailures);
      this.sendJson(res, 401, { error: "INVALID_CREDENTIALS", message: "Invalid credentials" });
      return;
    }

    clearFailure(this.authFailures, clientIp);
    const token = createAuthSession(req, clientIp, this.uiSessionSecret, this.uiSessionTtlMs, this.authSessions);
    const secure = this.requireUiAuth ? "; Secure" : "";
    res.setHeader(
      "set-cookie",
      `qore_ui_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.uiSessionTtlMs / 1000)}${secure}`,
    );
    this.sendJson(res, 200, { ok: true });
  }

  private async handleMfaVerify(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const clientIp = getClientIp(req, this.trustProxyHeaders);
    if (!isClientAllowed(clientIp, this.allowedIps)) {
      this.sendJson(res, 403, { error: "IP_DENIED", message: `Client IP not allowed: ${clientIp}` });
      return;
    }
    if (!this.requireUiMfa) {
      this.sendJson(res, 200, { ok: true, mfa: "disabled" });
      return;
    }
    if (!isAuthorized(req.headers.authorization, this.requireUiAuth, this.uiAuthUser, this.uiAuthPass)) {
      sendBasicAuthChallenge(res, (r) => this.applyHeaders(r));
      return;
    }
    if (!this.uiTotpSecret) {
      this.sendJson(res, 503, { error: "MFA_MISCONFIGURED", message: "QORE_UI_TOTP_SECRET is not set." });
      return;
    }

    if (isLockedOut(this.mfaFailures, clientIp)) {
      this.sendJson(res, 429, { error: "MFA_LOCKED", message: "Too many MFA failures. Try again later." });
      return;
    }

    const body = (await readBody(req)) as { code?: string };
    const code = String(body?.code ?? "").trim();
    if (
      !verifyTotpCode(this.uiTotpSecret, code, {
        digits: 6,
        periodSeconds: 30,
        window: 1,
      })
    ) {
      recordFailure(this.mfaFailures, clientIp, this.mfaLockoutMs, this.mfaMaxFailures);
      this.sendJson(res, 401, { error: "INVALID_MFA_CODE", message: "Invalid MFA code." });
      return;
    }
    clearFailure(this.mfaFailures, clientIp);

    const token = createMfaSession(req, clientIp, this.uiSessionSecret, this.uiSessionTtlMs, this.mfaSessions);
    const secure = this.requireUiAuth ? "; Secure" : "";
    res.setHeader(
      "set-cookie",
      `qore_ui_mfa=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.uiSessionTtlMs / 1000)}${secure}`,
    );
    this.sendJson(res, 200, { ok: true });
  }

  // ── Auth Enforcement ──────────────────────────────────────────

  private enforceAuth(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
  ): boolean {
    const clientIp = getClientIp(req, this.trustProxyHeaders);
    if (!isClientAllowed(clientIp, this.allowedIps)) {
      this.sendJson(res, 403, { error: "IP_DENIED", message: `Client IP not allowed: ${clientIp}` });
      return false;
    }

    if (pathname.startsWith("/api/admin/")) {
      if (hasValidAdminToken(req, this.uiAdminToken)) {
        return true;
      }
      if (this.requireAdminToken) {
        this.sendJson(res, 401, { error: "ADMIN_TOKEN_REQUIRED", message: "Valid x-qore-admin-token is required." });
        return false;
      }
    }

    if (!this.requireUiAuth) {
      return true;
    }

    if (!this.uiAuthUser || !this.uiAuthPass) {
      this.sendJson(res, 503, {
        error: "UI_AUTH_MISCONFIGURED",
        message: "UI auth is required but QORE_UI_BASIC_AUTH_USER/QORE_UI_BASIC_AUTH_PASS are not set.",
      });
      return false;
    }

    if (isLockedOut(this.authFailures, clientIp)) {
      this.sendJson(res, 429, { error: "AUTH_LOCKED", message: "Too many authentication failures. Try again later." });
      return false;
    }

    if (
      !isAuthorized(req.headers.authorization, this.requireUiAuth, this.uiAuthUser, this.uiAuthPass) &&
      !isCookieAuthorized(req.headers.cookie, this.requireUiAuth, this.authSessions, this.mfaSessions)
    ) {
      if (req.headers.authorization) {
        recordFailure(this.authFailures, clientIp, this.authLockoutMs, this.authMaxFailures);
      }

      if (pathname.startsWith("/api/")) {
        this.sendJson(res, 401, { error: "UNAUTHORIZED", message: "Authentication required." });
        return false;
      }

      if (req.headers.accept?.includes("text/html")) {
        res.statusCode = 302;
        res.setHeader("location", `/login?next=${encodeURIComponent(pathname)}`);
        res.end();
        return false;
      }

      sendBasicAuthChallenge(res, (r) => this.applyHeaders(r));
      return false;
    }
    clearFailure(this.authFailures, clientIp);

    if (!this.requireUiMfa) {
      return true;
    }

    if (!this.uiTotpSecret) {
      this.sendJson(res, 503, { error: "MFA_MISCONFIGURED", message: "MFA is required but QORE_UI_TOTP_SECRET is not set." });
      return false;
    }

    if (pathname === "/mfa" || pathname === "/mfa/verify") {
      return true;
    }

    if (isMfaAuthorized(req.headers.cookie, this.requireUiMfa, this.mfaSessions, this.authSessions)) {
      return true;
    }

    if (pathname.startsWith("/api/")) {
      this.sendJson(res, 401, { error: "MFA_REQUIRED", message: "Complete MFA at /mfa first." });
      return false;
    }

    res.statusCode = 302;
    res.setHeader("location", "/mfa");
    res.end();
    return false;
  }

  // ── Utility Methods ──────────────────────────────────────────

  private applyHeaders(res: http.ServerResponse): void {
    applySecurityHeaders(res, this.allowFrameEmbedding, this.frameAncestors);
  }

  private sendWs(client: WebSocket, payload: unknown): void {
    if (client.readyState !== client.OPEN) return;
    client.send(JSON.stringify(payload));
  }

  private broadcast(payload: unknown): void {
    if (!this.ws) return;
    for (const client of this.ws.clients) {
      this.sendWs(client as WebSocket, payload);
    }
  }

  private sendJson(
    res: http.ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    res.statusCode = statusCode;
    this.applyHeaders(res);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  }

  // ── Context Builders ──────────────────────────────────────────

  private buildPageDeps(): PageDeps {
    return {
      sendJson: (r, s, b) => this.sendJson(r, s, b),
      applyHeaders: (r) => this.applyHeaders(r),
      isAuthorized: (auth) => isAuthorized(auth, this.requireUiAuth, this.uiAuthUser, this.uiAuthPass),
      isCookieAuthorized: (cookie) => isCookieAuthorized(cookie, this.requireUiAuth, this.authSessions, this.mfaSessions),
      isMfaAuthorized: (cookie) => isMfaAuthorized(cookie, this.requireUiMfa, this.mfaSessions, this.authSessions),
      hasUiAsset: (name) => hasUiAsset(this.assetsDir, name),
      serveFile: (r, fileName) => serveFile(r, this.assetsDir, fileName, (r2) => this.applyHeaders(r2), (r2, s, b) => this.sendJson(r2, s, b)),
      sendBasicAuthChallenge: (r) => sendBasicAuthChallenge(r, (r2) => this.applyHeaders(r2)),
      requireUiMfa: this.requireUiMfa,
    };
  }

  private buildRouteContext(): RouteContext {
    return {
      sendJson: (r, s, b) => this.sendJson(r, s, b),
      readBody,
      broadcast: (p) => this.broadcast(p),
      projectStore: this.projectStore,
      projectStorage: this.projectStorage,
      genesisPipeline: this.genesisPipeline,
      revealService: this.revealService,
      constellationService: this.constellationService,
      riskService: this.riskService,
      autonomyChecker: this.autonomyChecker,
      pathService: this.pathService,
      skills: this.skills,
      checkpointStore: this.checkpointStore,
      monitoringEnabled: this.monitoringEnabled,
      appendCheckpoint: (type, phase, verdict) => {
        this.checkpointStore = appendCheckpoint(this.checkpointStore, type, phase, verdict);
      },
      activePlan: this.activePlan,
      mfaSessions: this.mfaSessions,
      authSessions: this.authSessions,
      listSessions: () => listSessions(this.mfaSessions, this.authSessions),
      requireUiAuth: this.requireUiAuth,
      requireUiMfa: this.requireUiMfa,
      requireAdminToken: this.requireAdminToken,
      uiAdminToken: this.uiAdminToken,
      uiAuthUser: this.uiAuthUser,
      uiAuthPass: this.uiAuthPass,
      uiTotpSecret: this.uiTotpSecret,
      uiSessionSecret: this.uiSessionSecret,
      uiSessionTtlMs: this.uiSessionTtlMs,
      allowedIps: this.allowedIps,
      trustProxyHeaders: this.trustProxyHeaders,
      authMaxFailures: this.authMaxFailures,
      authLockoutMs: this.authLockoutMs,
      mfaMaxFailures: this.mfaMaxFailures,
      mfaLockoutMs: this.mfaLockoutMs,
      runtimeBaseUrl: this.options.runtimeBaseUrl,
      runtimeApiKey: this.options.runtimeApiKey,
      requestTimeoutMs: this.options.requestTimeoutMs ?? 5000,
      zoApiBaseUrl: this.options.zoApiBaseUrl,
      fetchRuntimeSnapshot: () => fetchRuntimeSnapshot(
        this.options.runtimeBaseUrl,
        this.options.runtimeApiKey,
        this.options.requestTimeoutMs ?? 5000,
      ),
      fetchQoreJson: (endpoint, method?, body?) => fetchQoreJson(
        this.options.runtimeBaseUrl,
        this.options.runtimeApiKey,
        this.options.requestTimeoutMs ?? 5000,
        endpoint,
        (method ?? "GET") as "GET" | "POST",
        body,
      ),
      fetchExternalJson: (baseUrl, endpoint, method?, body?, extraHeaders?) => fetchExternalJson(
        baseUrl,
        endpoint,
        this.options.requestTimeoutMs ?? 30000,
        (method ?? "GET") as "GET" | "POST",
        body,
        extraHeaders,
      ),
      normalizeTotpSecret,
      buildOtpAuthUrl,
      parseCookies,
      encodeBase32,
      verifyTotpCode,
      assetsDir: this.assetsDir,
      hasUiAsset: (name) => hasUiAsset(this.assetsDir, name),
    };
  }
}
