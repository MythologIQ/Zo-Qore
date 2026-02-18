import type {
  ActivePlan,
  CheckpointRecord,
  HubPayload,
  RuntimeSnapshot,
  Verdict,
} from "./types.js";

export function buildHubPayload(
  runtime: RuntimeSnapshot,
  activePlan: ActivePlan,
  monitoringEnabled: boolean,
  checkpointStore: CheckpointRecord[],
  getCheckpointSummary: (verdict: string) => HubPayload["checkpointSummary"],
): HubPayload {
  const verdict = runtime.connected
    ? {
        decision: "PASS" as const,
        summary: "Runtime reachable and policy endpoint healthy.",
      }
    : {
        decision: "WARN" as const,
        summary: "Runtime unreachable. Verify process and API key.",
      };

  const recentVerdicts: Verdict[] = [
    {
      decision: verdict.decision,
      summary: verdict.summary,
      timestamp: new Date().toISOString(),
    },
  ];

  const monitorState: HubPayload["monitor"]["state"] = runtime.connected
    ? "connected"
    : "degraded";

  return {
    generatedAt: new Date().toISOString(),
    activePlan: {
      ...activePlan,
      updatedAt: new Date().toISOString(),
    },
    currentSprint: {
      id: "zo-standalone",
      name: "Zo Standalone Runtime",
      status: "active",
    },
    sprints: [
      {
        id: "zo-standalone",
        name: "Zo Standalone Runtime",
        status: "active",
      },
    ],
    sentinelStatus: {
      running: monitoringEnabled,
      queueDepth: 0,
      lastVerdict: verdict,
    },
    l3Queue: [],
    recentVerdicts,
    trustSummary: {
      totalAgents: 0,
      avgTrust: 0,
      quarantined: 0,
      stageCounts: { CBT: 0, KBT: 0, IBT: 0 },
    },
    nodeStatus: [
      {
        id: "qore-runtime",
        label: "Qore Runtime",
        state: runtime.connected ? "nominal" : "unreachable",
      },
      { id: "zo-ui", label: "Zo UI Host", state: "nominal" },
    ],
    checkpointSummary: getCheckpointSummary(verdict.decision),
    recentCheckpoints: checkpointStore.slice(0, 10),
    qoreRuntime: runtime,
    monitor: {
      state: monitorState,
      statusLine: runtime.connected
        ? "Runtime Connected"
        : "Runtime Unreachable",
      recommendation: runtime.connected
        ? "Telemetry active. Continue monitored execution."
        : `Verify runtime process/service and API key at ${runtime.baseUrl}.`,
    },
  };
}

export function buildHubPayloadSync(
  activePlan: ActivePlan,
  monitoringEnabled: boolean,
  runtimeBaseUrl: string,
  checkpointStore: CheckpointRecord[],
  getCheckpointSummary: (verdict: string) => HubPayload["checkpointSummary"],
): HubPayload {
  return {
    generatedAt: new Date().toISOString(),
    activePlan,
    currentSprint: {
      id: "zo-standalone",
      name: "Zo Standalone Runtime",
      status: "active",
    },
    sprints: [
      {
        id: "zo-standalone",
        name: "Zo Standalone Runtime",
        status: "active",
      },
    ],
    sentinelStatus: {
      running: monitoringEnabled,
      queueDepth: 0,
      lastVerdict: {
        decision: "PASS",
        summary: "Waiting for initial runtime probe.",
      },
    },
    l3Queue: [],
    recentVerdicts: [],
    trustSummary: {
      totalAgents: 0,
      avgTrust: 0,
      quarantined: 0,
      stageCounts: { CBT: 0, KBT: 0, IBT: 0 },
    },
    nodeStatus: [
      { id: "qore-runtime", label: "Qore Runtime", state: "initializing" },
      { id: "zo-ui", label: "Zo UI Host", state: "nominal" },
    ],
    checkpointSummary: getCheckpointSummary("PASS"),
    recentCheckpoints: checkpointStore.slice(0, 10),
    qoreRuntime: {
      enabled: true,
      connected: false,
      baseUrl: runtimeBaseUrl,
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

export function getCheckpointSummary(
  checkpointStore: CheckpointRecord[],
  latestVerdict: string,
): HubPayload["checkpointSummary"] {
  const latest = checkpointStore[0];
  return {
    total: checkpointStore.length,
    chainValid: true,
    latestType: latest?.checkpointType ?? "snapshot.created",
    latestVerdict,
    latestAt: latest?.timestamp ?? new Date().toISOString(),
  };
}

export function seedDefaultCheckpoints(): CheckpointRecord[] {
  return [
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

export function appendCheckpoint(
  checkpointStore: CheckpointRecord[],
  type: string,
  phase: string,
  verdict: string,
): CheckpointRecord[] {
  const next = [
    {
      checkpointId: `cp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      runId: "zo-standalone",
      checkpointType: type,
      phase,
      policyVerdict: verdict,
      timestamp: new Date().toISOString(),
    },
    ...checkpointStore,
  ];
  return next.slice(0, 100);
}
