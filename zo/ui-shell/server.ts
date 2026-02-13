import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as crypto from "crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { RuntimeError } from "../../runtime/service/errors";
import { encodeBase32, generateSessionToken, parseCookies, verifyTotpCode } from "./mfa";

type JsonResult = { ok: true; status: number; body: unknown; latencyMs: number } | { ok: false; error: string; detail?: string };

type RuntimeSnapshot = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  policyVersion?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
};

type PlanArtifact = { id: string; title: string; touched: boolean };

type PlanPhase = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed";
  progress?: number;
  artifacts: PlanArtifact[];
};

type Blocker = {
  id: string;
  title: string;
  reason: string;
  severity: "soft" | "hard";
  resolvedAt?: string;
};

type Risk = { id: string; title: string; level: "info" | "watch" | "danger" };

type Milestone = { id: string; title: string; completedAt?: string; targetDate?: string };

type ActivePlan = {
  id: string;
  title: string;
  currentPhaseId: string;
  phases: PlanPhase[];
  blockers: Blocker[];
  milestones: Milestone[];
  risks: Risk[];
  updatedAt: string;
};

type Verdict = {
  decision: "PASS" | "WARN" | "BLOCK" | "ESCALATE" | "QUARANTINE";
  summary: string;
  timestamp: string;
  reason?: string;
  filePath?: string;
};

type SkillRecord = {
  id: string;
  displayName: string;
  localName: string;
  key: string;
  label: string;
  desc: string;
  creator: string;
  sourceRepo: string;
  sourcePath: string;
  versionPin: string;
  trustTier: string;
  sourceType: string;
  sourcePriority: number;
  admissionState: string;
  requiredPermissions: string[];
};

type CheckpointRecord = {
  checkpointId: string;
  runId: string;
  checkpointType: string;
  phase: string;
  policyVerdict: string;
  timestamp: string;
};

type MfaSessionRecord = {
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
  userAgent: string;
  deviceId: string;
  lastSeenAt: number;
};

type HubPayload = {
  generatedAt: string;
  activePlan: ActivePlan;
  currentSprint: { id: string; name: string; status: string };
  sprints: Array<{ id: string; name: string; status: string }>;
  sentinelStatus: {
    running: boolean;
    queueDepth: number;
    lastVerdict: { decision: "PASS" | "WARN" | "BLOCK" | "ESCALATE" | "QUARANTINE"; summary: string };
  };
  l3Queue: Array<{ id: string; actor: string; filePath: string; riskGrade: string; requestedAt: string }>;
  recentVerdicts: Verdict[];
  trustSummary: {
    totalAgents: number;
    avgTrust: number;
    quarantined: number;
    stageCounts: { CBT: number; KBT: number; IBT: number };
  };
  nodeStatus: Array<{ id: string; label: string; state: "nominal" | "degraded" | "offline" }>;
  checkpointSummary: {
    total: number;
    chainValid: boolean;
    latestType: string;
    latestVerdict: string;
    latestAt: string;
  };
  recentCheckpoints: CheckpointRecord[];
  qoreRuntime: RuntimeSnapshot;
  monitor: {
    state: "connected" | "degraded" | "offline";
    statusLine: string;
    recommendation: string;
  };
};

export interface QoreUiShellOptions {
  host?: string;
  port?: number;
  runtimeBaseUrl: string;
  runtimeApiKey?: string;
  requestTimeoutMs?: number;
  assetsDir?: string;
}

export class QoreUiShellServer {
  private server: http.Server | undefined;
  private ws: WebSocketServer | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly assetsDir: string;
  private readonly requireUiAuth: boolean;
  private readonly requireUiMfa: boolean;
  private readonly requireAdminToken: boolean;
  private readonly uiAuthUser: string;
  private readonly uiAuthPass: string;
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
  private readonly mfaSessions = new Map<string, MfaSessionRecord>();
  private readonly authFailures = new Map<string, { count: number; lockUntil: number }>();
  private readonly mfaFailures = new Map<string, { count: number; lockUntil: number }>();
  private readonly skills: SkillRecord[] = [];
  private monitoringEnabled = true;
  private checkpointStore: CheckpointRecord[] = [];

