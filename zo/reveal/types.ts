/**
 * Reveal UI Types
 *
 * Interfaces for the reveal transition from genesis to organized view.
 *
 * @module zo/reveal/types
 */

/**
 * Current state of the reveal process.
 */
export type RevealState =
  | "loading"      // Fetching cluster data
  | "animating"    // Playing reveal animation
  | "interactive"  // User can interact with clusters
  | "confirming";  // User confirming organization

/**
 * A positioned cluster for UI rendering.
 */
export interface RevealCluster {
  id: string;
  name: string;
  theme: string;
  thoughtIds: string[];
  position: { x: number; y: number };
  coherenceScore: number;
  isUserEdited: boolean;
}

/**
 * A thought with its content for display.
 */
export interface RevealThought {
  id: string;
  content: string;
  clusterId: string;
}

/**
 * Complete reveal view data.
 */
export interface RevealViewState {
  sessionId: string;
  projectId: string;
  state: RevealState;
  clusters: RevealCluster[];
  thoughts: RevealThought[];
  outliers: RevealThought[];
  selectedClusterId: string | null;
  selectedThoughtId: string | null;
}

/**
 * Events emitted during reveal interaction.
 */
export type RevealEvent =
  | { type: "reveal_started"; sessionId: string }
  | { type: "clusters_loaded"; clusterCount: number }
  | { type: "cluster_selected"; clusterId: string }
  | { type: "cluster_renamed"; clusterId: string; name: string }
  | { type: "thought_moved"; thoughtId: string; fromCluster: string; toCluster: string }
  | { type: "cluster_position_changed"; clusterId: string; position: { x: number; y: number } }
  | { type: "organization_confirmed" }
  | { type: "reveal_cancelled" };

/**
 * Callback for reveal events.
 */
export type RevealEventHandler = (event: RevealEvent) => void;
