/**
 * Victor Kernel - Unified Recursive Learning System
 * Integrates all learning flows into Qore runtime
 */

import { 
  LearningPacket, 
  LearningPacketValidator,
  OriginPhase 
} from './learning-schema';

import { 
  DebugLearningFlow,
  SubstantiateLearningFlow,
  AuditGateFlow 
} from './learning-flows';

import { SVGLearningOverlay, SVGLearningCSS } from './svg-learning-overlay';

/**
 * Knowledge Graph Implementation (Zo-backed)
 * Uses Zo Datasets for long-term storage
 */
class ZoKnowledgeGraph {
  private datasetPath: string = '/home/workspace/.victor-learning.duckdb';
  private db: any; // DuckDB instance
  
  async initialize() {
    // Initialize DuckDB for learning storage
    this.db = await this.initDB();
    await this.createTables();
  }
  
  private async initDB() {
    const duckdb = await import('duckdb');
    return new duckdb.Database(this.datasetPath);
  }
  
  private async createTables() {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS learning_events (
        id VARCHAR PRIMARY KEY,
        timestamp BIGINT,
        origin_phase VARCHAR,
        context_node VARCHAR,
        context_stack JSON,
        project_id VARCHAR,
        session_id VARCHAR,
        trigger_type VARCHAR,
        lesson TEXT,
        audit_constraint TEXT,
        guardrail_pattern TEXT,
        debt_impact INTEGER,
        debt_heat VARCHAR,
        frequency INTEGER,
        tags JSON,
        universal_truth BOOLEAN,
        related_events JSON,
        verified_at BIGINT,
        effectiveness_score FLOAT
      )
    `);
    
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS heatmap (
        node_id VARCHAR PRIMARY KEY,
        heat FLOAT,
        last_update BIGINT,
        lessons JSON
      )
    `);
  }
  
  async index(packet: LearningPacket): Promise<void> {
    await this.db.run(`
      INSERT INTO learning_events (
        id, timestamp, origin_phase, context_node, context_stack,
        project_id, session_id, trigger_type, lesson,
        audit_constraint, guardrail_pattern, debt_impact, debt_heat,
        frequency, tags, universal_truth, related_events,
        verified_at, effectiveness_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      packet.id, packet.timestamp, packet.origin_phase,
      packet.context_node, JSON.stringify(packet.context_stack || []),
      packet.project_id, packet.session_id, packet.trigger_type,
      packet.lesson, packet.audit_constraint, packet.guardrail_pattern,
      packet.debt_impact, packet.debt_heat, packet.frequency || 0,
      JSON.stringify(packet.tags), packet.universal_truth || false,
      JSON.stringify(packet.related_events || []),
      packet.verified_at, packet.effectiveness_score || 0
    ]);
  }
  
  async query(criteria: any): Promise<LearningPacket[]> {
    // Build dynamic query based on criteria
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (criteria.origin_phase) {
      conditions.push('origin_phase = ?');
      params.push(criteria.origin_phase);
    }
    
    if (criteria.trigger_type) {
      conditions.push('trigger_type = ?');
      params.push(criteria.trigger_type);
    }
    
    if (criteria.context_stack) {
      conditions.push('context_stack @> ?');
      params.push(JSON.stringify([criteria.context_stack]));
    }
    
    if (criteria.universal_truth !== undefined) {
      conditions.push('universal_truth = ?');
      params.push(criteria.universal_truth);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const results = await this.db.all(`
      SELECT * FROM learning_events ${whereClause}
      ORDER BY timestamp DESC
      LIMIT 100
    `, params);
    
    return results.map((r: any) => ({
      ...r,
      context_stack: JSON.parse(r.context_stack),
      tags: JSON.parse(r.tags),
      related_events: JSON.parse(r.related_events)
    }));
  }
  
  async update(id: string, packet: LearningPacket): Promise<void> {
    await this.db.run(`
      UPDATE learning_events SET
        verified_at = ?,
        effectiveness_score = ?
      WHERE id = ?
    `, [packet.verified_at, packet.effectiveness_score, id]);
  }
  
  async updateHeatmap(update: { node: string; heat: number; reason: string }): Promise<void> {
    const existing = await this.db.get(`
      SELECT * FROM heatmap WHERE node_id = ?
    `, [update.node]);
    
    if (existing) {
      await this.db.run(`
        UPDATE heatmap SET
          heat = ?,
          last_update = ?,
          lessons = json_append(lessons, ?)
        WHERE node_id = ?
      `, [update.heat, Date.now(), update.reason, update.node]);
    } else {
      await this.db.run(`
        INSERT INTO heatmap (node_id, heat, last_update, lessons)
        VALUES (?, ?, ?, ?)
      `, [update.node, update.heat, Date.now(), JSON.stringify([update.reason])]);
    }
  }
}

/**
 * Victor Kernel - Main Class
 */
export class VictorKernelUnified {
  private knowledgeGraph: ZoKnowledgeGraph;
  private debugFlow: DebugLearningFlow;
  private substantiateFlow: SubstantiateLearningFlow;
  private auditGateFlow: AuditGateFlow;
  private svgOverlay: SVGLearningOverlay;
  
  constructor() {
    this.knowledgeGraph = new ZoKnowledgeGraph();
    
    // Initialize flows
    this.debugFlow = new DebugLearningFlow(this.knowledgeGraph);
    this.substantiateFlow = new SubstantiateLearningFlow(this.knowledgeGraph);
    this.auditGateFlow = new AuditGateFlow(this.knowledgeGraph);
    this.svgOverlay = new SVGLearningOverlay();
  }
  
  async initialize() {
    console.log('Victor Kernel: Initializing Recursive Learning System...');
    await this.knowledgeGraph.initialize();
    console.log('Victor Kernel: Knowledge Graph ready');
  }
  
  // Phase 1: Plan (Enriched with Knowledge Graph)
  async planWithKnowledge(
    requirements: {
      stack: string[];
      tasks: any[];
      timeline: number;
    },
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<EnrichedPlan> {
    console.log('Victor Kernel: Querying Knowledge Graph for best practices...');
    
    // Query for similar project lessons
    const similarLessons = await this.knowledgeGraph.query({
      context_stack: { $in: requirements.stack },
      origin_phase: OriginPhase.SUBSTANTIATE
    });
    
    // Query for universal truths
    const universalTruths = await this.knowledgeGraph.query({
      universal_truth: true,
      context_stack: { $in: requirements.stack }
    });
    
    // Enrich requirements with learned insights
    const enrichedPlan = {
      ...requirements,
      enriched_with: {
        similar_lessons: similarLessons,
        universal_truths,
        suggested_guardrails: this.extractGuardrails(similarLessons)
      }
    };
    
    console.log(`Victor Kernel: Plan enriched with ${similarLessons.length} lessons and ${universalTruths.length} universal truths`);
    
    return enrichedPlan;
  }
  
  // Phase 2: Audit Gate (Validates against learned constraints)
  async auditGate(
    plan: any,
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<AuditGateResult> {
    console.log('Victor Kernel: Running Audit Gate...');
    
    return await this.auditGateFlow.validatePlan(plan, projectContext);
  }
  
  // Phase 3: Debug (Capture learning from errors)
  async captureDebugLearning(
    error: Error,
    context: {
      node?: string;
      stack?: string[];
      phase: string;
    },
    projectContext: {
      projectId: string;
      sessionId: string;
    }
  ): Promise<LearningPacket> {
    console.log('Victor Kernel: Capturing debug learning event...');
    
    return await this.debugFlow.captureError(error, {
      ...context,
      project_id: projectContext.projectId,
      session_id: projectContext.sessionId
    });
  }
  
  // Phase 4: Substantiate (Consolidate learning, update Atlas)
  async substantiatePhase(
    plan: any,
    reality: any,
    projectContext: {
      projectId: string;
      sessionId: string;
      node?: string;
    }
  ): Promise<SubstantiationResult> {
    console.log('Victor Kernel: Consolidating substantiation learning...');
    
    const result = await this.substantiateFlow.consolidate(
      plan,
      reality,
      projectContext
    );
    
    // Update Mind Map with Learning Overlay
    if (projectContext.node) {
      const learningPackets = await this.knowledgeGraph.query({
        context_node: projectContext.node
      });
      
      const svg = await this.applyLearningOverlay(result.svgContent, learningPackets);
      result.overlayedSVG = svg;
    }
    
    return result;
  }
  
  // SVG Visualization with Learning Overlay
  async applyLearningOverlay(svgContent: string, learningPackets: LearningPacket[]): Promise<string> {
    console.log('Victor Kernel: Applying learning overlay to SVG...');
    return await this.svgOverlay.applyOverlay(svgContent, learningPackets);
  }
  
  // Get Heat Map for visualization
  async getHeatMap(): Promise<Map<string, HeatMapNode>> {
    const results = await this.knowledgeGraph.query({
      origin_phase: OriginPhase.DEBUG,
      trigger_type: 'Logic Error'
    });
    
    const heatmap = new Map<string, HeatMapNode>();
    
    for (const packet of results) {
      if (!packet.context_node) continue;
      
      const node = heatmap.get(packet.context_node);
      
      if (node) {
        node.totalImpact += packet.debt_impact;
        node.frequency += packet.frequency || 1;
        node.lastUpdate = packet.timestamp;
        node.lessons.push(packet.lesson);
      } else {
        heatmap.set(packet.context_node, {
          id: packet.context_node,
          totalImpact: packet.debt_impact,
          frequency: packet.frequency || 1,
          lastUpdate: packet.timestamp,
          lessons: [packet.lesson],
          heat: this.calculateNodeHeat(packet.debt_impact)
        });
      }
    }
    
    return heatmap;
  }
  
  private extractGuardrails(lessons: any[]): string[] {
    return lessons
      .filter(l => l.audit_constraint)
      .map(l => l.audit_constraint);
  }
  
  private calculateNodeHeat(impact: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (impact >= 8) return 'Critical';
    if (impact >= 5) return 'High';
    if (impact >= 2) return 'Medium';
    return 'Low';
  }
}

/**
 * Support Types
 */
interface EnrichedPlan {
  stack: string[];
  tasks: any[];
  timeline: number;
  enriched_with: {
    similar_lessons: any[];
    universal_truths: any[];
    suggested_guardrails: string[];
  };
}

interface AuditGateResult {
  passed: boolean;
  violations: string[];
  rejection_reason?: string;
  rejection_packet?: any;
  enriched_with: {
    guardrails: any[];
    universal_truths: any[];
    similar_lessons: any[];
  };
  timestamp: number;
}

interface SubstantiationResult {
  packet: LearningPacket;
  deltaReport: any;
  svgContent: string;
  overlayedSVG?: string;
}

interface HeatMapNode {
  id: string;
  totalImpact: number;
  frequency: number;
  lastUpdate: number;
  lessons: string[];
  heat: 'Low' | 'Medium' | 'High' | 'Critical';
}

// Export for use in Zo runtime
export { VictorKernelUnified, SVGLearningCSS };
