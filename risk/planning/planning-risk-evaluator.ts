/**
 * Planning Risk Evaluator
 *
 * Evaluates novelty and risk of planning mutations.
 * Hooks into the existing risk engine infrastructure.
 */

import type {
  PlanningAction,
  FullProjectState,
} from '@mythologiq/qore-contracts';
import { PlanningLedger } from '../../runtime/planning/PlanningLedger.js';

export type PlanningRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PlanningRiskAssessment {
  action: PlanningAction;
  riskLevel: PlanningRiskLevel;
  noveltyScore: number;
  isFirstOccurrence: boolean;
  recommendation: 'allow' | 'review' | 'block';
  factors: string[];
}

export interface PlanningRiskConfig {
  enableNoveltyTracking: boolean;
  firstActionBonus: number;
  cacheTTLMs: number;
}

const DEFAULT_CONFIG: PlanningRiskConfig = {
  enableNoveltyTracking: true,
  firstActionBonus: 0.3,
  cacheTTLMs: 5 * 60 * 1000,
};

const ACTION_RISK_MAP: Record<string, PlanningRiskLevel> = {
  'planning:void:create': 'low',
  'planning:void:update': 'low',
  'planning:void:delete': 'low',
  'planning:reveal:create': 'medium',
  'planning:reveal:update': 'low',
  'planning:reveal:delete': 'medium',
  'planning:reveal:claim': 'low',
  'planning:constellation:save': 'medium',
  'planning:constellation:clear': 'high',
  'planning:path:create': 'high',
  'planning:path:update': 'medium',
  'planning:path:delete': 'high',
  'planning:path:reorder': 'medium',
  'planning:risk:create': 'high',
  'planning:risk:update': 'medium',
  'planning:risk:delete': 'medium',
  'planning:autonomy:save': 'critical',
  'planning:autonomy:activate': 'critical',
};

const NOVELTY_WEIGHTS: Record<string, number> = {
  'planning:path:create': 0.8,
  'planning:risk:create': 0.7,
  'planning:autonomy:activate': 0.9,
  'planning:constellation:save': 0.5,
  'planning:reveal:create': 0.4,
  'planning:void:create': 0.1,
};

export class PlanningRiskEvaluator {
  private actionHistory: Map<string, number> = new Map();
  private cache: Map<string, { assessment: PlanningRiskAssessment; expires: number }> = new Map();
  private config: PlanningRiskConfig;
  private ledger?: PlanningLedger;

  constructor(config: Partial<PlanningRiskConfig> = {}, ledger?: PlanningLedger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ledger = ledger;
  }

  /**
   * Evaluate risk of a planning action
   */
  async evaluate(
    action: PlanningAction,
    projectId: string,
    projectState: FullProjectState,
  ): Promise<PlanningRiskAssessment> {
    const cacheKey = `${projectId}:${action}`;
    const cached = this.getCachedAssessment(cacheKey);
    if (cached) {
      return cached;
    }

    const baseRisk = this.getBaseRisk(action);
    const noveltyScore = await this.computeNoveltyScore(action, projectId, projectState);
    const isFirstOccurrence = this.isFirstAction(projectId, action);
    const factors = this.identifyRiskFactors(action, projectState, isFirstOccurrence, noveltyScore);

    let riskLevel = baseRisk;
    if (isFirstOccurrence) {
      riskLevel = this.boostRiskLevel(riskLevel, this.config.firstActionBonus);
    }

    const recommendation = this.determineRecommendation(riskLevel, noveltyScore);

    const assessment: PlanningRiskAssessment = {
      action,
      riskLevel,
      noveltyScore,
      isFirstOccurrence,
      recommendation,
      factors,
    };

    this.setCachedAssessment(cacheKey, assessment);
    return assessment;
  }

  /**
   * Record action occurrence for novelty tracking
   */
  recordAction(projectId: string, action: PlanningAction): void {
    const key = `${projectId}:${action}`;
    const count = this.actionHistory.get(key) || 0;
    this.actionHistory.set(key, count + 1);
  }

  /**
   * Get novelty metrics for reporting
   */
  getNoveltyMetrics(): { uniqueActions: number; totalActions: number; actionCounts: Record<string, number> } {
    const actionCounts: Record<string, number> = {};
    let totalActions = 0;

    for (const [key, count] of this.actionHistory.entries()) {
      actionCounts[key] = count;
      totalActions += count;
    }

    return {
      uniqueActions: this.actionHistory.size,
      totalActions,
      actionCounts,
    };
  }

  private getBaseRisk(action: PlanningAction): PlanningRiskLevel {
    return ACTION_RISK_MAP[action] || 'medium';
  }

  private async computeNoveltyScore(
    action: PlanningAction,
    projectId: string,
    _projectState: FullProjectState,
  ): Promise<number> {
    if (!this.config.enableNoveltyTracking) {
      return 0;
    }

    const key = `${projectId}:${action}`;
    const previousCount = this.actionHistory.get(key) || 0;

    if (previousCount === 0) {
      return NOVELTY_WEIGHTS[action] || 0.5;
    }

    return Math.max(0, 1 - (previousCount * 0.1));
  }

  private isFirstAction(projectId: string, action: PlanningAction): boolean {
    const key = `${projectId}:${action}`;
    const count = this.actionHistory.get(key);
    return count === undefined || count === 0;
  }

  private identifyRiskFactors(
    action: PlanningAction,
    projectState: FullProjectState,
    isFirst: boolean,
    novelty: number,
  ): string[] {
    const factors: string[] = [];

    if (isFirst) {
      factors.push('First occurrence of this action type');
    }

    if (novelty > 0.7) {
      factors.push('High novelty detected');
    }

    if (action.includes('delete') || action.includes('clear')) {
      factors.push('Destructive action');
    }

    if (action.includes('autonomy')) {
      factors.push('Affects execution guardrails');
    }

    if (action.includes('risk')) {
      factors.push('Modifies risk register');
    }

    const phases = projectState.phases ?? [];
    if (phases.length === 0 && action.includes('path')) {
      factors.push('Creating first phase in empty path');
    }

    const risks = projectState.risks ?? [];
    if (risks.length === 0 && action.includes('risk')) {
      factors.push('First risk entry');
    }

    return factors;
  }

  private boostRiskLevel(level: PlanningRiskLevel, bonus: number): PlanningRiskLevel {
    if (bonus >= 0.3) {
      if (level === 'low') return 'medium';
      if (level === 'medium') return 'high';
      if (level === 'high') return 'critical';
    }
    return level;
  }

  private determineRecommendation(riskLevel: PlanningRiskLevel, noveltyScore: number): 'allow' | 'review' | 'block' {
    if (riskLevel === 'critical') {
      return 'block';
    }
    if (riskLevel === 'high' || noveltyScore > 0.7) {
      return 'review';
    }
    return 'allow';
  }

  private getCachedAssessment(key: string): PlanningRiskAssessment | null {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.assessment;
    }
    this.cache.delete(key);
    return null;
  }

  private setCachedAssessment(key: string, assessment: PlanningRiskAssessment): void {
    this.cache.set(key, {
      assessment,
      expires: Date.now() + this.config.cacheTTLMs,
    });
  }
}

export function createPlanningRiskEvaluator(
  config?: Partial<PlanningRiskConfig>,
  ledger?: PlanningLedger,
): PlanningRiskEvaluator {
  return new PlanningRiskEvaluator(config, ledger);
}