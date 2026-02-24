import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createLogger } from "./Logger.js";
import { StoreIntegrity } from "./StoreIntegrity.js";
import { PlanningLedger } from "./PlanningLedger.js";
import type {
  VoidThought,
  RevealCluster,
  ConstellationMap,
  PathPhase,
  RiskEntry,
} from "@mythologiq/qore-contracts";

const logger = createLogger("integrity-checker");

export type CheckId =
  | "PL-INT-01"
  | "PL-INT-02"
  | "PL-INT-03"
  | "PL-INT-04"
  | "PL-INT-05"
  | "PL-INT-06"
  | "PL-TRC-01"
  | "PL-TRC-02"
  | "PL-TRC-03";

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
  private storeIntegrity: StoreIntegrity;
  private ledger: PlanningLedger;

  constructor(basePath: string, projectId: string) {
    this.storeIntegrity = new StoreIntegrity(basePath);
    this.ledger = new PlanningLedger(basePath, projectId);
  }

  private get projectPath(): string {
    return this.storeIntegrity["basePath"];
  }

  private readJsonFile<T>(filePath: string): T | null {
    try {
      if (!existsSync(filePath)) return null;
      const content = readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private readThoughts(projectId: string): VoidThought[] {
    const filePath = join(this.projectPath, projectId, "void", "thoughts.jsonl");
    const content = this.readJsonFile<string>(filePath);
    if (!content) return [];
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as VoidThought;
        } catch {
          return null;
        }
      })
      .filter((t): t is VoidThought => t !== null);
  }

  private readClusters(projectId: string): RevealCluster[] {
    const filePath = join(this.projectPath, projectId, "reveal", "clusters.json");
    const data = this.readJsonFile<{ clusters: RevealCluster[] }>(filePath);
    return data?.clusters ?? [];
  }

  private readConstellation(projectId: string): ConstellationMap | null {
    const filePath = join(this.projectPath, projectId, "constellation", "map.json");
    return this.readJsonFile<ConstellationMap>(filePath);
  }

  private readPhases(projectId: string): PathPhase[] {
    const filePath = join(this.projectPath, projectId, "path", "phases.json");
    const data = this.readJsonFile<{ phases: PathPhase[] }>(filePath);
    return data?.phases ?? [];
  }

  private readRisks(projectId: string): RiskEntry[] {
    const filePath = join(this.projectPath, projectId, "risk", "register.json");
    const data = this.readJsonFile<{ risks: RiskEntry[] }>(filePath);
    return data?.risks ?? [];
  }

  private createResult(
    checkId: CheckId,
    name: string,
    passed: boolean,
    details: string[],
  ): CheckResult {
    return {
      checkId,
      name,
      passed,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  async checkPL_INT_01(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-01: Store checksum verification", { projectId });
    try {
      const result = await this.storeIntegrity.verify(projectId);
      return this.createResult(
        "PL-INT-01",
        "Store checksum verification",
        result.valid,
        result.errors.length > 0 ? result.errors : ["All checksums valid"],
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return this.createResult("PL-INT-01", "Store checksum verification", false, [
        `Integrity check failed: ${message}`,
      ]);
    }
  }

  async checkPL_INT_02(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-02: Ledger consistency verification", { projectId });
    try {
      const result = await this.ledger.verifyConsistency();
      return this.createResult(
        "PL-INT-02",
        "Ledger consistency verification",
        result.valid,
        result.errors.length > 0 ? result.errors : ["Ledger is consistent"],
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return this.createResult("PL-INT-02", "Ledger consistency verification", false, [
        `Ledger consistency check failed: ${message}`,
      ]);
    }
  }

  async checkPL_INT_03(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-03: Void→Reveal reference check", { projectId });
    const thoughts = this.readThoughts(projectId);
    const clusters = this.readClusters(projectId);
    const thoughtIds = new Set(thoughts.map((t) => t.thoughtId));
    const errors: string[] = [];

    for (const cluster of clusters) {
      for (const thoughtId of cluster.thoughtIds) {
        if (!thoughtIds.has(thoughtId)) {
          errors.push(`Cluster ${cluster.clusterId} references missing thought: ${thoughtId}`);
        }
      }
    }

    return this.createResult(
      "PL-INT-03",
      "Void→Reveal reference check",
      errors.length === 0,
      errors.length > 0 ? errors : ["All Void→Reveal references valid"],
    );
  }

  async checkPL_INT_04(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-04: Reveal→Constellation reference check", { projectId });
    const clusters = this.readClusters(projectId);
    const constellation = this.readConstellation(projectId);
    const clusterIds = new Set(clusters.map((c) => c.clusterId));
    const errors: string[] = [];

    if (constellation) {
      for (const node of constellation.nodes) {
        if (!clusterIds.has(node.clusterId)) {
          errors.push(
            `Constellation node ${node.nodeId} references missing cluster: ${node.clusterId}`,
          );
        }
      }
    }

    return this.createResult(
      "PL-INT-04",
      "Reveal→Constellation reference check",
      errors.length === 0,
      errors.length > 0 ? errors : ["All Reveal→Constellation references valid"],
    );
  }

  async checkPL_INT_05(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-05: Constellation→Path reference check", { projectId });
    const clusters = this.readClusters(projectId);
    const phases = this.readPhases(projectId);
    const clusterIds = new Set(clusters.map((c) => c.clusterId));
    const errors: string[] = [];

    for (const phase of phases) {
      for (const clusterId of phase.sourceClusterIds) {
        if (!clusterIds.has(clusterId)) {
          errors.push(`Phase ${phase.phaseId} references missing cluster: ${clusterId}`);
        }
      }
    }

    return this.createResult(
      "PL-INT-05",
      "Constellation→Path reference check",
      errors.length === 0,
      errors.length > 0 ? errors : ["All Constellation→Path references valid"],
    );
  }

  async checkPL_INT_06(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-INT-06: Path→Risk reference check", { projectId });
    const phases = this.readPhases(projectId);
    const risks = this.readRisks(projectId);
    const phaseIds = new Set(phases.map((p) => p.phaseId));
    const errors: string[] = [];

    for (const risk of risks) {
      if (!phaseIds.has(risk.phaseId)) {
        errors.push(`Risk ${risk.riskId} references missing phase: ${risk.phaseId}`);
      }
    }

    return this.createResult(
      "PL-INT-06",
      "Path→Risk reference check",
      errors.length === 0,
      errors.length > 0 ? errors : ["All Path→Risk references valid"],
    );
  }

  async checkPL_TRC_01(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-TRC-01: Full traceability check", { projectId });
    const thoughts = this.readThoughts(projectId);
    const clusters = this.readClusters(projectId);
    const constellation = this.readConstellation(projectId);
    const phases = this.readPhases(projectId);
    const risks = this.readRisks(projectId);
    const errors: string[] = [];

    const hasVoid = thoughts.length > 0;
    const hasReveal = clusters.length > 0;
    const hasConstellation = constellation !== null && constellation.nodes.length > 0;
    const hasPath = phases.length > 0;
    const hasRisk = risks.length > 0;

    const referencedThoughtIds = new Set<string>();
    for (const cluster of clusters) {
      for (const thoughtId of cluster.thoughtIds) {
        referencedThoughtIds.add(thoughtId);
      }
    }

    for (const thought of thoughts) {
      if (thought.status === "claimed" && !referencedThoughtIds.has(thought.thoughtId)) {
        errors.push(`Thought ${thought.thoughtId} is claimed but not in any cluster`);
      }
    }

    const referencedClusterIds = new Set<string>();
    if (constellation) {
      for (const node of constellation.nodes) {
        referencedClusterIds.add(node.clusterId);
      }
    }
    for (const phase of phases) {
      for (const clusterId of phase.sourceClusterIds) {
        referencedClusterIds.add(clusterId);
      }
    }

    for (const cluster of clusters) {
      if (cluster.status === "formed" && !referencedClusterIds.has(cluster.clusterId)) {
        errors.push(`Cluster ${cluster.clusterId} is formed but not referenced in constellation or path`);
      }
    }

    const referencedPhaseIds = new Set(phases.map((p) => p.phaseId));
    for (const risk of risks) {
      if (!referencedPhaseIds.has(risk.phaseId)) {
        errors.push(`Risk ${risk.riskId} references non-existent phase`);
      }
    }

    if (!hasVoid && (hasReveal || hasConstellation || hasPath || hasRisk)) {
      errors.push("Pipeline has views beyond Void but Void is empty");
    }

    return this.createResult(
      "PL-TRC-01",
      "Full traceability check",
      errors.length === 0,
      errors.length > 0 ? errors : ["Full traceability verified"],
    );
  }

  async checkPL_TRC_02(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-TRC-02: Orphan detection check", { projectId });
    const thoughts = this.readThoughts(projectId);
    const clusters = this.readClusters(projectId);
    const errors: string[] = [];

    const referencedThoughtIds = new Set<string>();
    for (const cluster of clusters) {
      for (const thoughtId of cluster.thoughtIds) {
        referencedThoughtIds.add(thoughtId);
      }
    }

    for (const thought of thoughts) {
      if (!referencedThoughtIds.has(thought.thoughtId) && thought.status === "claimed") {
        errors.push(`Orphan thought: ${thought.thoughtId} is claimed but not in any cluster`);
      }
    }

    return this.createResult(
      "PL-TRC-02",
      "Orphan detection check",
      errors.length === 0,
      errors.length > 0 ? errors : ["No orphan thoughts detected"],
    );
  }

  async checkPL_TRC_03(projectId: string): Promise<CheckResult> {
    logger.info("Running PL-TRC-03: Coverage check", { projectId });
    const thoughts = this.readThoughts(projectId);
    const clusters = this.readClusters(projectId);
    const constellation = this.readConstellation(projectId);
    const phases = this.readPhases(projectId);
    const risks = this.readRisks(projectId);

    const viewStatus: Record<string, boolean> = {
      void: thoughts.length > 0,
      reveal: clusters.length > 0,
      constellation: constellation !== null && constellation.nodes.length > 0,
      path: phases.length > 0,
      risk: risks.length > 0,
    };

    const emptyViews = Object.entries(viewStatus)
      .filter(([, hasContent]) => !hasContent)
      .map(([view]) => view);

    const hasContent = Object.values(viewStatus).some((v) => v);

    if (!hasContent) {
      return this.createResult(
        "PL-TRC-03",
        "Coverage check",
        true,
        ["Project has no content yet - no coverage requirements"],
      );
    }

    return this.createResult(
      "PL-TRC-03",
      "Coverage check",
      emptyViews.length === 0,
      emptyViews.length > 0
        ? [`Empty views: ${emptyViews.join(", ")}`]
        : ["All active views have content"],
    );
  }

  async runAllChecks(projectId: string): Promise<IntegrityCheckSummary> {
    logger.info("Running all integrity checks", { projectId });

    const checks = [
      this.checkPL_INT_01(projectId),
      this.checkPL_INT_02(projectId),
      this.checkPL_INT_03(projectId),
      this.checkPL_INT_04(projectId),
      this.checkPL_INT_05(projectId),
      this.checkPL_INT_06(projectId),
      this.checkPL_TRC_01(projectId),
      this.checkPL_TRC_02(projectId),
      this.checkPL_TRC_03(projectId),
    ];

    const results = await Promise.all(checks);
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      totalChecks: results.length,
      passed,
      failed,
      results,
      overallPassed: failed === 0,
    };
  }

  async runCheck(projectId: string, checkId: CheckId): Promise<CheckResult> {
    logger.info("Running specific integrity check", { projectId, checkId });

    switch (checkId) {
      case "PL-INT-01":
        return this.checkPL_INT_01(projectId);
      case "PL-INT-02":
        return this.checkPL_INT_02(projectId);
      case "PL-INT-03":
        return this.checkPL_INT_03(projectId);
      case "PL-INT-04":
        return this.checkPL_INT_04(projectId);
      case "PL-INT-05":
        return this.checkPL_INT_05(projectId);
      case "PL-INT-06":
        return this.checkPL_INT_06(projectId);
      case "PL-TRC-01":
        return this.checkPL_TRC_01(projectId);
      case "PL-TRC-02":
        return this.checkPL_TRC_02(projectId);
      case "PL-TRC-03":
        return this.checkPL_TRC_03(projectId);
      default:
        throw new Error(`Unknown check ID: ${checkId}`);
    }
  }
}

export function createIntegrityChecker(basePath: string, projectId: string): IntegrityChecker {
  return new IntegrityChecker(basePath, projectId);
}
