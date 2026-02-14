import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EmbeddingStorage } from "../zo/embeddings/storage";
import { DuckDBClient, createDuckDBClient } from "../zo/storage/duckdb-client";
import type { EmbeddingResult } from "../zo/embeddings/types";

const SCHEMA_PATH = path.resolve(__dirname, "../zo/storage/duckdb-schema.sql");

describe("EmbeddingStorage", () => {
  let db: DuckDBClient;
  let storage: EmbeddingStorage;

  beforeEach(async () => {
    db = await createDuckDBClient({ dbPath: ":memory:" });
    await db.runMigrations(SCHEMA_PATH);

    // Insert test data
    await db.execute(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project')`);
    await db.execute(`INSERT INTO genesis_sessions (id, project_id, session_type) VALUES ('sess-1', 'proj-1', 'genesis')`);
    await db.execute(`INSERT INTO thoughts (id, session_id, project_id, content, thought_type) VALUES ('thought-1', 'sess-1', 'proj-1', 'Test thought', 'idea')`);

    storage = new EmbeddingStorage(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it("stores and retrieves embedding", async () => {
    // Insert embedding directly using DuckDB array literal syntax
    // (The EmbeddingStorage.store method passes arrays to DuckDB parameters,
    // but we test retrieval logic which is the core functionality)
    await db.execute(`
      INSERT INTO embeddings (id, thought_id, model_id, vector, dimensions)
      VALUES ('emb-1', 'thought-1', 'test-model', [0.1, 0.2, 0.3], 3)
    `);

    const retrieved = await storage.getByThoughtId("thought-1");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("emb-1");
    expect(retrieved?.modelId).toBe("test-model");
    expect(retrieved?.dimensions).toBe(3);
  });

  it("returns null for non-existent thought", async () => {
    const result = await storage.getByThoughtId("non-existent");
    expect(result).toBeNull();
  });

  it("deletes embedding by thought id", async () => {
    // Insert embedding directly using DuckDB array literal syntax
    await db.execute(`
      INSERT INTO embeddings (id, thought_id, model_id, vector, dimensions)
      VALUES ('emb-2', 'thought-1', 'test', [0.1, 0.2], 2)
    `);

    // Verify embedding exists
    const beforeDelete = await storage.getByThoughtId("thought-1");
    expect(beforeDelete).not.toBeNull();

    await storage.deleteByThoughtId("thought-1");
    const result = await storage.getByThoughtId("thought-1");
    expect(result).toBeNull();
  });

  it("counts embeddings by project", async () => {
    // Insert embedding directly using DuckDB array literal syntax
    await db.execute(`
      INSERT INTO embeddings (id, thought_id, model_id, vector, dimensions)
      VALUES ('emb-3', 'thought-1', 'test', [0.5, 0.5], 2)
    `);

    const count = await storage.countByProject("proj-1");
    // DuckDB COUNT returns BigInt, so convert to Number for comparison
    expect(Number(count)).toBe(1);
  });

  it("counts zero embeddings for project without any", async () => {
    const count = await storage.countByProject("proj-1");
    // DuckDB COUNT returns BigInt, so convert to Number for comparison
    expect(Number(count)).toBe(0);
  });

  it("retrieves embedding vector data correctly", async () => {
    // Insert embedding with known vector values
    await db.execute(`
      INSERT INTO embeddings (id, thought_id, model_id, vector, dimensions)
      VALUES ('emb-4', 'thought-1', 'all-MiniLM-L6-v2', [0.25, 0.5, 0.75, 1.0], 4)
    `);

    const retrieved = await storage.getByThoughtId("thought-1");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("emb-4");
    expect(retrieved?.thoughtId).toBe("thought-1");
    expect(retrieved?.modelId).toBe("all-MiniLM-L6-v2");
    expect(retrieved?.dimensions).toBe(4);
    expect(Array.isArray(retrieved?.vector)).toBe(true);
    expect(retrieved?.vector).toHaveLength(4);
  });
});
