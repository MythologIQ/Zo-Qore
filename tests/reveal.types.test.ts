/**
 * Reveal Types Tests
 *
 * Type validation and default value tests for reveal interfaces.
 *
 * @module tests/reveal.types.test
 */

import { describe, it, expect } from "vitest";
import type {
  RevealState,
  RevealCluster,
  RevealThought,
  RevealViewState,
  RevealEvent,
} from "../zo/reveal/types";

describe("Reveal Types", () => {
  describe("RevealState", () => {
    it("accepts valid state values", () => {
      const states: RevealState[] = ["loading", "animating", "interactive", "confirming"];
      expect(states).toHaveLength(4);
    });
  });

  describe("RevealCluster", () => {
    it("has required fields", () => {
      const cluster: RevealCluster = {
        id: "cluster-1",
        name: "Test Cluster",
        theme: "Testing theme",
        thoughtIds: ["t1", "t2"],
        position: { x: 100, y: 200 },
        coherenceScore: 0.85,
        isUserEdited: false,
      };

      expect(cluster.id).toBe("cluster-1");
      expect(cluster.name).toBe("Test Cluster");
      expect(cluster.position.x).toBe(100);
      expect(cluster.position.y).toBe(200);
      expect(cluster.coherenceScore).toBe(0.85);
      expect(cluster.isUserEdited).toBe(false);
    });
  });

  describe("RevealThought", () => {
    it("has required fields", () => {
      const thought: RevealThought = {
        id: "thought-1",
        content: "Test thought content",
        clusterId: "cluster-1",
      };

      expect(thought.id).toBe("thought-1");
      expect(thought.content).toBe("Test thought content");
      expect(thought.clusterId).toBe("cluster-1");
    });
  });

  describe("RevealViewState", () => {
    it("has required fields with proper defaults", () => {
      const viewState: RevealViewState = {
        sessionId: "session-1",
        projectId: "project-1",
        state: "interactive",
        clusters: [],
        thoughts: [],
        outliers: [],
        selectedClusterId: null,
        selectedThoughtId: null,
      };

      expect(viewState.sessionId).toBe("session-1");
      expect(viewState.projectId).toBe("project-1");
      expect(viewState.state).toBe("interactive");
      expect(viewState.clusters).toEqual([]);
      expect(viewState.thoughts).toEqual([]);
      expect(viewState.outliers).toEqual([]);
      expect(viewState.selectedClusterId).toBeNull();
      expect(viewState.selectedThoughtId).toBeNull();
    });
  });

  describe("RevealEvent", () => {
    it("supports reveal_started event", () => {
      const event: RevealEvent = { type: "reveal_started", sessionId: "s1" };
      expect(event.type).toBe("reveal_started");
      if (event.type === "reveal_started") {
        expect(event.sessionId).toBe("s1");
      }
    });

    it("supports clusters_loaded event", () => {
      const event: RevealEvent = { type: "clusters_loaded", clusterCount: 5 };
      expect(event.type).toBe("clusters_loaded");
      if (event.type === "clusters_loaded") {
        expect(event.clusterCount).toBe(5);
      }
    });

    it("supports cluster_renamed event", () => {
      const event: RevealEvent = { type: "cluster_renamed", clusterId: "c1", name: "New Name" };
      expect(event.type).toBe("cluster_renamed");
      if (event.type === "cluster_renamed") {
        expect(event.clusterId).toBe("c1");
        expect(event.name).toBe("New Name");
      }
    });

    it("supports thought_moved event", () => {
      const event: RevealEvent = {
        type: "thought_moved",
        thoughtId: "t1",
        fromCluster: "c1",
        toCluster: "c2",
      };
      expect(event.type).toBe("thought_moved");
      if (event.type === "thought_moved") {
        expect(event.thoughtId).toBe("t1");
        expect(event.fromCluster).toBe("c1");
        expect(event.toCluster).toBe("c2");
      }
    });

    it("supports organization_confirmed event", () => {
      const event: RevealEvent = { type: "organization_confirmed" };
      expect(event.type).toBe("organization_confirmed");
    });

    it("supports reveal_cancelled event", () => {
      const event: RevealEvent = { type: "reveal_cancelled" };
      expect(event.type).toBe("reveal_cancelled");
    });
  });
});
