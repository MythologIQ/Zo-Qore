import { LRUCache } from "../../runtime/support/LRUCache";

export interface CacheSizeMetrics {
  fingerprintCacheItems: number;
  noveltyCacheItems: number;
  totalItems: number;
}

export class CacheSizeMonitor {
  // SIMPLICITY: Removed byte-level estimation (JSON.stringify) which blocked the event loop.
  // We now track item counts, which are O(1) or O(N) depending on implementation, but much faster.

  estimateCacheSizeItems<K, V>(cache: LRUCache<K, V>): number {
    return cache.size();
  }

  buildMetrics(
    fingerprintCache: LRUCache<string, unknown>,
    noveltyCache: LRUCache<string, unknown>,
  ): CacheSizeMetrics {
    const fingerprintCacheItems = this.estimateCacheSizeItems(fingerprintCache);
    const noveltyCacheItems = this.estimateCacheSizeItems(noveltyCache);
    return {
      fingerprintCacheItems,
      noveltyCacheItems,
      totalItems: fingerprintCacheItems + noveltyCacheItems,
    };
  }
}
