import { createLogger } from "./Logger";
import { PlanningStoreError } from "./StoreErrors";
import { createVoidStore, VoidStore } from "./VoidStore";
import { createViewStore, ViewStore, ViewType } from "./ViewStore";
import { createStoreIntegrity, StoreIntegrity } from "./StoreIntegrity";
import type { VoidThought } from "@mythologiq/qore-contracts";
import type { RevealCluster } from "@mythologiq/qore-contracts";
import type { ConstellationMap } from "@mythologiq/qore-contracts";
import type { PathPhase } from "@mythologiq/qore-contracts";
import type { RiskEntry } from "@mythologiq/qore-contracts";
import type { AutonomyConfig } from "@mythologiq/qore-contracts";

const logger = createLogger("planning-agent-interface");

export type QueryType =
  | "pipeline_state"
  | "unclaimed_thoughts"
  | "phases_without_risks"
  | "integrity_status"
  | "cluster_count"
  | "thought_count"
  | "risk_summary"
  | "unknown";

export interface QueryResult {
  queryType: QueryType;
  question: string;
  answer: string;
  data?: unknown;
  timestamp: string;
}

export interface PipelineState {
  void: "empty" | "active";
  reveal: "empty" | "active";
  constellation: "empty" | "active";
  path: "empty" | "active";
  risk: "empty" | "active";
  autonomy: "empty" | "active";
  thoughtCount: number;
  clusterCount: number;
  phaseCount: number;
  riskCount: number;
}

interface ViewData {
  clusters?: RevealCluster[];
  map?: ConstellationMap;
  phases?: PathPhase[];
  risks?: RiskEntry[];
  config?: AutonomyConfig;
}

const QUESTION_PATTERNS: Record<QueryType, RegExp[]> = {
  pipeline_state: [
    /pipeline state/i,
    /current state/i,
    /what.*status/i,
    /where am i/i,
  ],
  unclaimed_thoughts: [
    /unclaimed/i,
    /not claimed/i,
    /raw thoughts/i,
    /thoughts that haven't been claimed/i,
  ],
  phases_without_risks: [
    /phases? (without|with no) risks?/i,
    /no risk/i,
    /unassessed phases/i,
    /phases without risk/i,
  ],
  integrity_status: [
    /integrity/i,
    /checksum/i,
    /corrupt/i,
    /valid.*data/i,
  ],
  cluster_count: [
    /how many clusters/i,
    /cluster count/i,
    /number of clusters/i,
  ],
  thought_count: [
    /how many thoughts/i,
    /thought count/i,
    /number of thoughts/i,
  ],
  risk_summary: [
    /risk summary/i,
    /all risks/i,
    /what risks/i,
  ],
  unknown: [],
};

function parseQuestion(question: string): QueryType {
  const lowerQuestion = question.toLowerCase();

  for (const [queryType, patterns] of Object.entries(QUESTION_PATTERNS)) {
    if (queryType === "unknown") continue;

    for (const pattern of patterns) {
      if (pattern.test(lowerQuestion)) {
        return queryType as QueryType;
      }
    }
  }

  return "unknown";
}

export class PlanningAgentInterface {
  private voidStore: VoidStore;
  private revealStore: ViewStore;
  private constellationStore: ViewStore;
  private pathStore: ViewStore;
  private riskStore: ViewStore;
  private autonomyStore: ViewStore;
  private integrity: StoreIntegrity;

  constructor(
    private basePath: string,
    private projectId: string,
  ) {
    this.voidStore = createVoidStore(basePath, projectId);
    this.revealStore = createViewStore(basePath, projectId, "reveal");
    this.constellationStore = createViewStore(basePath, projectId, "constellation");
    this.pathStore = createViewStore(basePath, projectId, "path");
    this.riskStore = createViewStore(basePath, projectId, "risk");
    this.autonomyStore = createViewStore(basePath, projectId, "autonomy");
    this.integrity = createStoreIntegrity(basePath);
  }