  private readonly activePlan: ActivePlan = {
    id: "zo-standalone-plan",
    title: "FailSafe-Qore Zo Execution",
    currentPhaseId: "phase-implement",
    phases: [
      { id: "phase-plan", title: "Plan", status: "completed", progress: 100, artifacts: [{ id: "plan-doc", title: "Architecture Plan", touched: true }] },
      { id: "phase-audit", title: "Audit", status: "completed", progress: 100, artifacts: [{ id: "audit-doc", title: "Adversarial Review", touched: true }] },
      { id: "phase-implement", title: "Implement", status: "active", progress: 70, artifacts: [{ id: "zo-runtime", title: "Zo Runtime", touched: true }] },
      { id: "phase-debug", title: "Debug", status: "pending", progress: 0, artifacts: [{ id: "perf-report", title: "Performance Report", touched: false }] },
      { id: "phase-substantiate", title: "Substantiate", status: "pending", progress: 0, artifacts: [{ id: "release-pack", title: "Release Bundle", touched: false }] },
    ],
    blockers: [],
    milestones: [{ id: "m-zo-discovery", title: "Zo environment discovery completed", completedAt: new Date().toISOString() }],
    risks: [],
    updatedAt: new Date().toISOString(),
  };

  constructor(private readonly options: QoreUiShellOptions) {
    this.assetsDir = this.resolveAssetsDir(options.assetsDir);
    this.uiAuthUser = String(process.env.QORE_UI_BASIC_AUTH_USER ?? "");
    this.uiAuthPass = String(process.env.QORE_UI_BASIC_AUTH_PASS ?? "");
    this.uiAdminToken = String(process.env.QORE_UI_ADMIN_TOKEN ?? "").trim();
    this.uiTotpSecret = String(process.env.QORE_UI_TOTP_SECRET ?? "").trim();
    this.uiSessionSecret = String(process.env.QORE_UI_SESSION_SECRET ?? "").trim() || crypto.randomBytes(32).toString("hex");
    this.uiSessionTtlMs = Number(process.env.QORE_UI_SESSION_TTL_MS ?? "43200000");
    this.allowedIps = String(process.env.QORE_UI_ALLOWED_IPS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    this.authMaxFailures = Number(process.env.QORE_UI_AUTH_MAX_FAILURES ?? "6");
    this.authLockoutMs = Number(process.env.QORE_UI_AUTH_LOCKOUT_MS ?? "900000");
    this.mfaMaxFailures = Number(process.env.QORE_UI_MFA_MAX_FAILURES ?? "6");
    this.mfaLockoutMs = Number(process.env.QORE_UI_MFA_LOCKOUT_MS ?? "900000");
    this.trustProxyHeaders = String(process.env.QORE_UI_TRUST_PROXY_HEADERS ?? "false").toLowerCase() === "true";
    this.allowFrameEmbedding = String(process.env.QORE_UI_ALLOW_FRAME_EMBED ?? "false").toLowerCase() === "true";
    this.frameAncestors = String(process.env.QORE_UI_FRAME_ANCESTORS ?? "'self'").trim() || "'self'";
    const defaultRequireAuth = (options.host ?? "127.0.0.1") === "0.0.0.0";
    const defaultRequireAdminToken = (options.host ?? "127.0.0.1") === "0.0.0.0";
    this.requireUiAuth = String(process.env.QORE_UI_REQUIRE_AUTH ?? (defaultRequireAuth ? "true" : "false")).toLowerCase() === "true";
    this.requireUiMfa = String(process.env.QORE_UI_REQUIRE_MFA ?? (defaultRequireAuth ? "true" : "false")).toLowerCase() === "true";
    this.requireAdminToken = String(process.env.QORE_UI_REQUIRE_ADMIN_TOKEN ?? (defaultRequireAdminToken ? "true" : "false")).toLowerCase() === "true";
    this.seedDefaultCheckpoints();
  }

  async start(): Promise<void> {
    if (this.server) return;

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
      const clientIp = this.getClientIp(req);
      if (!this.isClientAllowed(clientIp)) {
        client.close(1008, "IP denied");
        return;
      }
      if (!this.isAuthorized(req.headers.authorization)) {
        client.close(1008, "Unauthorized");
        return;
      }
      if (this.requireUiMfa && !this.isMfaAuthorized(req.headers.cookie)) {
        client.close(1008, "MFA required");
        return;
      }
      this.sendWs(client, {
        type: "init",
        payload: this.buildHubPayloadSync(),
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.options.port ?? 9380, this.options.host ?? "127.0.0.1", () => resolve());
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

    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
  }

  getAddress(): { host: string; port: number } {
    if (!this.server) throw new RuntimeError("NOT_INITIALIZED", "UI server not started");
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new RuntimeError("NOT_INITIALIZED", "UI server address unavailable");
    }
    return {
      host: address.address,
      port: address.port,
    };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/mfa") {
      return this.serveMfaPage(req, res);
    }

    if (method === "POST" && pathname === "/mfa/verify") {
      return this.handleMfaVerify(req, res);
    }

    if (!this.enforceAuth(req, res, pathname)) {
      return;
    }

    if (method === "GET" && pathname === "/health") {
      const runtime = await this.fetchRuntimeSnapshot();
      return this.sendJson(res, 200, {
        ready: this.hasUiAsset("index.html") || this.hasUiAsset("legacy-index.html"),
        assetsDir: this.assetsDir,
        runtime,
      });
    }

    if (method === "GET" && pathname === "/api/hub") {
      const payload = await this.buildHubPayload();
      return this.sendJson(res, 200, payload);
    }

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
        sprint: {
          id: sprintId,
          name: "Zo Standalone Runtime",
          status: "active",
          planId: this.activePlan.id,
        },
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
      const body = (await this.readBody(req)) as { items?: unknown[] };
      const count = Array.isArray(body?.items) ? body.items.length : 0;
      this.broadcast({ type: "event", payload: { skillEvent: "manual_ingest", count } });
      return this.sendJson(res, 200, { ingested: 0, skills: this.skills });
    }

