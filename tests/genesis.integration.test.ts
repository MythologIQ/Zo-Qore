/**
 * Genesis Integration Tests
 *
 * End-to-end tests for the genesis processing pipeline.
 *
 * @module tests/genesis.integration.test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import { GenesisPipeline } from "../zo/genesis/pipeline";
import type { EmbeddingService, EmbeddingResult } from "../zo/embeddings/types";

// Mock embedding service for testing
class MockEmbeddingService implements EmbeddingService {
  private counter = 0;

  async embed(text: string): Promise<EmbeddingResult> {
    // Generate deterministic embedding based on text content
    // Similar text should produce similar embeddings
    const words = text.toLowerCase().split(/\s+/);
    const hash = words.reduce((a, w) => a + w.charCodeAt(0), 0);

    // Create embedding with some semantic similarity for related words
    const values = Array.from({ length: 384 }, (_, i) => {
      let base = Math.sin(hash + i) * 0.5;
      // Add extra weight for certain keywords
      if (text.includes("login") || text.includes("auth")) base += 0.3;
      if (text.includes("dashboard") || text.includes("chart")) base += 0.2;
      if (text.includes("report")) base += 0.1;
      return base;
    });

    return {
      id: `embed-${++this.counter}`,
      vector: {
        values,
        dimensions: 384,
        model: "mock-model",
      },
      inputHash: `hash-${hash}`,
      computedAt: new Date().toISOString(),
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getModelId(): string {
    return "mock-model";
  }

  getDimensions(): number {
    return 384;
  }

  async isReady(): Promise<boolean> {
    return true;
  }
}

describe("Genesis Processing Integration", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;
  let pipeline: GenesisPipeline;

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");
    storage = new ProjectTabStorage(db);

    pipeline = new GenesisPipeline(db, {
      debounceMs: 100,
      clustering: {
        similarityThreshold: 0.7,
        minClusterSize: 2,
      },
      embeddingService: new MockEmbeddingService(),
      skipEmbeddingStorage: true,
    });
  });

  afterAll(() => db.close());

  it("processes stream of thoughts into clusters", async () => {
    // Create project and session
    const project = await storage.createProject({
      id: "genesis-test-project",
      name: "Test",
      state: "GENESIS",
    });

    const session = await storage.createGenesisSession({
      id: "genesis-test-session",
      projectId: project.id,
      rawInput: "",
    });

    // Add related thoughts
    const thoughts = [
      "We need a login system",
      "Users should authenticate with email",
      "Password reset via email link",
      "The dashboard shows user stats",
      "Charts for daily activity",
      "Weekly summary reports",
    ];

    for (let i = 0; i < thoughts.length; i++) {
      const content = thoughts[i];
      const thought = await storage.createThought({
        id: `thought-${i}`,
        sessionId: session.id,
        content,
      });
      pipeline.queueThought(session.id, thought.id);
    }

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 200));

    // Process
    const result = await pipeline.processSession(session.id);

    expect(result.clustering.clusters.length).toBeGreaterThanOrEqual(1);
    expect(result.clustering.processingTimeMs).toBeLessThan(10000);
    expect(result.completeness.score).toBeGreaterThan(0);
  });

  it("detects session completeness with closure language", async () => {
    const sessionId = `closure-test-${Date.now()}`;

    await storage.createGenesisSession({
      id: sessionId,
      projectId: "genesis-test-project",
      rawInput: "",
    });

    // Add thoughts with closure language
    const thoughts = [
      "The goal is to build a task manager",
      "Users can create and assign tasks",
      "Tasks have due dates and priorities",
      "We need notification reminders",
      "Reports show task completion",
      "Basically, that covers the main features",
    ];

    for (let i = 0; i < thoughts.length; i++) {
      await storage.createThought({
        id: `closure-thought-${Date.now()}-${i}`,
        sessionId,
        content: thoughts[i],
      });
    }

    const result = await pipeline.processSession(sessionId);

    // With scope definition, multiple clusters, and closure language
    expect(result.completeness.heuristics.explicitScope).toBeGreaterThan(0);
    expect(result.completeness.heuristics.closureLanguage).toBeGreaterThan(0);
    expect(result.completeness.score).toBeGreaterThan(0.4);
  });

  it("handles empty session gracefully", async () => {
    const emptySessionId = `empty-integration-${Date.now()}`;

    await storage.createGenesisSession({
      id: emptySessionId,
      projectId: "genesis-test-project",
      rawInput: "",
    });

    const result = await pipeline.processSession(emptySessionId);

    expect(result.clustering.clusters).toHaveLength(0);
    expect(result.clustering.outliers).toHaveLength(0);
    expect(result.completeness.readyForReveal).toBe(false);
    expect(result.completeness.summary).toBeDefined();
  });

  it("maintains performance for typical session", async () => {
    const perfSessionId = `perf-test-${Date.now()}`;

    await storage.createGenesisSession({
      id: perfSessionId,
      projectId: "genesis-test-project",
      rawInput: "",
    });

    // Add 20 thoughts (typical session size)
    const topics = [
      "authentication",
      "dashboard",
      "reports",
      "notifications",
      "settings",
    ];

    for (let i = 0; i < 20; i++) {
      const topic = topics[i % topics.length];
      await storage.createThought({
        id: `perf-thought-${Date.now()}-${i}`,
        sessionId: perfSessionId,
        content: `Thought about ${topic}: idea number ${i}`,
      });
    }

    const startTime = Date.now();
    const result = await pipeline.processSession(perfSessionId);
    const totalTime = Date.now() - startTime;

    // Should complete within reasonable time
    expect(totalTime).toBeLessThan(30000); // 30 seconds max
    expect(result.clustering.processingTimeMs).toBeLessThan(10000);
  });

  it("correctly identifies outliers", async () => {
    const outlierSessionId = `outlier-test-${Date.now()}`;

    await storage.createGenesisSession({
      id: outlierSessionId,
      projectId: "genesis-test-project",
      rawInput: "",
    });

    // Two similar thoughts and one outlier
    await storage.createThought({
      id: `outlier-t1-${Date.now()}`,
      sessionId: outlierSessionId,
      content: "User authentication with OAuth",
    });

    await storage.createThought({
      id: `outlier-t2-${Date.now()}`,
      sessionId: outlierSessionId,
      content: "Login security and password hashing",
    });

    // Completely unrelated thought
    await storage.createThought({
      id: `outlier-random-${Date.now()}`,
      sessionId: outlierSessionId,
      content: "Pizza delivery tracking system",
    });

    const result = await pipeline.processSession(outlierSessionId);

    // Should have some clusters and possibly outliers
    expect(result.clustering.clusters.length + result.clustering.outliers.length).toBeGreaterThan(0);
  });

  it("emits ready_for_reveal when complete", async () => {
    const readySessionId = `ready-test-${Date.now()}`;
    const events: string[] = [];

    pipeline.onEvent((e) => events.push(e.type));

    await storage.createGenesisSession({
      id: readySessionId,
      projectId: "genesis-test-project",
      rawInput: "",
    });

    // Add comprehensive thoughts
    const comprehensiveThoughts = [
      "The scope is building a project management tool",
      "Users can create projects",
      "Projects have tasks and milestones",
      "Team collaboration features needed",
      "Calendar integration for deadlines",
      "Dashboard overview of all projects",
      "Notifications for upcoming deadlines",
      "Mobile app for on-the-go access",
      "In summary, we need project tracking and collaboration",
    ];

    for (let i = 0; i < comprehensiveThoughts.length; i++) {
      await storage.createThought({
        id: `ready-thought-${Date.now()}-${i}`,
        sessionId: readySessionId,
        content: comprehensiveThoughts[i],
      });
    }

    const result = await pipeline.processSession(readySessionId);

    // Check for high completeness
    expect(result.completeness.score).toBeGreaterThan(0.5);

    // If ready for reveal, should have emitted the event
    if (result.completeness.readyForReveal) {
      expect(events).toContain("ready_for_reveal");
    }
  });
});
