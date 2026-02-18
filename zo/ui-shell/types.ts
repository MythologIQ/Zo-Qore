export type JsonResult =
  | { ok: true; status: number; body: unknown; latencyMs: number }
  | { ok: false; error: string; detail?: string };

export type RuntimeSnapshot = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  policyVersion?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
};

export type PlanArtifact = { id: string; title: string; touched: boolean };

export type PlanPhase = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed";
  progress?: number;
  artifacts: PlanArtifact[];
};

export type Blocker = {
  id: string;
  title: string;
  reason: string;
  severity: "soft" | "hard";
  resolvedAt?: string;
};

export type Risk = { id: string; title: string; level: "info" | "watch" | "danger" };

export type Milestone = {
  id: string;
  title: string;
  completedAt?: string;
  targetDate?: string;
};

export type ActivePlan = {
  id: string;
  title: string;
  currentPhaseId: string;
  phases: PlanPhase[];
  blockers: Blocker[];
  milestones: Milestone[];
  risks: Risk[];
  updatedAt: string;
};

export type Verdict = {
  decision: "PASS" | "WARN" | "BLOCK" | "ESCALATE" | "QUARANTINE";
  summary: string;
  timestamp: string;
  reason?: string;
  filePath?: string;
};

export type SkillRecord = {
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

export type CheckpointRecord = {
  checkpointId: string;
  runId: string;
  checkpointType: string;
  phase: string;
  policyVerdict: string;
  timestamp: string;
};

export type MfaSessionRecord = {
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
  userAgent: string;
  deviceId: string;
  lastSeenAt: number;
};

export type AuthSessionRecord = {
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
  userAgent: string;
  deviceId: string;
  lastSeenAt: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  folderPath?: string;
  parentId?: string | null;
  active?: boolean;
};

export type HubPayload = {
  generatedAt: string;
  activePlan: ActivePlan;
  currentSprint: { id: string; name: string; status: string };
  sprints: Array<{ id: string; name: string; status: string }>;
  sentinelStatus: {
    running: boolean;
    queueDepth: number;
    lastVerdict: {
      decision: "PASS" | "WARN" | "BLOCK" | "ESCALATE" | "QUARANTINE";
      summary: string;
    };
  };
  l3Queue: Array<{
    id: string;
    actor: string;
    filePath: string;
    riskGrade: string;
    requestedAt: string;
  }>;
  recentVerdicts: Verdict[];
  trustSummary: {
    totalAgents: number;
    avgTrust: number;
    quarantined: number;
    stageCounts: { CBT: number; KBT: number; IBT: number };
  };
  nodeStatus: Array<{
    id: string;
    label: string;
    state: "nominal" | "degraded" | "offline" | "unreachable" | "initializing";
  }>;
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
  zoApiBaseUrl?: string;
  requestTimeoutMs?: number;
  assetsDir?: string;
}
