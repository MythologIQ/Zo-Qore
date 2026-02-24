import { createLogger } from "./Logger";
import { StoreIntegrity } from "./StoreIntegrity";
import { PlanningLedger } from "./PlanningLedger";
import { createCheckResult, readThoughts, readClusters, readConstellation, readPhases, readRisks } from "./IntegrityUtils";
import { existsSync } from "fs";
import { join } from "path";

const logger = createLogger("integrity-checker");

export type CheckId =
  | "PL-INT-01" | "PL-INT-02" | "PL-INT-03" | "PL-INT-04" | "PL-INT-05" | "PL-INT-06"
  | "PL-TRC-01" | "PL-TRC-02" | "PL-TRC-03";

export interface CheckResult {
  checkId: CheckId;
  name: string;
  passed: boolean;
  details: string[];
  timestamp: string;
}

export interface IntegrityCheckSummary {
  totalChecks: number;
  passed: number;
  failed: number;
  results: CheckResult[];
  overallPassed: boolean;
}

export class IntegrityChecker {
  private basePath: string;
  private projectId: string;
  private storeIntegrity: StoreIntegrity;
  private ledger: PlanningLedger;

  constructor(basePath: string, projectId: string) {
    this.basePath = basePath;
    this.projectId = projectId;
    this.storeIntegrity = new StoreIntegrity(basePath);
    this.ledger = new PlanningLedger(basePath, projectId);
  }

  async checkPL_INT_01(_projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-01: Store checksum verification");
    try {
      const result = await this.storeIntegrity.verify(this.projectId);
      return createCheckResult("PL-INT-01", "Store checksum verification", result.valid,
        result.errors.length > 0 ? result.errors : ["All checksums valid"]);
    } catch (e) {
      return createCheckResult("PL-INT-01", "Store checksum verification", false,
        [`Integrity check failed: ${e instanceof Error ? e.message : "Unknown error"}`]);
    }
  }

  async checkPL_INT_02(_projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-02: Ledger consistency verification");
    try {
      const result = await this.ledger.verifyConsistency();
      return createCheckResult("PL-INT-02", "Ledger consistency verification", result.valid,
        result.errors.length > 0 ? result.errors : ["Ledger is consistent"]);
    } catch (e) {
      return createCheckResult("PL-INT-02", "Ledger consistency verification", false,
        [`Ledger consistency check failed: ${e instanceof Error ? e.message : "Unknown error"}`]);
    }
  }

  async checkPL_INT_03(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-03: Void→Reveal reference check", { projectId });
    const thoughts = readThoughts(this.basePath, projectId);
    const clusters = readClusters(this.basePath, projectId);
    const thoughtIds = new Set(thoughts.map((t) => t.thoughtId));
    const errors: string[] = [];
    for (const cluster of clusters) {
      for (const thoughtId of cluster.thoughtIds) {
        if (!thoughtIds.has(thoughtId)) {
          errors.push(`Cluster ${cluster.clusterId} references missing thought: ${thoughtId}`);
        }
      }
    }
    return createCheckResult("PL-INT-03", "Void→Reveal reference check", errors.length === 0,
      errors.length > 0 ? errors : ["All Void→Reveal references valid"]);
  }

  async checkPL_INT_04(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-04: Reveal→Constellation reference check", { projectId });
    const clusters = readClusters(this.basePath, projectId);
    const constellation = readConstellation(this.basePath, projectId);
    const clusterIds = new Set(clusters.map((c) => c.clusterId));
    const errors: string[] = [];
    if (constellation) {
      for (const node of constellation.nodes) {
        if (!clusterIds.has(node.clusterId)) {
          errors.push(`Constellation node ${node.nodeId} references missing cluster: ${node.clusterId}`);
        }
      }
    }
    return createCheckResult("PL-INT-04", "Reveal→Constellation reference check", errors.length === 0,
      errors.length > 0 ? errors : ["All Reveal→Constellation references valid"]);
  }

