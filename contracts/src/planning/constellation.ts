/**
 * Planning Contracts - Constellation View
 * 
 * Constellation is the cluster relationship visualization.
 * Maps how clusters relate to each other.
 */

/**
 * A node in the constellation map.
 * Maps 1:1 to a RevealCluster.
 */
export interface ConstellationNode {
  /** Unique identifier for this node */
  nodeId: string;
  
  /** Reference to RevealCluster.clusterId */
  clusterId: string;
  
  /** Layout coordinates for visualization */
  position: {
    x: number;
    y: number;
  };
}

/**
 * An edge between constellation nodes.
 * Represents a relationship between clusters.
 */
export interface ConstellationEdge {
  /** Unique identifier for this edge */
  edgeId: string;
  
  /** Source node (ConstellationNode.nodeId) */
  fromNodeId: string;
  
  /** Target node (ConstellationNode.nodeId) */
  toNodeId: string;
  
  /** User-described relationship type */
  relationship: string;
  
  /** Relationship strength (0.0-1.0) */
  weight: number;
}

/**
 * The complete constellation map for a project.
 * Visualizes cluster relationships.
 */
export interface ConstellationMap {
  /** Unique identifier for this map */
  constellationId: string;
  
  /** Project this map belongs to */
  projectId: string;
  
  /** All nodes in the map */
  nodes: ConstellationNode[];
  
  /** All edges in the map */
  edges: ConstellationEdge[];
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  
  /** Whether this map is ready for Path planning */
  status: 'draft' | 'mapped';
}

/**
 * Request to save a constellation map
 */
export interface SaveConstellationMapRequest {
  projectId: string;
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
}
