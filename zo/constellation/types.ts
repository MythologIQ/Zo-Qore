/**
 * Constellation UI Types
 *
 * Interfaces for hierarchical and spatial cluster visualization.
 *
 * @module zo/constellation/types
 */

/**
 * Current constellation view mode.
 */
export type ConstellationView = "hierarchical" | "spatial";

/**
 * Navigation state for spatial view.
 */
export interface ViewportState {
  x: number;
  y: number;
  scale: number;
  velocityX: number;
  velocityY: number;
}

/**
 * A hierarchical cluster node.
 */
export interface HierarchicalCluster {
  id: string;
  name: string;
  theme: string;
  thoughtIds: string[];
  coherenceScore: number;
  isExpanded: boolean;
  connections: string[];
}

/**
 * A spatial cluster with physics properties.
 */
export interface SpatialCluster {
  id: string;
  name: string;
  theme: string;
  thoughtIds: string[];
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  coherenceScore: number;
  connections: string[];
}

/**
 * Complete constellation view state.
 */
export interface ConstellationState {
  projectId: string;
  view: ConstellationView;
  clusters: HierarchicalCluster[];
  spatialClusters: SpatialCluster[];
  thoughts: Array<{ id: string; content: string; clusterId: string }>;
  viewport: ViewportState;
  selectedClusterId: string | null;
  focusedClusterId: string | null;
}

/**
 * Events emitted during constellation interaction.
 */
export type ConstellationEvent =
  | { type: "view_changed"; view: ConstellationView }
  | { type: "cluster_expanded"; clusterId: string }
  | { type: "cluster_collapsed"; clusterId: string }
  | { type: "cluster_focused"; clusterId: string }
  | { type: "clusters_merged"; sourceId: string; targetId: string }
  | { type: "viewport_changed"; viewport: ViewportState }
  | { type: "connection_created"; fromId: string; toId: string }
  | { type: "connection_removed"; fromId: string; toId: string };

/**
 * Callback for constellation events.
 */
export type ConstellationEventHandler = (event: ConstellationEvent) => void;
