/**
 * SVG Learning Overlay
 * Dynamic visualization based on Debt_Impact and Heat Map data
 */

import { LearningPacket } from './learning-schema';

export class SVGLearningOverlay {
  private heatmapData: Map<string, HeatMapNode> = new Map();
  
  constructor() {}
  
  /**
   * Apply Learning Overlay to SVG
   * Modifies colors and adds visual indicators based on debt impact
   */
  async applyOverlay(
    svgContent: string,
    learningPackets: LearningPacket[]
  ): Promise<string> {
    // 1. Build Heat Map from learning data
    this.buildHeatMap(learningPackets);
    
    // 2. Parse SVG
    const svgDoc = this.parseSVG(svgContent);
    
    // 3. Apply color modifications
    const overlayedSVG = this.applyColorModifications(svgDoc);
    
    // 4. Add learning indicators
    const annotatedSVG = this.addLearningIndicators(overlayedSVG);
    
    // 5. Return modified SVG
    return this.serializeSVG(annotatedSVG);
  }
  
  private buildHeatMap(packets: LearningPacket[]) {
    // Aggregate debt impact per node
    for (const packet of packets) {
      if (!packet.context_node) continue;
      
      const node = this.heatmapData.get(packet.context_node);
      
      if (node) {
        node.totalImpact += packet.debt_impact;
        node.frequency += packet.frequency || 1;
        node.lastUpdate = packet.timestamp;
        node.lessons.push(packet.lesson);
      } else {
        this.heatmapData.set(packet.context_node, {
          id: packet.context_node,
          totalImpact: packet.debt_impact,
          frequency: packet.frequency || 1,
          lastUpdate: packet.timestamp,
          lessons: [packet.lesson],
          heat: this.calculateNodeHeat(packet.debt_impact)
        });
      }
    }
  }
  
  private parseSVG(svg: string): SVGDocument {
    // Parse SVG (simplified, production would use proper SVG parser)
    return {
      content: svg,
      nodes: this.extractSVGNodes(svg)
    };
  }
  
  private extractSVGNodes(svg: string): SVGNode[] {
    const nodes: SVGNode[] = [];
    
    // Extract nodes with IDs (simplified regex-based extraction)
    const idPattern = /id=["']([^"']+)["']/g;
    const classPattern = /class=["']([^"']+)["']/g;
    
    let idMatch;
    while ((idMatch = idPattern.exec(svg)) !== null) {
      const id = idMatch[1];
      
      // Check if there's an associated class
      let className = '';
      const classMatch = svg.substring(idMatch.index - 50, idMatch.index + 50).match(classPattern);
      if (classMatch) {
        className = classMatch[1];
      }
      
      nodes.push({ id, className });
    }
    
    return nodes;
  }
  
  private applyColorModifications(svgDoc: SVGDocument): SVGDocument {
    let modifiedContent = svgDoc.content;
    
    // Apply color modifications based on heat map
    for (const [nodeId, heatData] of this.heatmapData.entries()) {
      const color = this.getHeatColor(heatData.heat);
      
      // Replace colors for this node
      const nodeIdPattern = new RegExp(`id=["']${nodeId}["']`, 'g');
      modifiedContent = modifiedContent.replace(nodeIdPattern, `id="${nodeId}" data-heat="${heatData.heat}"`);
      
      // Modify fill and stroke colors
      modifiedContent = this.applyColorToNode(modifiedContent, nodeId, color);
    }
    
    return { ...svgDoc, content: modifiedContent };
  }
  
  private applyColorToNode(svg: string, nodeId: string, color: HeatColor): string {
    // Apply fill and stroke colors based on heat
    const pattern = new RegExp(`id=["']${nodeId}["'][^>]*fill=["'][^"']*["']`, 'g');
    
    return svg.replace(pattern, `id="${nodeId}" fill="${color.fill}" stroke="${color.stroke}"`);
  }
  
  private addLearningIndicators(svgDoc: SVGDocument): SVGDocument {
    let modifiedContent = svgDoc.content;
    
    // Add learning indicators to critical nodes
    for (const [nodeId, heatData] of this.heatmapData.entries()) {
      if (heatData.heat >= 'High' || heatData.heat === 'Critical') {
        const indicator = this.createLearningIndicator(nodeId, heatData);
        
        // Insert indicator after the node
        const nodeIdPattern = new RegExp(`(<[^>]*id=["']${nodeId}["'][^>]*>)`, 'g');
        modifiedContent = modifiedContent.replace(
          nodeIdPattern,
          `$1${indicator}`
        );
      }
    }
    
    return { ...svgDoc, content: modifiedContent };
  }
  
  private createLearningIndicator(nodeId: string, heatData: HeatMapNode): string {
    const bgColor = heatData.heat === 'Critical' ? '#ef4444' :
                   heatData.heat === 'High' ? '#f97316' :
                   heatData.heat === 'Medium' ? '#eab308' : '#22c55e';
    
    return `
      <!-- Learning Indicator -->
      <circle 
        cx="10" cy="-10" r="6" 
        fill="${bgColor}" 
        stroke="white" 
        stroke-width="1"
        class="learning-indicator"
      />
      <title>
        Heat: ${heatData.heat} (Impact: ${heatData.totalImpact})
        Lessons: ${heatData.lessons.join(', ')}
        Frequency: ${heatData.frequency}x
      </title>
    `;
  }
  
  private getHeatColor(heat: 'Low' | 'Medium' | 'High' | 'Critical'): HeatColor {
    const colors: Record<string, HeatColor> = {
      'Low': { fill: '#dcfce7', stroke: '#22c55e' },      // Green - Stable
      'Medium': { fill: '#fef9c3', stroke: '#eab308' },   // Yellow - Moderate
      'High': { fill: '#fed7aa', stroke: '#f97316' },    // Orange - Warning
      'Critical': { fill: '#fecaca', stroke: '#ef4444' }  // Red - Debt-heavy
    };
    
    return colors[heat];
  }
  
  private calculateNodeHeat(impact: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (impact >= 8) return 'Critical';
    if (impact >= 5) return 'High';
    if (impact >= 2) return 'Medium';
    return 'Low';
  }
  
  private serializeSVG(svgDoc: SVGDocument): string {
    return svgDoc.content;
  }
}

/**
 * Support Types
 */
interface SVGDocument {
  content: string;
  nodes: SVGNode[];
}

interface SVGNode {
  id: string;
  className: string;
}

interface HeatMapNode {
  id: string;
  totalImpact: number;
  frequency: number;
  lastUpdate: number;
  lessons: string[];
  heat: 'Low' | 'Medium' | 'High' | 'Critical';
}

interface HeatColor {
  fill: string;
  stroke: string;
}

/**
 * CSS Classes for SVG Learning Overlay
 */
export const SVGLearningCSS = `
.learning-indicator {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.heat-critical {
  fill: #fecaca !important;
  stroke: #ef4444 !important;
}

.heat-high {
  fill: #fed7aa !important;
  stroke: #f97316 !important;
}

.heat-medium {
  fill: #fef9c3 !important;
  stroke: #eab308 !important;
}

.heat-low {
  fill: #dcfce7 !important;
  stroke: #22c55e !important;
}
`;
