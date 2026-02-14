import { DuckDBClient } from '../storage/duckdb-client';
import { EmbeddingResult } from './types';

export interface StoredEmbedding {
  id: string;
  thoughtId: string;
  modelId: string;
  vector: number[];
  dimensions: number;
  createdAt: string;
}

export class EmbeddingStorage {
  constructor(private readonly db: DuckDBClient) {}

  async store(thoughtId: string, embedding: EmbeddingResult): Promise<void> {
    const vectorArray = Array.isArray(embedding.vector.values)
      ? embedding.vector.values
      : Array.from(embedding.vector.values);

    await this.db.execute(
      `INSERT INTO embeddings (id, thought_id, model_id, vector, dimensions)
       VALUES (?, ?, ?, ?, ?)`,
      [
        embedding.id,
        thoughtId,
        embedding.vector.model,
        vectorArray,
        embedding.vector.dimensions,
      ]
    );
  }

  async getByThoughtId(thoughtId: string): Promise<StoredEmbedding | null> {
    const result = await this.db.queryOne<StoredEmbedding>(
      `SELECT id, thought_id as thoughtId, model_id as modelId,
              vector, dimensions, created_at as createdAt
       FROM embeddings WHERE thought_id = ?`,
      [thoughtId]
    );
    return result ?? null;
  }

  async deleteByThoughtId(thoughtId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM embeddings WHERE thought_id = ?`,
      [thoughtId]
    );
  }

  async countByProject(projectId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM embeddings e
       JOIN thoughts t ON e.thought_id = t.id
       WHERE t.project_id = ?`,
      [projectId]
    );
    return result?.count ?? 0;
  }
}
