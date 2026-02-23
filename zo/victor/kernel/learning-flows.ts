/**
 * Recursive Learning Data Flows
 * Implements the three digestive loops
 */

import { 
  LearningPacket, 
  LearningPacketValidator,
  OriginPhase,
  TriggerType 
} from './learning-schema';

/**
 * Flow 1: Debug Loop → Learning Packet
 * Every error generates a learning event
 */
export class DebugLearningFlow {
  constructor(private knowledgeGraph: KnowledgeGraphStorage) {}
  
  async captureError(
    error: Error, 
    context: {
      node?: string;
      stack?: string[];
      phase: string;
    }
  ): Promise<LearningPacket> {
    // 1. Generate Learning Packet
    const packet = LearningPacketValidator.toDebugPacket(error, context);
    
    // 2. Validate Schema
    const validation = LearningPacketValidator.validate(packet);
    if (!validation.valid) {
      throw new Error(`Invalid Learning Packet: ${validation.errors.join(', ')}`);
    }
    
    // 3. Index into Knowledge Graph
    await this.knowledgeGraph.index(packet);
    
    // 4. Update Frequency (if similar error exists)
    await this.updateFrequency(error.message);
    
    // 5. Inject Guardrails into next Audit phase
    if (packet.debt_impact >= 5) {
      await this.injectGuardrail(packet);
    }
    
    return packet;
  }
  
  private async updateFrequency(errorPattern: string) {
    // Check for similar errors and increment frequency
    const similar = await this.knowledgeGraph.query({
      trigger_type: TriggerType.LOGIC_ERROR,
      lesson: { $regex: errorPattern.substring(0, 20) }
    });
    
    if (similar.length > 0) {
      const updated = similar[0];
      updated.frequency = (updated.frequency || 0) + 1;
      await this.knowledgeGraph.update(updated.id, updated);
    }
  }
  
  private async injectGuardrail(packet: LearningPacket) {
    // Create Audit Constraint packet
    const guardrail = LearningPacketValidator.toAuditConstraintPacket({
      rule: `CHECK: ${packet.lesson}`,
      violation: `Prevent: ${packet.lesson}`,
      severity: packet.debt_heat
    });
    
    // Index for next Audit phase
    await this.knowledgeGraph.index(guardrail);
  }
}

/**
 * Flow 2: Substantiate Consolidation → Learning Packet
 * Compare Plan vs Reality, create delta report
 */
export class SubstantiateLearningFlow {
  constructor(private knowledgeGraph: KnowledgeGraphStorage) {}
  
  async consolidate(
    plan: {
      expectedOutcomes: any;
      timeline: number;
      quality: number;
    },
    reality: {
      actualOutcomes: any;
      timeline: number;
      quality: number;
      unexpectedIssues?: string[];
    },
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<{
    packet: LearningPacket;
    deltaReport: DeltaReport;
  }> {
    // 1. Calculate Delta
    const delta = this.calculateDelta(plan, reality);
    
    // 2. Extract Lessons
    const lessons = this.extractLessons(delta, reality.unexpectedIssues || []);
    
    // 3. Generate Learning Packet
    const packet = LearningPacketValidator.toSubstantiatePacket({
      planned: plan,
      actual: reality,
      lessons
    });
    
    // 4. Enrich with project context
    packet.project_id = projectContext.projectId;
    packet.session_id = projectContext.sessionId;
    packet.context_node = projectContext.node;
    
    // 5. Validate Schema
    const validation = LearningPacketValidator.validate(packet);
    if (!validation.valid) {
      throw new Error(`Invalid Learning Packet: ${validation.errors.join(', ')}`);
    }
    
    // 6. Update Heat Map (Global Loop)
    if (delta.timeline_delta > 0.5) {
      await this.updateHeatMap({
        node: projectContext.node || 'root',
        heat: packet.debt_impact,
        reason: 'Timeline overrun'
      });
    }
    
    // 7. Index into Knowledge Graph
    await this.knowledgeGraph.index(packet);
    
    // 8. Inject into next Audit phase (Local Loop)
    await this.injectNextCycleLessons(lessons, projectContext);
    
    return { packet, deltaReport: delta };
  }
  
  private calculateDelta(plan: any, reality: any): DeltaReport {
    return {
      timeline_delta: (reality.timeline - plan.timeline) / plan.timeline,
      quality_delta: reality.quality - plan.quality,
      unexpected_issues: reality.unexpectedIssues || [],
      lessons_learned: this.analyzeDeltas(plan, reality)
    };
  }
  
  private extractLessons(delta: DeltaReport, issues: string[]): string[] {
    const lessons: string[] = [];
    
    if (delta.timeline_delta > 0.3) {
      lessons.push('Planning timelines are underestimated by 30%+');
    }
    if (delta.quality_delta < 0) {
      lessons.push('Quality expectations not met, adjust acceptance criteria');
    }
    if (issues.length > 0) {
      lessons.push(`Unexpected issues discovered: ${issues.join(', ')}`);
    }
    
    return lessons;
  }
  
  private async updateHeatMap(update: {
    node: string;
    heat: number;
    reason: string;
  }) {
    await this.knowledgeGraph.updateHeatmap({
      node: update.node,
      heat: update.heat,
      reason: update.reason
    });
  }
  
  private async injectNextCycleLessons(
    lessons: string[], 
    context: { projectId: string; sessionId: string }
  ) {
    // Inject lessons as Audit Constraints for next cycle
    for (const lesson of lessons) {
      const packet = LearningPacketValidator.toAuditConstraintPacket({
        rule: `LESSON: ${lesson}`,
        violation: `Check ${lesson} during planning`,
        severity: 'Medium'
      });
      
      packet.project_id = context.projectId;
      packet.session_id = context.sessionId;
      
      await this.knowledgeGraph.index(packet);
    }
  }
}

/**
 * Flow 3: Audit Gate → Knowledge Check
 * Validate plan against learned constraints before implementation
 */
export class AuditGateFlow {
  constructor(private knowledgeGraph: KnowledgeGraphStorage) {}
  