  private async loadViewData(): Promise<ViewData> {
    const [clusters, map, phases, risks, config] = await Promise.all([
      this.revealStore.read<RevealCluster[]>(),
      this.constellationStore.read<ConstellationMap>(),
      this.pathStore.read<PathPhase[]>(),
      this.riskStore.read<RiskEntry[]>(),
      this.autonomyStore.read<AutonomyConfig>(),
    ]);

    return {
      clusters: clusters ?? undefined,
      map: map ?? undefined,
      phases: phases ?? undefined,
      risks: risks ?? undefined,
      config: config ?? undefined,
    };
  }

  async getPipelineState(): Promise<PipelineState> {
    const [thoughts, viewData] = await Promise.all([
      this.voidStore.getAllThoughts(),
      this.loadViewData(),
    ]);

    const thoughtCount = thoughts.length;
    const clusterCount = viewData.clusters?.length ?? 0;
    const phaseCount = viewData.phases?.length ?? 0;
    const riskCount = viewData.risks?.length ?? 0;

    return {
      void: thoughtCount > 0 ? "active" : "empty",
      reveal: clusterCount > 0 ? "active" : "empty",
      constellation: viewData.map ? "active" : "empty",
      path: phaseCount > 0 ? "active" : "empty",
      risk: riskCount > 0 ? "active" : "empty",
      autonomy: viewData.config ? "active" : "empty",
      thoughtCount,
      clusterCount,
      phaseCount,
      riskCount,
    };
  }

  async query(question: string): Promise<QueryResult> {
    const queryType = parseQuestion(question);
    logger.info("Processing query", { projectId: this.projectId, queryType, question });

    const result = await this.executeQuery(queryType, question);
    return result;
  }