  async checkPL_INT_05(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-05: Constellation→Path reference check", { projectId });
    const clusters = readClusters(this.basePath, projectId);
    const phases = readPhases(this.basePath, projectId);
    const clusterIds = new Set(clusters.map((c) => c.clusterId));
    const errors: string[] = [];
    for (const phase of phases) {
      for (const clusterId of phase.sourceClusterIds) {
        if (!clusterIds.has(clusterId)) {
          errors.push(`Phase ${phase.phaseId} references missing cluster: ${clusterId}`);
        }
      }
    }
    return createCheckResult("PL-INT-05", "Constellation→Path reference check", errors.length === 0,
      errors.length > 0 ? errors : ["All Constellation→Path references valid"]);
  }

  async checkPL_INT_06(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-06: Path→Risk reference check", { projectId });
    const phases = readPhases(this.basePath, projectId);
    const risks = readRisks(this.basePath, projectId);
    const phaseIds = new Set(phases.map((p) => p.phaseId));
    const errors: string[] = [];
    for (const risk of risks) {
      if (!phaseIds.has(risk.phaseId)) {
        errors.push(`Risk ${risk.riskId} references missing phase: ${risk.phaseId}`);
      }
    }
    return createCheckResult("PL-INT-06", "Path→Risk reference check", errors.length === 0,
      errors.length > 0 ? errors : ["All Path→Risk references valid"]);
  }

  async checkPL_TRC_01(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-TRC-01: Full traceability check", { projectId });
    const thoughts = readThoughts(this.basePath, projectId);
    const clusters = readClusters(this.basePath, projectId);
    const constellation = readConstellation(this.basePath, projectId);
    const phases = readPhases(this.basePath, projectId);
    const risks = readRisks(this.basePath, projectId);
    const errors: string[] = [];

    // Check if later views have been started but earlier views are empty
    const hasVoidFile = existsSync(join(this.basePath, projectId, "void", "thoughts.jsonl"));
    const hasRevealFile = existsSync(join(this.basePath, projectId, "reveal", "clusters.json"));
    const hasConstellationFile = existsSync(join(this.basePath, projectId, "constellation", "map.json"));
    const hasPathFile = existsSync(join(this.basePath, projectId, "path", "phases.json"));
    const hasRiskFile = existsSync(join(this.basePath, projectId, "risk", "register.json"));

    if (!hasVoidFile && (hasRevealFile || hasConstellationFile || hasPathFile || hasRiskFile)) {
      errors.push("Pipeline has views beyond Void but Void is empty");
    }

    if (hasVoidFile && thoughts.length === 0 && (hasRevealFile || hasConstellationFile || hasPathFile || hasRiskFile)) {
      errors.push("Pipeline has views beyond Void but Void is empty");
    }

    const refThoughtIds = new Set<string>();
    clusters.forEach((c) => c.thoughtIds.forEach((id) => refThoughtIds.add(id)));
    thoughts.filter((t) => t.status === "claimed").forEach((t) => {
      if (!refThoughtIds.has(t.thoughtId)) {
        errors.push(`Thought ${t.thoughtId} is claimed but not in any cluster`);
      }
    });

    const refClusterIds = new Set<string>();
    if (constellation) constellation.nodes.forEach((n) => refClusterIds.add(n.clusterId));
    phases.forEach((p) => p.sourceClusterIds.forEach((id) => refClusterIds.add(id)));
    clusters.filter((c) => c.status === "formed").forEach((c) => {
      if (!refClusterIds.has(c.clusterId)) {
        errors.push(`Cluster ${c.clusterId} is formed but not referenced`);
      }
    });

    const refPhaseIds = new Set(phases.map((p) => p.phaseId));
    risks.filter((r) => !refPhaseIds.has(r.phaseId)).forEach((r) => {
      errors.push(`Risk ${r.riskId} references non-existent phase`);
    });

    return createCheckResult("PL-TRC-01", "Full traceability check", errors.length === 0,
      errors.length > 0 ? errors : ["Full traceability verified"]);
  }

