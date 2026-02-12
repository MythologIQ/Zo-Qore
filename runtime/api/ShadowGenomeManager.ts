import * as crypto from "crypto";
import { FailureMode, ShadowGenomeEntry, SentinelVerdict } from "@mythologiq/qore-contracts/schemas/shared.types";

type ArchiveRequest = {
  verdict: SentinelVerdict;
  inputVector: string;
  decisionRationale?: string;
  environmentContext?: string;
  causalVector?: string;
};

export class ShadowGenomeManager {
  private readonly entries: ShadowGenomeEntry[] = [];

  async archiveFailure(request: ArchiveRequest): Promise<ShadowGenomeEntry> {
    const entry: ShadowGenomeEntry = {
      schemaVersion: "1.0.0",
      id: this.entries.length + 1,
      createdAt: new Date().toISOString(),
      agentDid: request.verdict.agentDid,
      inputVector: request.inputVector,
      decisionRationale: request.decisionRationale,
      environmentContext: request.environmentContext,
      failureMode: this.mapVerdict(request.verdict.decision),
      causalVector: request.causalVector,
      remediationStatus: "UNRESOLVED",
      remediationNotes: `archived:${crypto.randomUUID()}`,
    };
    this.entries.push(entry);
    return entry;
  }

  async getEntriesByAgent(agentDid: string, limit = 20): Promise<ShadowGenomeEntry[]> {
    return this.entries.filter((entry) => entry.agentDid === agentDid).slice(-limit);
  }

  async getNegativeConstraintsForAgent(agentDid: string): Promise<string[]> {
    return this.entries
      .filter((entry) => entry.agentDid === agentDid && Boolean(entry.causalVector))
      .map((entry) => entry.causalVector as string);
  }

  async analyzeFailurePatterns(): Promise<
    { failureMode: FailureMode; count: number; agentDids: string[]; recentCauses: string[] }[]
  > {
    const byMode = new Map<FailureMode, ShadowGenomeEntry[]>();
    for (const entry of this.entries) {
      const group = byMode.get(entry.failureMode) ?? [];
      group.push(entry);
      byMode.set(entry.failureMode, group);
    }

    return Array.from(byMode.entries()).map(([failureMode, items]) => ({
      failureMode,
      count: items.length,
      agentDids: Array.from(new Set(items.map((item) => item.agentDid))),
      recentCauses: items.slice(-5).map((item) => item.causalVector ?? "unknown"),
    }));
  }

  close(): void {
    this.entries.length = 0;
  }

  private mapVerdict(decision: SentinelVerdict["decision"]): FailureMode {
    if (decision === "QUARANTINE") return "TRUST_VIOLATION";
    if (decision === "BLOCK") return "SPEC_VIOLATION";
    if (decision === "ESCALATE") return "HIGH_COMPLEXITY";
    if (decision === "WARN") return "LOGIC_ERROR";
    return "OTHER";
  }
}