  private async executeQuery(queryType: QueryType, question: string): Promise<QueryResult> {
    switch (queryType) {
      case "pipeline_state": {
        const state = await this.getPipelineState();
        const answer = this.formatPipelineStateAnswer(state);
        return {
          queryType,
          question,
          answer,
          data: state,
          timestamp: new Date().toISOString(),
        };
      }

      case "unclaimed_thoughts": {
        const unclaimed = await this.voidStore.getUnclaimedThoughts();
        const answer = this.formatUnclaimedThoughtsAnswer(unclaimed);
        return {
          queryType,
          question,
          answer,
          data: unclaimed,
          timestamp: new Date().toISOString(),
        };
      }

      case "phases_without_risks": {
        const viewData = await this.loadViewData();
        const phasesWithoutRisks = this.findPhasesWithoutRisks(viewData.phases ?? [], viewData.risks ?? []);
        const answer = this.formatPhasesWithoutRisksAnswer(phasesWithoutRisks);
        return {
          queryType,
          question,
          answer,
          data: phasesWithoutRisks,
          timestamp: new Date().toISOString(),
        };
      }

      case "integrity_status": {
        let valid = false;
        let errors: string[] = [];

        try {
          const result = await this.integrity.verify(this.projectId);
          valid = result.valid;
          errors = result.errors;
        } catch {
          valid = false;
          errors = ["Integrity check failed to run"];
        }

        const answer = this.formatIntegrityAnswer(valid, errors);
        return {
          queryType,
          question,
          answer,
          data: { valid, errors },
          timestamp: new Date().toISOString(),
        };
      }

      case "cluster_count": {
        const viewData = await this.loadViewData();
        const count = viewData.clusters?.length ?? 0;
        const answer = `This project has ${count} cluster${count !== 1 ? "s" : ""} in the Reveal stage.`;
        return {
          queryType,
          question,
          answer,
          data: { count },
          timestamp: new Date().toISOString(),
        };
      }

      case "thought_count": {
        const thoughts = await this.voidStore.getAllThoughts();
        const count = thoughts.length;
        const answer = `This project has ${count} thought${count !== 1 ? "s" : ""} captured in the Void stage.`;
        return {
          queryType,
          question,
          answer,
          data: { count },
          timestamp: new Date().toISOString(),
        };
      }

      case "risk_summary": {
        const viewData = await this.loadViewData();
        const risks = viewData.risks ?? [];
        const answer = this.formatRiskSummaryAnswer(risks);
        return {
          queryType,
          question,
          answer,
          data: { risks },
          timestamp: new Date().toISOString(),
        };
      }

      case "unknown":
      default: {
        return {
          queryType: "unknown",
          question,
          answer: "I couldn't understand that question. Try asking about: pipeline state, unclaimed thoughts, phases without risks, integrity status, cluster count, thought count, or risk summary.",
          data: null,
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  private findPhasesWithoutRisks(phases: PathPhase[], risks: RiskEntry[]): PathPhase[] {
    const phasesWithRisks = new Set(risks.map(r => r.phaseId));
    return phases.filter(p => !phasesWithRisks.has(p.phaseId));
  }

  private formatPipelineStateAnswer(state: PipelineState): string {
    const parts: string[] = [];
    parts.push(`Void: ${state.void} (${state.thoughtCount} thoughts)`);
    parts.push(`Reveal: ${state.reveal} (${state.clusterCount} clusters)`);
    parts.push(`Constellation: ${state.constellation}`);
    parts.push(`Path: ${state.path} (${state.phaseCount} phases)`);
    parts.push(`Risk: ${state.risk} (${state.riskCount} risks)`);
    parts.push(`Autonomy: ${state.autonomy}`);
    return `Current pipeline state:\n${parts.join("\n")}`;
  }

  private formatUnclaimedThoughtsAnswer(thoughts: VoidThought[]): string {
    if (thoughts.length === 0) {
      return "There are no unclaimed thoughts. All thoughts have been processed.";
    }

    const summaries = thoughts.slice(0, 5).map((t, i) => {
      const preview = t.content.substring(0, 80) + (t.content.length > 80 ? "..." : "");
      return `${i + 1}. "${preview}" (${t.source})`;
    });

    let answer = `Found ${thoughts.length} unclaimed thought${thoughts.length !== 1 ? "s" : ""}:\n`;
    answer += summaries.join("\n");
    if (thoughts.length > 5) {
      answer += `\n...and ${thoughts.length - 5} more.`;
    }
    return answer;
  }

  private formatPhasesWithoutRisksAnswer(phases: PathPhase[]): string {
    if (phases.length === 0) {
      return "All phases have risk entries associated with them.";
    }

    const summaries = phases.map((p, i) => {
      return `${i + 1}. Phase ${p.ordinal}: ${p.name} - ${p.objective.substring(0, 60)}...`;
    });

    let answer = `Found ${phases.length} phase${phases.length !== 1 ? "s" : ""} without risk entries:\n`;
    answer += summaries.join("\n");
    return answer;
  }

  private formatIntegrityAnswer(valid: boolean, errors: string[]): string {
    if (valid) {
      return "Data integrity check PASSED. All files match their checksums.";
    }

    let answer = "Data integrity check FAILED. The following issues were found:\n";
    answer += errors.map(e => `- ${e}`).join("\n");
    return answer;
  }

  private formatRiskSummaryAnswer(risks: RiskEntry[]): string {
    if (risks.length === 0) {
      return "No risks have been identified yet.";
    }

    const byStatus = risks.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let answer = `Risk Summary (${risks.length} total):\n`;
    for (const [status, count] of Object.entries(byStatus)) {
      answer += `- ${status}: ${count}\n`;
    }

    const highRisks = risks.filter(r => r.likelihood === "high" || r.impact === "high");
    if (highRisks.length > 0) {
      answer += `\nHigh-priority risks:\n`;
      highRisks.slice(0, 3).forEach(r => {
        answer += `- ${r.description.substring(0, 80)}\n`;
      });
    }

    return answer;
  }
}

export function createPlanningAgentInterface(
  basePath: string,
  projectId: string,
): PlanningAgentInterface {
  return new PlanningAgentInterface(basePath, projectId);
}