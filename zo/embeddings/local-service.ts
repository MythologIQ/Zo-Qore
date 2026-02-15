import * as crypto from "crypto";
import { EmbeddingService, EmbeddingResult, EmbeddingVector } from "./types";
import { hashContent } from "./hash";

let pipeline: unknown = null;
let pipelinePromise: Promise<unknown> | null = null;

async function getEmbeddingPipeline(modelId: string): Promise<unknown> {
  if (pipeline) return pipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    // Dynamic import to avoid bundling transformers.js in main bundle
    const { pipeline: createPipeline } = await import("@xenova/transformers");
    pipeline = await createPipeline("feature-extraction", modelId, {
      quantized: true,
    });
    return pipeline;
  })();

  return pipelinePromise;
}

export class LocalEmbeddingService implements EmbeddingService {
  private readonly modelId: string;
  private readonly dimensions: number;

  constructor(options?: { modelId?: string }) {
    this.modelId = options?.modelId ?? "Xenova/all-MiniLM-L6-v2";
    this.dimensions = 384; // MiniLM output dimensions
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const pipe = await getEmbeddingPipeline(this.modelId);
    const output = await (
      pipe as (t: string, o: object) => Promise<{ data: Float32Array }>
    )(text, { pooling: "mean", normalize: true });

    const vector: EmbeddingVector = {
      values: Array.from(output.data),
      dimensions: this.dimensions,
      model: this.modelId,
    };

    return {
      id: crypto.randomUUID(),
      vector,
      inputHash: hashContent(text),
      computedAt: new Date().toISOString(),
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Sequential for now; transformers.js batching is complex
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getModelId(): string {
    return this.modelId;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async isReady(): Promise<boolean> {
    try {
      await getEmbeddingPipeline(this.modelId);
      return true;
    } catch {
      return false;
    }
  }
}