    if (method === "GET" && pathname === "/api/skills/relevance") {
      const phase = String(url.searchParams.get("phase") ?? "plan");
      return this.sendJson(res, 200, {
        phase,
        recommended: [],
        allRelevant: [],
        otherAvailable: [],
      });
    }

    if (method === "GET" && pathname === "/api/checkpoints") {
      return this.sendJson(res, 200, {
        chainValid: true,
        checkpoints: this.checkpointStore,
      });
    }

    if (method === "GET" && pathname === "/api/admin/security") {
      const now = Date.now();
      return this.sendJson(res, 200, {
        auth: {
          requireAuth: this.requireUiAuth,
          requireMfa: this.requireUiMfa,
          requireAdminToken: this.requireAdminToken,
          adminTokenConfigured: Boolean(this.uiAdminToken),
          allowedIps: this.allowedIps,
          trustProxyHeaders: this.trustProxyHeaders,
          authMaxFailures: this.authMaxFailures,
          authLockoutMs: this.authLockoutMs,
          mfaMaxFailures: this.mfaMaxFailures,
          mfaLockoutMs: this.mfaLockoutMs,
        },
        sessions: {
          activeMfaSessions: [...this.mfaSessions.values()].filter((session) => session.expiresAt > now).length,
        },
      });
    }

    if (method === "GET" && pathname === "/api/admin/sessions") {
      return this.sendJson(res, 200, {
        sessions: this.listSessions(),
      });
    }

    if (method === "GET" && pathname === "/api/admin/devices") {
      const devices = new Map<string, { deviceId: string; sessions: number; latestSeenAt: string; ips: string[]; userAgent: string }>();
      for (const session of this.listSessions()) {
        const existing = devices.get(session.deviceId) ?? {
          deviceId: session.deviceId,
          sessions: 0,
          latestSeenAt: session.lastSeenAt,
          ips: [],
          userAgent: session.userAgent,
        };
        existing.sessions += 1;
        existing.latestSeenAt = existing.latestSeenAt > session.lastSeenAt ? existing.latestSeenAt : session.lastSeenAt;
        if (!existing.ips.includes(session.clientIp)) {
          existing.ips.push(session.clientIp);
        }
        devices.set(session.deviceId, existing);
      }
      return this.sendJson(res, 200, {
        devices: [...devices.values()].sort((a, b) => (a.latestSeenAt < b.latestSeenAt ? 1 : -1)),
      });
    }

