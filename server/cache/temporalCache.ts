/**
 * Operant Bi-Temporal Multi-Tier LRU Cache
 *
 * Implements high-throughput, bounded in-memory caching of temporal state snapshots
 * with generational workspace invalidation counters for O(1) workspace invalidation.
 */

export interface CacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entryCount: number;
  hitRatio: number;
}

interface CacheEntry<T> {
  key: string;
  value: T;
  workspaceId: string | number;
  generation: number;
  expiresAt: number;
  accessSeq: number;
}

export class BiTemporalCache<T = unknown> {
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private entries: Map<string, CacheEntry<T>> = new Map();
  private workspaceGenerations: Map<string | number, number> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private accessCounter: number = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 5000;
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000; // 1 minute default
  }

  private nextSeq(): number {
    return ++this.accessCounter;
  }

  private getWorkspaceGeneration(workspaceId: string | number): number {
    return this.workspaceGenerations.get(workspaceId) ?? 0;
  }

  public invalidateWorkspace(workspaceId: string | number): void {
    const current = this.getWorkspaceGeneration(workspaceId);
    this.workspaceGenerations.set(workspaceId, current + 1);
  }

  public get(workspaceId: string | number, key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const now = Date.now();
    const currentGen = this.getWorkspaceGeneration(workspaceId);

    // Invalidation check: generation mismatch or TTL expiration
    if (entry.generation !== currentGen || now > entry.expiresAt) {
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }

    entry.accessSeq = this.nextSeq();
    this.hits++;
    return entry.value;
  }

  public set(
    workspaceId: string | number,
    key: string,
    value: T,
    customTtlMs?: number
  ): void {
    const now = Date.now();
    const generation = this.getWorkspaceGeneration(workspaceId);
    const ttl = customTtlMs ?? this.defaultTtlMs;

    // Eviction: if at capacity, evict the least recently accessed entry
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      this.evictLRU();
    }

    this.entries.set(key, {
      key,
      value,
      workspaceId,
      generation,
      expiresAt: now + ttl,
      accessSeq: this.nextSeq(),
    });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestSeq = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.accessSeq < oldestSeq) {
        oldestSeq = entry.accessSeq;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }

  public clear(): void {
    this.entries.clear();
    this.workspaceGenerations.clear();
    this.hits = 0;
    this.misses = 0;
    this.accessCounter = 0;
  }

  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      entryCount: this.entries.size,
      hitRatio: total === 0 ? 0 : this.hits / total,
    };
  }
}
