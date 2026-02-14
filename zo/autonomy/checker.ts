/**
 * Autonomy Checker
 *
 * Checks project readiness for autonomous execution.
 *
 * @module zo/autonomy/checker
 */

import type { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import type { ReadinessCheck, AutonomyReadiness } from "./types.js";

export class AutonomyChecker {
  private readonly storage: ProjectTabStorage;

  constructor(db: DuckDBClient) {
    this.storage = new ProjectTabStorage(db);
  }

  async checkReadiness(projectId: string): Promise<AutonomyReadiness> {
    const checks: ReadinessCheck[] = [];

    checks.push(await this.checkRisksMitigated(projectId));
    checks.push(await this.checkGuardrailsDefined(projectId));
    checks.push(await this.checkPhasesScheduled(projectId));
    checks.push(await this.checkTasksCreated(projectId));
    checks.push(await this.checkContextAvailable(projectId));

    const blockerCount = checks.filter((c) => !c.passed && c.severity === "blocker").length;
    const warningCount = checks.filter((c) => !c.passed && c.severity === "warning").length;

    return {
      projectId,
      isReady: blockerCount === 0,
      checks,
      blockerCount,
      warningCount,
    };
  }

  private async checkRisksMitigated(projectId: string): Promise<ReadinessCheck> {
    const risks = await this.storage.listRisksForProject(projectId);
    const unmitigated = risks.filter((r) => r.status === "identified");

    return {
      name: "Risks Mitigated",
      passed: unmitigated.length === 0,
      reason: unmitigated.length === 0
        ? "All identified risks have been addressed"
        : `${unmitigated.length} risk(s) still unmitigated`,
      severity: "blocker",
    };
  }

  private async checkGuardrailsDefined(projectId: string): Promise<ReadinessCheck> {
    const risks = await this.storage.listRisksForProject(projectId);
    const guardrails = await this.storage.listGuardrailsForProject(projectId);
    const mitigated = risks.filter((r) => r.status === "mitigated");
    const withGuardrails = mitigated.filter((r) =>
      guardrails.some((g) => g.riskId === r.id)
    );

    const missing = mitigated.length - withGuardrails.length;
    return {
      name: "Guardrails Defined",
      passed: missing === 0,
      reason: missing === 0
        ? "All mitigated risks have guardrails"
        : `${missing} mitigated risk(s) missing guardrails`,
      severity: "warning",
    };
  }

  private async checkPhasesScheduled(projectId: string): Promise<ReadinessCheck> {
    const phases = await this.storage.listPhasesForProject(projectId);
    const unscheduled = phases.filter((p) => !p.startDate || !p.endDate);

    if (phases.length === 0) {
      return { name: "Phases Scheduled", passed: false, reason: "No phases defined", severity: "blocker" };
    }

    return {
      name: "Phases Scheduled",
      passed: unscheduled.length === 0,
      reason: unscheduled.length === 0
        ? "All phases have dates"
        : `${unscheduled.length} phase(s) unscheduled`,
      severity: "blocker",
    };
  }

  private async checkTasksCreated(projectId: string): Promise<ReadinessCheck> {
    const tasks = await this.storage.listTasksForProject(projectId);

    return {
      name: "Tasks Created",
      passed: tasks.length > 0,
      reason: tasks.length > 0
        ? `${tasks.length} task(s) ready for execution`
        : "No tasks created from path",
      severity: "blocker",
    };
  }

  private async checkContextAvailable(projectId: string): Promise<ReadinessCheck> {
    const project = await this.storage.getProject(projectId);

    return {
      name: "Context Available",
      passed: !!project,
      reason: project ? "Project context loaded" : "Project not found",
      severity: "blocker",
    };
  }
}
