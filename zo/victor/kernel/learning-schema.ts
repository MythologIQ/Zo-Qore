/**
 * Learning Event Schema
 * Standardized packet for all recursive learning events
 */

export enum OriginPhase {
  DEBUG = 'Debug',
  SUBSTANTIATE = 'Substantiate',
  AUDIT = 'Audit',
  PLAN = 'Plan'
}

export enum TriggerType {
  LOGIC_ERROR = 'Logic Error',
  REFACTOR = 'Refactor',
  PERFORMANCE_GAIN = 'Performance Gain',
  SYNTAX_ERROR = 'Syntax Error',
  DEPENDENCY_ISSUE = 'Dependency Issue',
  ARCHITECTURAL_PATTERN = 'Architectural Pattern',
  SECURITY_VULNERABILITY = 'Security Vulnerability',
  BEST_PRACTICE = 'Best Practice'
}

export interface LearningPacket {
  // Core Identification
  id: string;                    // UUID v4
  timestamp: number;               // Unix timestamp (ms)
  origin_phase: OriginPhase;        // Where learning occurred
  
  // Context
  context_node?: string;            // Link to specific Mind Map node
  context_stack?: string[];        // Tech stack tags
  project_id: string;             // Project identifier
  session_id: string;             // Development session
  
  // Learning Content
  trigger_type: TriggerType;       // Why are we learning this?
  lesson: string;                 // The distilled "Universal Truth"
  
  // Actionable Output
  audit_constraint?: string;         // New rule for future Audit phases
  guardrail_pattern?: string;      // Regex pattern to prevent recurrences
  
  // Impact Analysis
  debt_impact: number;            // Heat Map score (-10 to +10)
  debt_heat: 'Low' | 'Medium' | 'High' | 'Critical';
  frequency?: number;               // How often this occurs
  
  // Metadata
  tags: string[];                 // Free-form classification tags
  universal_truth?: boolean;         // Cross-project applicable?
  related_events?: string[];        // Links to related learning events
  
  // Verification
  verified_at?: number;            // When this was confirmed effective
  effectiveness_score?: number;    // 0-1, how well the lesson worked
}

/**
 * Schema Validation
 */
export class LearningPacketValidator {
  static validate(packet: Partial<LearningPacket>): ValidationResult {
    const errors: string[] = [];
    
    if (!packet.id) errors.push('id is required');
    if (!packet.timestamp) errors.push('timestamp is required');
    if (!packet.origin_phase) errors.push('origin_phase is required');
    if (!packet.trigger_type) errors.push('trigger_type is required');
    if (!packet.lesson) errors.push('lesson is required');
    if (packet.debt_impact === undefined) errors.push('debt_impact is required');
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static generate(context: {
    origin: OriginPhase;
    trigger: TriggerType;
    lesson: string;
    impact: number;
    context?: string;
  }): LearningPacket {
    return {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      origin_phase: context.origin,
      trigger_type: context.trigger,
      lesson: context.lesson,
      debt_impact: context.impact,
      debt_heat: this.calculateHeat(context.impact),
      project_id: 'zo-qore-v1',
      session_id: crypto.randomUUID(),
      tags: [context.trigger, context.origin],
      context_node: context.context,
      universal_truth: false
    };
  }
  
  static calculateHeat(impact: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (impact >= 8) return 'Critical';
    if (impact >= 5) return 'High';
    if (impact >= 2) return 'Medium';
    return 'Low';
  }
  
  static toDebugPacket(error: Error, context: {
    node?: string;
    stack?: string[];
  }): LearningPacket {
    const trigger = this.classifyError(error);
    
    return this.generate({
      origin: OriginPhase.DEBUG,
      trigger: trigger.type,
      lesson: `Error: ${error.message}`,
      impact: this.estimateImpact(trigger.type),
      context: context.node,
      context_stack: context.stack
    });
  }
  
  static toSubstantiatePacket(delta: {
    planned: any;
    actual: any;
    lessons: string[];
  }): LearningPacket {
    const impact = delta.timeline_delta > 0 ? -3 : delta.quality_delta > 0 ? 5 : 0;
    
    return {
      ...this.generate({
        origin: OriginPhase.SUBSTANTIATE,
        trigger: TriggerType.PERFORMANCE_GAIN,
        lesson: `Delta Analysis: ${delta.lessons.join(', ')}`,
        impact
      }),
      frequency: 1
    };
  }
  
  static toAuditConstraintPacket(lesson: {
    rule: string;
    violation: string;
    severity: 'Low' | 'Medium' | 'High' | 'Critical'
  }): LearningPacket {
    return {
      ...this.generate({
        origin: OriginPhase.AUDIT,
        trigger: TriggerType.LOGIC_ERROR,
        lesson: `Audit Constraint: ${lesson.rule}`,
        impact: lesson.severity === 'Critical' ? 8 : 
                 lesson.severity === 'High' ? 5 :
                 lesson.severity === 'Medium' ? 2 : 0
      }),
      audit_constraint: lesson.rule,
      guardrail_pattern: this.extractPattern(lesson.violation)
    };
  }
  
  private static classifyError(error: Error): { type: TriggerType; impact: number } {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('syntax')) return { type: TriggerType.SYNTAX_ERROR, impact: 3 };
    if (msg.includes('dependency')) return { type: TriggerType.DEPENDENCY_ISSUE, impact: 4 };
    if (msg.includes('logic')) return { type: TriggerType.LOGIC_ERROR, impact: 5 };
    if (msg.includes('refactor')) return { type: TriggerType.REFACTOR, impact: -2 };
    
    return { type: TriggerType.LOGIC_ERROR, impact: 4 };
  }
  
  private static estimateImpact(trigger: TriggerType): number {
    const impacts = {
      [TriggerType.SYNTAX_ERROR]: 3,
      [TriggerType.DEPENDENCY_ISSUE]: 4,
      [TriggerType.LOGIC_ERROR]: 5,
      [TriggerType.REFACTOR]: -2,
      [TriggerType.PERFORMANCE_GAIN]: 5,
      [TriggerType.ARCHITECTURAL_PATTERN]: -3,
      [TriggerType.SECURITY_VULNERABILITY]: 8
    };
    
    return impacts[trigger] || 0;
  }
  
  private static extractPattern(violation: string): string {
    // Simple regex extraction from violation message
    // e.g., "state is locally scoped if X exists" -> /state.*locally.*scoped/
    const parts = violation.split(' ');
    return parts.filter(p => p.length > 3).join('.*');
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