  async validatePlan(
    plan: {
      stack: string[];
      tasks: any[];
      timeline: number;
    },
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<AuditGateResult> {
    // 1. Query Knowledge Graph for Guardrails
    const constraints = await this.knowledgeGraph.query({
      origin_phase: OriginPhase.DEBUG,
      trigger_type: TriggerType.LOGIC_ERROR,
      context_stack: { $in: plan.stack }
    });
    
    // 2. Query for Universal Truths
    const universalTruths = await this.knowledgeGraph.query({
      universal_truth: true,
      context_stack: { $in: plan.stack }
    });
    
    // 3. Query for Similar Project Lessons
    const similarLessons = await this.knowledgeGraph.query({
      context_stack: { $in: plan.stack },
      origin_phase: OriginPhase.SUBSTANTIATE
    });
    
    // 4. Validate Plan Against Constraints
    const violations = this.checkViolations(plan, constraints);
    
    // 5. Generate Audit Result
    const result: AuditGateResult = {
      passed: violations.length === 0,
      violations,
      enriched_with: {
        guardrails: constraints,
        universal_truths,
        similar_lessons: similarLessons
      },
      timestamp: Date.now()
    };
    
    // 6. If violations, reject plan back to Brainstorming
    if (!result.passed) {
      const rejectionPacket = LearningPacketValidator.toAuditConstraintPacket({
        rule: 'Plan violates learned guardrails',
        violation: violations.join('; '),
        severity: 'High'
      });
      
      rejectionPacket.project_id = projectContext.projectId;
      rejectionPacket.session_id = projectContext.sessionId;
      rejectionPacket.context_node = projectContext.node;
      
      await this.knowledgeGraph.index(rejectionPacket);
      
      result.rejection_reason = 'Plan rejected - return to Brainstorming phase';
      result.rejection_packet = rejectionPacket;
    }
    
    return result;
  }
  
  private checkViolations(
    plan: any, 
    constraints: LearningPacket[]
  ): string[] {
    const violations: string[] = [];
    
    for (const constraint of constraints) {
      if (constraint.guardrail_pattern) {
        const regex = new RegExp(constraint.guardrail_pattern);
        const planString = JSON.stringify(plan);
        
        if (regex.test(planString)) {
          violations.push(constraint.audit_constraint || constraint.lesson);
        }
      }
    }
    
    return violations;
  }
}

/**
 * Support Types
 */
interface KnowledgeGraphStorage {
  index(packet: LearningPacket): Promise<void>;
  query(criteria: any): Promise<LearningPacket[]>;
  update(id: string, packet: LearningPacket): Promise<void>;
  updateHeatmap(update: { node: string; heat: number; reason: string }): Promise<void>;
}

interface DeltaReport {
  timeline_delta: number;      // Normalized (0-1)
  quality_delta: number;        // Normalized (-1 to 1)
  unexpected_issues: string[];
  lessons_learned: string[];
}

interface AuditGateResult {
  passed: boolean;
  violations: string[];
  rejection_reason?: string;
  rejection_packet?: LearningPacket;
  enriched_with: {
    guardrails: LearningPacket[];
    universal_truths: LearningPacket[];
    similar_lessons: LearningPacket[];
  };
  timestamp: number;
}
