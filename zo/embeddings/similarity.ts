import { SimilaritySearch, SimilarityResult } from './types';
import { DuckDBClient } from '../storage/duckdb-client';

export class EmbeddingSimilaritySearch implements SimilaritySearch {
  constructor(private readonly db: DuckDBClient) {}

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  async findSimilar(
    queryVector: number[],
    k: number,
    filter?: { projectId?: string; sessionId?: string }
  ): Promise<SimilarityResult[]> {
    // Fetch all embeddings with optional filter
    let sql = `
      SELECT e.id, e.vector, t.project_id, t.session_id
      FROM embeddings e
      JOIN thoughts t ON e.thought_id = t.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filter?.projectId) {
      sql += ` AND t.project_id = ?`;
      params.push(filter.projectId);
    }

    if (filter?.sessionId) {
      sql += ` AND t.session_id = ?`;
      params.push(filter.sessionId);
    }

    const rows = await this.db.query<{
      id: string;
      vector: number[];
    }>(sql, params);

    // Compute similarities in TypeScript
    const scored = rows.map((row) => ({
      id: row.id,
      score: this.cosineSimilarity(queryVector, row.vector),
      distance: 0, // Will compute
    }));

    // Sort by score descending, take top k
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, k);

    // Add distance (1 - similarity for cosine)
    return topK.map((s) => ({
      ...s,
      distance: 1 - s.score,
    }));
  }
}
