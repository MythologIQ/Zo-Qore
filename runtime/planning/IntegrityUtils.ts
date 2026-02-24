import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  VoidThought,
  RevealCluster,
  ConstellationMap,
  PathPhase,
  RiskEntry,
} from "@mythologiq/qore-contracts";
import type { CheckResult } from "./IntegrityChecker";
import type { CheckId } from "./IntegrityChecker";

export function createCheckResult(
  checkId: CheckId,
  name: string,
  passed: boolean,
  details: string[],
): CheckResult {
  return { checkId, name, passed, details, timestamp: new Date().toISOString() };
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch { return null; }
}

export function readThoughts(projectPath: string, projectId: string): VoidThought[] {
  const filePath = join(projectPath, projectId, "void", "thoughts.jsonl");
  try {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, "utf-8");
    if (!content?.trim()) return [];
    return content.split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line) as VoidThought; } catch { return null; }
    }).filter((t): t is VoidThought => t !== null);
  } catch { return []; }
}

export function readClusters(projectPath: string, projectId: string): RevealCluster[] {
  const filePath = join(projectPath, projectId, "reveal", "clusters.json");
  const data = readJsonFile<{ clusters: RevealCluster[] }>(filePath);
  return data?.clusters ?? [];
}

export function readConstellation(projectPath: string, projectId: string): ConstellationMap | null {
  return readJsonFile<ConstellationMap>(join(projectPath, projectId, "constellation", "map.json"));
}

export function readPhases(projectPath: string, projectId: string): PathPhase[] {
  const filePath = join(projectPath, projectId, "path", "phases.json");
  const data = readJsonFile<{ phases: PathPhase[] }>(filePath);
  return data?.phases ?? [];
}

export function readRisks(projectPath: string, projectId: string): RiskEntry[] {
  const filePath = join(projectPath, projectId, "risk", "register.json");
  const data = readJsonFile<{ risks: RiskEntry[] }>(filePath);
  return data?.risks ?? [];
}