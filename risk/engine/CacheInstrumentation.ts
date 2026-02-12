export interface CacheMetrics {
  hits: number;
  misses: number;
}

export class CacheInstrumentation {
  private metrics: Record<string, CacheMetrics> = {};

  recordHit(cacheName: string): void {
    const entry = this.getOrInit(cacheName);
    entry.hits += 1;
  }

  recordMiss(cacheName: string): void {
    const entry = this.getOrInit(cacheName);
    entry.misses += 1;
  }

  getMetrics(): Record<string, CacheMetrics> {
    const copy: Record<string, CacheMetrics> = {};
    for (const [key, value] of Object.entries(this.metrics)) {
      copy[key] = { ...value };
    }
    return copy;
  }

  private getOrInit(cacheName: string): CacheMetrics {
    if (!this.metrics[cacheName]) {
      this.metrics[cacheName] = { hits: 0, misses: 0 };
    }
    return this.metrics[cacheName];
  }
}
