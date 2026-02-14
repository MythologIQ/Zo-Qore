/**
 * Reveal Service
 *
 * Orchestrates the reveal transition from genesis clusters to
 * persistent project organization.
 *
 * @module zo/reveal/service
 */

import type { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import type { ClusterCandidate } from "../genesis/types.js";
import type { Cluster, Thought } from "../project-tab/types.js";
import { layoutClusters, type LayoutConfig } from "./layout.js";
import type {
  RevealCluster,
  RevealThought,
  RevealViewState,
  RevealEvent,
  RevealEventHandler,
} from "./types.js";

/**
 * Build RevealCluster objects from candidates with positions.
 */
function buildRevealClusters(
  candidates: ClusterCandidate[],
  positions: Array<{ x: number; y: number }>
): RevealCluster[] {
  return candidates.map((c, i) => ({
    id: c.id,
    name: c.suggestedName ?? `Cluster ${i + 1}`,
    theme: c.theme ?? "",
    thoughtIds: c.thoughtIds,
    position: positions[i],
    coherenceScore: c.coherenceScore,
    isUserEdited: false,
  }));
}

/**
 * Partition thoughts into clustered and outliers.
 */
function buildRevealThoughts(
  thoughts: Thought[],
  candidates: ClusterCandidate[]
): { revealThoughts: RevealThought[]; outliers: RevealThought[] } {
  const revealThoughts: RevealThought[] = [];
  const outliers: RevealThought[] = [];

  for (const thought of thoughts) {
    const cluster = candidates.find((c) => c.thoughtIds.includes(thought.id));
    const revealThought: RevealThought = {
      id: thought.id,
      content: thought.content,
      clusterId: cluster?.id ?? "",
    };

    if (cluster) {
      revealThoughts.push(revealThought);
    } else {
      outliers.push(revealThought);
    }
  }

  return { revealThoughts, outliers };
}

/**
 * Service for revealing and persisting genesis clusters.
 */
export class RevealService {
  private readonly storage: ProjectTabStorage;
  private eventHandlers: RevealEventHandler[] = [];

  constructor(db: DuckDBClient) {
    this.storage = new ProjectTabStorage(db);
  }

  /**
   * Subscribe to reveal events.
   */
  onEvent(handler: RevealEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * Load reveal view from genesis clustering results.
   */
  async loadRevealView(
    sessionId: string,
    candidates: ClusterCandidate[],
    layoutConfig?: LayoutConfig
  ): Promise<RevealViewState> {
    this.emit({ type: "reveal_started", sessionId });

    const session = await this.storage.getGenesisSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const thoughts = await this.storage.listThoughtsForSession(sessionId);
    const positions = layoutClusters(candidates, layoutConfig);
    const clusters = buildRevealClusters(candidates, positions);
    const { revealThoughts, outliers } = buildRevealThoughts(thoughts, candidates);

    this.emit({ type: "clusters_loaded", clusterCount: clusters.length });

    return {
      sessionId,
      projectId: session.projectId,
      state: "interactive",
      clusters,
      thoughts: revealThoughts,
      outliers,
      selectedClusterId: null,
      selectedThoughtId: null,
    };
  }

  /**
   * Rename a cluster (user edit).
   */
  renameCluster(view: RevealViewState, clusterId: string, name: string): void {
    const cluster = view.clusters.find((c) => c.id === clusterId);
    if (cluster) {
      cluster.name = name;
      cluster.isUserEdited = true;
      this.emit({ type: "cluster_renamed", clusterId, name });
    }
  }

  /**
   * Move a thought to a different cluster.
   */
  moveThought(view: RevealViewState, thoughtId: string, toClusterId: string): void {
    const thought = view.thoughts.find((t) => t.id === thoughtId);
    if (!thought) return;

    const fromCluster = thought.clusterId;
    const oldCluster = view.clusters.find((c) => c.id === fromCluster);
    const newCluster = view.clusters.find((c) => c.id === toClusterId);

    if (oldCluster) {
      oldCluster.thoughtIds = oldCluster.thoughtIds.filter((id) => id !== thoughtId);
    }
    if (newCluster) {
      newCluster.thoughtIds.push(thoughtId);
    }

    thought.clusterId = toClusterId;
    this.emit({ type: "thought_moved", thoughtId, fromCluster, toCluster: toClusterId });
  }

  /**
   * Update cluster position (drag).
   */
  updatePosition(
    view: RevealViewState,
    clusterId: string,
    position: { x: number; y: number }
  ): void {
    const cluster = view.clusters.find((c) => c.id === clusterId);
    if (cluster) {
      cluster.position = position;
      this.emit({ type: "cluster_position_changed", clusterId, position });
    }
  }

  /**
   * Persist clusters to storage and transition project state.
   */
  async confirmOrganization(view: RevealViewState): Promise<Cluster[]> {
    const persistedClusters: Cluster[] = [];

    for (const revealCluster of view.clusters) {
      const cluster = await this.storage.createCluster({
        id: revealCluster.id,
        projectId: view.projectId,
        name: revealCluster.name,
        theme: revealCluster.theme,
        thoughtIds: revealCluster.thoughtIds,
        position: revealCluster.position,
        connections: [],
      });
      persistedClusters.push(cluster);
    }

    await this.storage.updateProjectState(view.projectId, "EXPLORING");
    this.emit({ type: "organization_confirmed" });
    return persistedClusters;
  }

  /**
   * Cancel reveal and return to void capture.
   */
  cancelReveal(): void {
    this.emit({ type: "reveal_cancelled" });
  }

  private emit(event: RevealEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Swallow handler errors
      }
    }
  }
}
