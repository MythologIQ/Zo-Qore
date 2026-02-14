/**
 * Constellation Service
 *
 * Manages hierarchical and spatial cluster views.
 *
 * @module zo/constellation/service
 */

import type { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import type { Cluster, Thought } from "../project-tab/types.js";
import type {
  ConstellationState,
  ConstellationView,
  HierarchicalCluster,
  SpatialCluster,
  ConstellationEvent,
  ConstellationEventHandler,
} from "./types.js";

/**
 * Build hierarchical clusters from storage.
 */
function buildHierarchicalClusters(clusters: Cluster[]): HierarchicalCluster[] {
  return clusters.map((c) => ({
    id: c.id,
    name: c.name,
    theme: c.theme,
    thoughtIds: c.thoughtIds,
    coherenceScore: 0.8,
    isExpanded: false,
    connections: c.connections.map((conn) => conn.targetClusterId),
  }));
}

/**
 * Build spatial clusters from storage.
 */
function buildSpatialClusters(clusters: Cluster[]): SpatialCluster[] {
  return clusters.map((c) => ({
    id: c.id,
    name: c.name,
    theme: c.theme,
    thoughtIds: c.thoughtIds,
    position: c.position ?? { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    coherenceScore: 0.8,
    connections: c.connections.map((conn) => conn.targetClusterId),
  }));
}

/**
 * Build thought-to-cluster mapping from cluster.thoughtIds arrays.
 */
function buildThoughtClusterMap(clusters: Cluster[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cluster of clusters) {
    for (const thoughtId of cluster.thoughtIds) {
      map.set(thoughtId, cluster.id);
    }
  }
  return map;
}

/**
 * Service for constellation visualization.
 */
export class ConstellationService {
  private readonly storage: ProjectTabStorage;
  private eventHandlers: ConstellationEventHandler[] = [];

  constructor(db: DuckDBClient) {
    this.storage = new ProjectTabStorage(db);
  }

  /**
   * Subscribe to constellation events.
   */
  onEvent(handler: ConstellationEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * Load constellation from project clusters.
   *
   * Note: Thought interface has no clusterId property. The relationship is
   * stored on Cluster.thoughtIds[], so we build a reverse lookup map.
   */
  async loadConstellation(projectId: string): Promise<ConstellationState> {
    const clusters = await this.storage.listClustersForProject(projectId);
    const allThoughts = await this.listThoughtsForProject(projectId);

    // Build clusterId mapping from cluster.thoughtIds (inverse lookup)
    const thoughtClusterMap = buildThoughtClusterMap(clusters);

    // Map thoughts with derived clusterId
    const thoughts = allThoughts.map((t) => ({
      id: t.id,
      content: t.content,
      clusterId: thoughtClusterMap.get(t.id) ?? "",
    }));

    return {
      projectId,
      view: "hierarchical",
      clusters: buildHierarchicalClusters(clusters),
      spatialClusters: buildSpatialClusters(clusters),
      thoughts,
      viewport: { x: 0, y: 0, scale: 1, velocityX: 0, velocityY: 0 },
      selectedClusterId: null,
      focusedClusterId: null,
    };
  }

  /**
   * List all thoughts for a project across all sessions.
   */
  private async listThoughtsForProject(projectId: string): Promise<Thought[]> {
    const sessions = await this.storage.listGenesisSessionsForProject(projectId);
    const thoughts: Thought[] = [];
    for (const session of sessions) {
      const sessionThoughts = await this.storage.listThoughtsForSession(session.id);
      thoughts.push(...sessionThoughts);
    }
    return thoughts;
  }

  /**
   * Toggle view mode.
   */
  switchView(state: ConstellationState, view: ConstellationView): void {
    state.view = view;
    this.emit({ type: "view_changed", view });
  }

  /**
   * Expand/collapse cluster in hierarchical view.
   */
  toggleCluster(state: ConstellationState, clusterId: string): void {
    const cluster = state.clusters.find((c) => c.id === clusterId);
    if (cluster) {
      cluster.isExpanded = !cluster.isExpanded;
      this.emit({
        type: cluster.isExpanded ? "cluster_expanded" : "cluster_collapsed",
        clusterId,
      });
    }
  }

  /**
   * Focus on cluster in spatial view.
   */
  focusCluster(state: ConstellationState, clusterId: string): void {
    const cluster = state.spatialClusters.find((c) => c.id === clusterId);
    if (cluster) {
      state.focusedClusterId = clusterId;
      state.viewport.x = -cluster.position.x;
      state.viewport.y = -cluster.position.y;
      state.viewport.velocityX = 0;
      state.viewport.velocityY = 0;
      this.emit({ type: "cluster_focused", clusterId });
    }
  }

  /**
   * Merge two clusters.
   */
  async mergeClusters(
    state: ConstellationState,
    sourceId: string,
    targetId: string
  ): Promise<void> {
    const source = state.clusters.find((c) => c.id === sourceId);
    const target = state.clusters.find((c) => c.id === targetId);
    if (!source || !target) return;

    // Merge thoughts into target
    target.thoughtIds.push(...source.thoughtIds);

    // Remove source from state
    state.clusters = state.clusters.filter((c) => c.id !== sourceId);
    state.spatialClusters = state.spatialClusters.filter((c) => c.id !== sourceId);

    // Persist merge via storage
    const srcCluster = await this.storage.getCluster(sourceId);
    const tgtCluster = await this.storage.getCluster(targetId);
    if (srcCluster && tgtCluster) {
      const newThoughtIds = [...tgtCluster.thoughtIds, ...srcCluster.thoughtIds];
      await this.storage.updateCluster(targetId, { thoughtIds: newThoughtIds });
      await this.storage.deleteCluster(sourceId);
    }

    this.emit({ type: "clusters_merged", sourceId, targetId });
  }

  /**
   * Create connection between clusters.
   */
  async createConnection(
    state: ConstellationState,
    fromId: string,
    toId: string
  ): Promise<void> {
    const from = state.clusters.find((c) => c.id === fromId);
    if (from && !from.connections.includes(toId)) {
      from.connections.push(toId);
      await this.storage.addClusterConnection(fromId, toId);
      this.emit({ type: "connection_created", fromId, toId });
    }
  }

  private emit(event: ConstellationEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Swallow handler errors
      }
    }
  }
}