    if (method === "POST" && pathname === "/api/admin/sessions/revoke") {
      const body = (await this.readBody(req)) as { all?: boolean; sessionId?: string; deviceId?: string };
      let revoked = 0;
      if (body?.all === true) {
        revoked = this.mfaSessions.size;
        this.mfaSessions.clear();
      } else if (body?.sessionId) {
        const before = this.mfaSessions.size;
        for (const [token, session] of this.mfaSessions.entries()) {
          if (session.tokenId === body.sessionId) {
            this.mfaSessions.delete(token);
          }
        }
        revoked = before - this.mfaSessions.size;
      } else if (body?.deviceId) {
        const before = this.mfaSessions.size;
        for (const [token, session] of this.mfaSessions.entries()) {
          if (session.deviceId === body.deviceId) {
            this.mfaSessions.delete(token);
          }
        }
        revoked = before - this.mfaSessions.size;
      } else {
        const token = parseCookies(req.headers.cookie).qore_ui_mfa;
        if (token && this.mfaSessions.has(token)) {
          this.mfaSessions.delete(token);
          revoked = 1;
        }
      }
      res.setHeader("set-cookie", "qore_ui_mfa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      return this.sendJson(res, 200, {
        ok: true,
        revoked,
        mode: body?.all === true ? "all" : body?.sessionId ? "session" : body?.deviceId ? "device" : "current",
      });
    }

    if (method === "POST" && pathname === "/api/admin/mfa/recovery/reset") {
      const body = (await this.readBody(req)) as { confirm?: string; secret?: string; account?: string; issuer?: string };
      if (String(body?.confirm ?? "") !== "RESET_MFA") {
        return this.sendJson(res, 400, { error: "CONFIRMATION_REQUIRED", message: "Set confirm=RESET_MFA to rotate MFA secret." });
      }
      const nextSecret = this.normalizeTotpSecret(body?.secret) ?? encodeBase32(crypto.randomBytes(20));
      this.uiTotpSecret = nextSecret;
      const account = String(body?.account ?? process.env.QORE_MFA_ACCOUNT ?? "failsafe-admin");
      const issuer = String(body?.issuer ?? process.env.QORE_MFA_ISSUER ?? "FailSafe-Qore");
      const otpAuthUrl = this.buildOtpAuthUrl(nextSecret, account, issuer);
      const revokedSessions = this.mfaSessions.size;
      this.mfaSessions.clear();
      return this.sendJson(res, 200, {
        ok: true,
        secret: nextSecret,
        otpAuthUrl,
        revokedSessions,
      });
    }

    if (method === "POST" && pathname === "/api/actions/resume-monitoring") {
      this.monitoringEnabled = true;
      this.appendCheckpoint("monitoring.resumed", "phase-implement", "PASS");
      this.broadcast({ type: "hub.refresh" });
      return this.sendJson(res, 200, { ok: true, monitoring: "running" });
    }

    if (method === "POST" && pathname === "/api/actions/panic-stop") {
      this.monitoringEnabled = false;
      this.appendCheckpoint("monitoring.stopped", "phase-implement", "WARN");
      this.broadcast({ type: "hub.refresh" });
      return this.sendJson(res, 200, { ok: true, monitoring: "stopped" });
    }

    if (method === "GET" && pathname === "/api/qore/runtime") {
      const runtime = await this.fetchRuntimeSnapshot();
      return this.sendJson(res, 200, runtime);
    }

    if (method === "GET" && pathname === "/api/qore/health") {
      const runtimeHealth = await this.fetchQoreJson("/health");
      if (!runtimeHealth.ok) {
        return this.sendJson(res, 502, runtimeHealth);
      }
      return this.sendJson(res, 200, runtimeHealth.body);
    }

    if (method === "GET" && pathname === "/api/qore/policy-version") {
      const policy = await this.fetchQoreJson("/policy/version");
      if (!policy.ok) {
        return this.sendJson(res, 502, policy);
      }
      return this.sendJson(res, 200, policy.body);
    }

    if (method === "POST" && pathname === "/api/qore/evaluate") {
      const body = await this.readBody(req);
      const evaluate = await this.fetchQoreJson("/evaluate", "POST", body);
      if (!evaluate.ok) {
        return this.sendJson(res, 502, evaluate);
      }
      return this.sendJson(res, 200, evaluate.body);
    }

    if (method === "GET" && pathname === "/") {
      return this.serveUiEntry(res, url.searchParams.get("ui"));
    }

    if (method === "GET" && (pathname === "/ui/monitor" || pathname === "/ui/monitor/")) {
      return this.serveUiEntry(res, "compact");
    }

    if (method === "GET" && (pathname === "/ui/console" || pathname === "/ui/console/")) {
      return this.serveUiEntry(res, "full");
    }

    if (method === "GET" && pathname === "/api/ui/routes") {
      return this.sendJson(res, 200, {
        default: "/",
        monitor: "/ui/monitor",
        console: "/ui/console",
      });
    }

    if (method !== "GET") {
      this.sendJson(res, 404, {
        error: "NOT_FOUND",
        message: "Route not found",
        path: pathname,
      });
      return;
    }

    this.serveStaticPath(res, pathname);
  }

  private resolveAssetsDir(override?: string): string {
    const candidates = [
      override ? path.resolve(override) : "",
      process.env.QORE_UI_ASSETS_DIR ? path.resolve(process.env.QORE_UI_ASSETS_DIR) : "",
      path.resolve(process.cwd(), "zo", "ui-shell", "shared"),
      path.resolve(process.cwd(), "zo", "ui-shell", "assets"),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, "legacy-index.html")) || fs.existsSync(path.join(candidate, "index.html"))) {
        return candidate;
      }
    }
    return path.resolve(process.cwd(), "zo", "ui-shell", "assets");
  }

  private hasUiAsset(fileName: string): boolean {
    return fs.existsSync(path.join(this.assetsDir, fileName));
  }

  private serveUiEntry(res: http.ServerResponse, requestedMode: string | null): void {
    const useCompact = requestedMode === "compact";
    const primary = useCompact ? "index.html" : "legacy-index.html";
    const fallback = useCompact ? "legacy-index.html" : "index.html";

    if (this.hasUiAsset(primary)) {
      this.serveFile(res, primary);
      return;
    }
    if (this.hasUiAsset(fallback)) {
      this.serveFile(res, fallback);
      return;
    }

    this.sendJson(res, 503, {
      error: "ASSET_MISSING",
      message: "No UI entrypoint found in assets directory",
      assetsDir: this.assetsDir,
    });
  }

  private serveStaticPath(res: http.ServerResponse, pathname: string): void {
    const rel = pathname.replace(/^\/+/, "");
    const fullPath = path.resolve(this.assetsDir, rel);

    if (!fullPath.startsWith(this.assetsDir)) {
      this.sendJson(res, 400, { error: "INVALID_PATH", message: "Invalid asset path" });
      return;
    }

    let candidate = fullPath;
    if (!fs.existsSync(candidate) && rel === "index.html" && this.hasUiAsset("legacy-index.html")) {
      candidate = path.resolve(this.assetsDir, "legacy-index.html");
    }

    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      this.sendJson(res, 404, {
        error: "NOT_FOUND",
        message: "Asset not found",
        path: pathname,
      });
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", this.contentTypeFor(path.extname(candidate).toLowerCase()));
    res.end(fs.readFileSync(candidate));
  }

  private contentTypeFor(ext: string): string {
    const map: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ico": "image/x-icon",
    };
    return map[ext] ?? "application/octet-stream";
  }

  private async buildHubPayload(): Promise<HubPayload> {
    const runtime = await this.fetchRuntimeSnapshot();
    const verdict = runtime.connected
      ? { decision: "PASS" as const, summary: "Runtime reachable and policy endpoint healthy." }
      : { decision: "WARN" as const, summary: "Runtime unreachable. Verify process and API key." };

    const recentVerdicts: Verdict[] = [
      {
        decision: verdict.decision,
        summary: verdict.summary,
        timestamp: new Date().toISOString(),
      },
    ];

    const monitorState: HubPayload["monitor"]["state"] = runtime.connected ? "connected" : "degraded";

    return {
      generatedAt: new Date().toISOString(),
      activePlan: {
        ...this.activePlan,
        updatedAt: new Date().toISOString(),
      },
      currentSprint: { id: "zo-standalone", name: "Zo Standalone Runtime", status: "active" },
      sprints: [{ id: "zo-standalone", name: "Zo Standalone Runtime", status: "active" }],
      sentinelStatus: {
        running: this.monitoringEnabled,
        queueDepth: 0,
        lastVerdict: verdict,
      },
      l3Queue: [],
      recentVerdicts,
      trustSummary: {
        totalAgents: 1,
        avgTrust: runtime.connected ? 0.92 : 0.4,
        quarantined: runtime.connected ? 0 : 1,
        stageCounts: { CBT: 1, KBT: 0, IBT: 0 },
      },
      nodeStatus: [
        { id: "qore-runtime", label: "Qore Runtime", state: runtime.connected ? "nominal" : "degraded" },
        { id: "zo-ui", label: "Zo UI Host", state: "nominal" },
      ],
      checkpointSummary: this.getCheckpointSummary(verdict.decision),
      recentCheckpoints: this.checkpointStore.slice(0, 10),
      qoreRuntime: runtime,
      monitor: {
        state: monitorState,
        statusLine: runtime.connected ? "Runtime Connected" : "Runtime Unreachable",
        recommendation: runtime.connected
          ? "Telemetry active. Continue monitored execution."
          : `Verify runtime process/service and API key at ${runtime.baseUrl}.`,
      },
    };
  }

  private buildHubPayloadSync(): HubPayload {
    return {
      generatedAt: new Date().toISOString(),
      activePlan: this.activePlan,
      currentSprint: { id: "zo-standalone", name: "Zo Standalone Runtime", status: "active" },
      sprints: [{ id: "zo-standalone", name: "Zo Standalone Runtime", status: "active" }],
      sentinelStatus: {
        running: this.monitoringEnabled,
        queueDepth: 0,
        lastVerdict: { decision: "PASS", summary: "Waiting for initial runtime probe." },
      },
      l3Queue: [],
      recentVerdicts: [],
      trustSummary: {
        totalAgents: 1,
        avgTrust: 0.5,
        quarantined: 0,
        stageCounts: { CBT: 1, KBT: 0, IBT: 0 },
      },
      nodeStatus: [
        { id: "qore-runtime", label: "Qore Runtime", state: "degraded" },
        { id: "zo-ui", label: "Zo UI Host", state: "nominal" },
      ],
      checkpointSummary: this.getCheckpointSummary("PASS"),
      recentCheckpoints: this.checkpointStore.slice(0, 10),
      qoreRuntime: {
        enabled: true,
        connected: false,
        baseUrl: this.options.runtimeBaseUrl,
        lastCheckedAt: new Date().toISOString(),
        error: "initializing",
      },
      monitor: {
        state: "degraded",
        statusLine: "Initializing",
        recommendation: "Waiting for first runtime probe.",
      },
    };
  }

  private getCheckpointSummary(latestVerdict: string): HubPayload["checkpointSummary"] {
    const latest = this.checkpointStore[0];
    return {
      total: this.checkpointStore.length,
      chainValid: true,
      latestType: latest?.checkpointType ?? "snapshot.created",
      latestVerdict,
      latestAt: latest?.timestamp ?? new Date().toISOString(),
    };
  }

  private seedDefaultCheckpoints(): void {
    this.checkpointStore = [
      {
        checkpointId: `cp-${Date.now()}-1`,
        runId: "zo-standalone",
        checkpointType: "snapshot.created",
        phase: "plan",
        policyVerdict: "PASS",
        timestamp: new Date().toISOString(),
      },
      {
        checkpointId: `cp-${Date.now()}-2`,
        runId: "zo-standalone",
        checkpointType: "phase.entered",
        phase: "implement",
        policyVerdict: "PASS",
        timestamp: new Date().toISOString(),
      },
    ];
  }

  private appendCheckpoint(type: string, phase: string, verdict: string): void {
    this.checkpointStore.unshift({
      checkpointId: `cp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      runId: "zo-standalone",
      checkpointType: type,
      phase,
      policyVerdict: verdict,
      timestamp: new Date().toISOString(),
    });
    this.checkpointStore = this.checkpointStore.slice(0, 100);
  }

  private async fetchRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const health = await this.fetchQoreJson("/health");
    if (!health.ok) {
      return {
        enabled: true,
        connected: false,
        baseUrl: this.options.runtimeBaseUrl,
        lastCheckedAt: new Date().toISOString(),
        error: health.error,
      };
    }

    const policy = await this.fetchQoreJson("/policy/version");
    return {
      enabled: true,
      connected: true,
      baseUrl: this.options.runtimeBaseUrl,
      policyVersion: policy.ok ? String((policy.body as { policyVersion?: string }).policyVersion ?? "unknown") : "unknown",
      latencyMs: health.latencyMs,
      lastCheckedAt: new Date().toISOString(),
      error: policy.ok ? undefined : policy.error,
    };
  }

  private async fetchQoreJson(endpoint: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<JsonResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs ?? 5000);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.options.runtimeApiKey) {
        headers["x-qore-api-key"] = this.options.runtimeApiKey;
      }

      const response = await fetch(`${this.options.runtimeBaseUrl}${endpoint}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          ok: false,
          error: `upstream_${response.status}`,
          detail: await response.text(),
        };
      }

      return {
        ok: true,
        status: response.status,
        body: await response.json(),
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        ok: false,
        error: "request_failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    if (chunks.length === 0) return {};

    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      return {};
    }
  }

  private serveFile(res: http.ServerResponse, fileName: string): void {
    const fullPath = path.join(this.assetsDir, fileName);
    if (!fs.existsSync(fullPath)) {
      this.sendJson(res, 503, {
        error: "ASSET_MISSING",
        message: `Missing UI asset: ${fileName}`,
      });
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", this.contentTypeFor(path.extname(fullPath).toLowerCase()));
    res.end(fs.readFileSync(fullPath));
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

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  }

  private serveMfaPage(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireUiMfa) {
      res.statusCode = 302;
      res.setHeader("location", "/");
      res.end();
      return;
    }
    if (!this.isAuthorized(req.headers.authorization)) {
      this.sendBasicAuthChallenge(res);
      return;
    }
    if (this.isMfaAuthorized(req.headers.cookie)) {
      res.statusCode = 302;
      res.setHeader("location", "/");
      res.end();
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FailSafe-Qore MFA</title><style>body{font-family:Arial,sans-serif;background:#0b1220;color:#e6eefb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{background:#13233f;border:1px solid #2e4770;border-radius:10px;padding:20px;max-width:360px;width:100%}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;color:#9fb1cd}input,button{width:100%;padding:10px;border-radius:8px;border:1px solid #2e4770}input{background:#0f1a2f;color:#e6eefb;margin-bottom:10px}button{background:#3d7dff;color:#fff;font-weight:700;cursor:pointer}.error{color:#ff8a8a;font-size:13px;min-height:20px}</style></head><body><div class="card"><h1>Two-Factor Verification</h1><p>Enter the 6-digit code from your authenticator app.</p><div id="e" class="error"></div><input id="c" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"/><button id="b">Verify</button></div><script>const b=document.getElementById('b');const c=document.getElementById('c');const e=document.getElementById('e');async function v(){e.textContent='';const code=(c.value||'').trim();const r=await fetch('/mfa/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});if(r.ok){location.href='/';return;}const j=await r.json().catch(()=>({message:'Verification failed'}));e.textContent=j.message||'Verification failed';}b.addEventListener('click',v);c.addEventListener('keydown',(ev)=>{if(ev.key==='Enter')v();});</script></body></html>`);
  }

  private async handleMfaVerify(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const clientIp = this.getClientIp(req);
    if (!this.isClientAllowed(clientIp)) {
      this.sendJson(res, 403, { error: "IP_DENIED", message: `Client IP not allowed: ${clientIp}` });
      return;
    }
    if (!this.requireUiMfa) {
      this.sendJson(res, 200, { ok: true, mfa: "disabled" });
      return;
    }
    if (!this.isAuthorized(req.headers.authorization)) {
      this.sendBasicAuthChallenge(res);
      return;
    }
    if (!this.uiTotpSecret) {
      this.sendJson(res, 503, { error: "MFA_MISCONFIGURED", message: "QORE_UI_TOTP_SECRET is not set." });
      return;
    }

    if (this.isLockedOut(this.mfaFailures, clientIp)) {
      this.sendJson(res, 429, { error: "MFA_LOCKED", message: "Too many MFA failures. Try again later." });
      return;
    }

    const body = (await this.readBody(req)) as { code?: string };
    const code = String(body?.code ?? "").trim();
    if (!verifyTotpCode(this.uiTotpSecret, code, { digits: 6, periodSeconds: 30, window: 1 })) {
      this.recordFailure(this.mfaFailures, clientIp, this.mfaLockoutMs);
      this.sendJson(res, 401, { error: "INVALID_MFA_CODE", message: "Invalid MFA code." });
      return;
    }
    this.clearFailure(this.mfaFailures, clientIp);

    const token = this.createMfaSession(req, clientIp);
    const secure = this.requireUiAuth ? "; Secure" : "";
    res.setHeader("set-cookie", `qore_ui_mfa=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.uiSessionTtlMs / 1000)}${secure}`);
    this.sendJson(res, 200, { ok: true });
  }

  private createMfaSession(req: http.IncomingMessage, clientIp: string): string {
    const raw = generateSessionToken();
    const sig = crypto.createHmac("sha256", this.uiSessionSecret).update(raw).digest("hex");
    const token = `${raw}.${sig}`;
    const now = Date.now();
    const userAgent = String(req.headers["user-agent"] ?? "unknown");
    const deviceHeader = req.headers["x-qore-device-id"];
    const deviceIdRaw = Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader;
    const deviceId = (deviceIdRaw ? String(deviceIdRaw).trim() : "") || this.deriveDeviceId(userAgent, clientIp);
    this.mfaSessions.set(token, {
      tokenId: this.sessionTokenId(raw),
      createdAt: now,
      expiresAt: now + this.uiSessionTtlMs,
      clientIp,
      userAgent,
      deviceId,
      lastSeenAt: now,
    });
    return token;
  }

  private isMfaAuthorized(cookieHeader: string | undefined): boolean {
    if (!this.requireUiMfa) return true;
    this.pruneExpiredSessions();
    const token = parseCookies(cookieHeader).qore_ui_mfa;
    if (!token) return false;
    const session = this.mfaSessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.mfaSessions.delete(token);
      return false;
    }
    session.lastSeenAt = Date.now();
    return true;
  }

  private getClientIp(req: http.IncomingMessage): string {
    if (this.trustProxyHeaders) {
      const xff = req.headers["x-forwarded-for"];
      const firstXff = Array.isArray(xff) ? xff[0] : xff;
      if (firstXff) {
        const first = String(firstXff).split(",")[0]?.trim();
        if (first) return first;
      }
      const xRealIp = req.headers["x-real-ip"];
      if (xRealIp) {
        const ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
        if (ip) return String(ip).trim();
      }
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  private isClientAllowed(clientIp: string): boolean {
    if (this.allowedIps.length === 0) return true;
    return this.allowedIps.includes(clientIp);
  }

  private isLockedOut(store: Map<string, { count: number; lockUntil: number }>, key: string): boolean {
    const record = store.get(key);
    if (!record) return false;
    if (record.lockUntil > Date.now()) return true;
    if (record.lockUntil > 0 && record.lockUntil <= Date.now()) {
      store.delete(key);
    }
    return false;
  }

  private recordFailure(store: Map<string, { count: number; lockUntil: number }>, key: string, lockoutMs: number): void {
    const current = store.get(key) ?? { count: 0, lockUntil: 0 };
    const nextCount = current.count + 1;
    const threshold = store === this.authFailures ? this.authMaxFailures : this.mfaMaxFailures;
    const lockUntil = nextCount >= threshold ? Date.now() + Math.max(lockoutMs, 1000) : 0;
    store.set(key, { count: nextCount, lockUntil });
  }

  private clearFailure(store: Map<string, { count: number; lockUntil: number }>, key: string): void {
    store.delete(key);
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.mfaSessions.entries()) {
      if (session.expiresAt <= now) {
        this.mfaSessions.delete(token);
      }
    }
  }

  private sessionTokenId(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex").slice(0, 24);
  }

  private deriveDeviceId(userAgent: string, clientIp: string): string {
    return crypto.createHash("sha256").update(`${userAgent}|${clientIp}`).digest("hex").slice(0, 16);
  }

  private listSessions(): Array<{ tokenId: string; createdAt: string; expiresAt: string; lastSeenAt: string; clientIp: string; userAgent: string; deviceId: string }> {
    this.pruneExpiredSessions();
    return [...this.mfaSessions.values()]
      .map((session) => ({
        tokenId: session.tokenId,
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        lastSeenAt: new Date(session.lastSeenAt).toISOString(),
        clientIp: session.clientIp,
        userAgent: session.userAgent,
        deviceId: session.deviceId,
      }))
      .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  }

  private normalizeTotpSecret(input: unknown): string | null {
    const value = String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (!value) return null;
    if (!/^[A-Z2-7]+$/.test(value)) return null;
    return value;
  }

  private buildOtpAuthUrl(secret: string, account: string, issuer: string): string {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  private sendBasicAuthChallenge(res: http.ServerResponse): void {
    res.statusCode = 401;
    this.applySecurityHeaders(res);
    res.setHeader("www-authenticate", 'Basic realm="FailSafe-Qore UI"');
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Authentication required.");
  }

  private applySecurityHeaders(res: http.ServerResponse): void {
    res.setHeader("x-content-type-options", "nosniff");
    if (this.allowFrameEmbedding) {
      res.removeHeader("x-frame-options");
    } else {
      res.setHeader("x-frame-options", "DENY");
    }
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("cache-control", "no-store");
    res.setHeader("permissions-policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader(
      "content-security-policy",
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors ${this.frameAncestors};`
    );
  }

  private enforceAuth(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
    const clientIp = this.getClientIp(req);
    if (!this.isClientAllowed(clientIp)) {
      this.sendJson(res, 403, { error: "IP_DENIED", message: `Client IP not allowed: ${clientIp}` });
      return false;
    }

    if (pathname.startsWith("/api/admin/")) {
      if (this.hasValidAdminToken(req)) {
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

    if (this.isLockedOut(this.authFailures, clientIp)) {
      this.sendJson(res, 429, { error: "AUTH_LOCKED", message: "Too many authentication failures. Try again later." });
      return false;
    }

    if (!this.isAuthorized(req.headers.authorization)) {
      this.recordFailure(this.authFailures, clientIp, this.authLockoutMs);
      if (pathname.startsWith("/api/")) {
        this.sendJson(res, 401, { error: "UNAUTHORIZED", message: "Authentication required." });
        return false;
      }
      this.sendBasicAuthChallenge(res);
      return false;
    }
    this.clearFailure(this.authFailures, clientIp);

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

    if (this.isMfaAuthorized(req.headers.cookie)) {
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

  private hasValidAdminToken(req: http.IncomingMessage): boolean {
    if (!this.uiAdminToken) return false;
    const header = req.headers["x-qore-admin-token"];
    const supplied = Array.isArray(header) ? header[0] : header;
    if (!supplied) return false;
    const expected = Buffer.from(this.uiAdminToken);
    const actual = Buffer.from(String(supplied));
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }

  private isAuthorized(authorization: string | undefined): boolean {
    if (!this.requireUiAuth) {
      return true;
    }
    if (!authorization || !authorization.startsWith("Basic ")) {
      return false;
    }
    const encoded = authorization.slice("Basic ".length);
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      return false;
    }
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);
    return user === this.uiAuthUser && pass === this.uiAuthPass;
  }
}
