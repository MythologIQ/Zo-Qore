/**
 * Planning Contracts - Reveal View
 * 
 * Reveal is the thought organization interface.
 * Clusters group related thoughts for synthesis.
 */

/**
 * A cluster of related thoughts in the Reveal view.
 * Represents organized, synthesized thinking.
 */
export interface RevealCluster {
  /** Unique identifier (UUID) */
  clusterId: string;
  
  /** Project this cluster belongs to */
  projectId: string;
  
  /** User-assigned cluster name/label */
  label: string;
  
  /** References to VoidThought.thoughtId values */
  thoughtIds: string[];
  
  /** Synthesis notes about this cluster */
  notes: string;
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  
  /** Whether this cluster is ready for Constellation */
  status: 'draft' | 'formed';
}

/**
 * Request to create a new cluster
 */
export interface CreateClusterRequest {
  projectId: string;
  label: string;
  notes?: string;
}

/**
 * Request to update a cluster
 */
export interface UpdateClusterRequest {
  clusterId: string;
  label?: string;
  notes?: string;
  status?: 'draft' | 'formed';
}

/**
 * Request to claim thoughts into a cluster
 */
export interface ClaimThoughtsRequest {
  clusterId: string;
  thoughtIds: string[];
}

/**
 * Filter options for listing clusters
 */
export interface ListClustersFilter {
  projectId: string;
  status?: 'draft' | 'formed';
  hasThoughts?: boolean;
}