  async checkPL_TRC_02(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-TRC-02: Orphan detection check", { projectId });
    const thoughts = readThoughts(this.basePath, projectId);
    const clusters = readClusters(this.basePath, projectId);
    const refThoughtIds = new Set<string>();
    clusters.forEach((c) => c.thoughtIds.forEach((id) => refThoughtIds.add(id)));
    const errors: string[] = [];
    thoughts.filter((t) => !refThoughtIds.has(t.thoughtId) && t.status === "claimed").forEach((t) => {
      errors.push(`Orphan thought: ${t.thoughtId}`);
    });
    return createCheckResult("PL-TRC-02", "Orphan detection check", errors.length === 0,
      errors.length > 0 ? errors : ["No orphan thoughts detected"]);
  }

  async checkPL_TRC_03(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-TRC-03: Coverage check", { projectId });
    const thoughts = readThoughts(this.basePath, projectId);
    const clusters = readClusters(this.basePath, projectId);
    const constellation = readConstellation(this.basePath, projectId);
    const phases = readPhases(this.basePath, projectId);
    const risks = readRisks(this.basePath, projectId);
    const hasContent = thoughts.length > 0 || clusters.length > 0 ||
      (constellation?.nodes.length ?? 0) > 0 || phases.length > 0 || risks.length > 0;

    if (!hasContent) {
      return createCheckResult("PL-TRC-03", "Coverage check", true, ["No content yet"]);
    }

    const emptyViews: string[] = [];
    if (thoughts.length === 0) emptyViews.push("void");
    if (clusters.length === 0) emptyViews.push("reveal");
    if (!constellation || constellation.nodes.length === 0) emptyViews.push("constellation");
    if (phases.length === 0) emptyViews.push("path");
    if (risks.length === 0) emptyViews.push("risk");

    return createCheckResult("PL-TRC-03", "Coverage check", emptyViews.length === 0,
      emptyViews.length > 0 ? [`Empty views: ${emptyViews.join(", ")}`] : ["All views have content"]);
  }

  async runAllChecks(projectId: string): Promise<IntegrityCheckSummary> {
    logger.info("Running all integrity checks", { projectId });
    const results = await Promise.all([
      this.checkPL_INT_01(projectId), this.checkPL_INT_02(projectId),
      this.checkPL_INT_03(projectId), this.checkPL_INT_04(projectId),
      this.checkPL_INT_05(projectId), this.checkPL_INT_06(projectId),
      this.checkPL_TRC_01(projectId), this.checkPL_TRC_02(projectId),
      this.checkPL_TRC_03(projectId),
    ]);
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    return { totalChecks: results.length, passed, failed, results, overallPassed: failed === 0 };
  }

  async runCheck(projectId: string, checkId: CheckId): Promise<CheckResult> {
    logger.info("Running specific check", { projectId, checkId });
    const checks: Partial<Record<CheckId, () => Promise<CheckResult>>> = {
      "PL-INT-01": () => this.checkPL_INT_01(projectId),
      "PL-INT-02": () => this.checkPL_INT_02(projectId),
      "PL-INT-03": () => this.checkPL_INT_03(projectId),
      "PL-INT-04": () => this.checkPL_INT_04(projectId),
      "PL-INT-05": () => this.checkPL_INT_05(projectId),
      "PL-INT-06": () => this.checkPL_INT_06(projectId),
      "PL-TRC-01": () => this.checkPL_TRC_01(projectId),
      "PL-TRC-02": () => this.checkPL_TRC_02(projectId),
      "PL-TRC-03": () => this.checkPL_TRC_03(projectId),
    };
    const check = checks[checkId];
    if (!check) throw new Error(`Unknown check ID: ${checkId}`);
    return check();
  }
}

export function createIntegrityChecker(basePath: string, projectId: string): IntegrityChecker {
  return new IntegrityChecker(basePath, projectId);
}