/**
 * Operant Bi-Temporal Multi-Tier LRU Cache
 *
 * Implements a strict O(1) Doubly-Linked List + HashMap Least Recently Used cache
 * with generational workspace invalidation counters for O(1) workspace invalidation.
 *
 * Theoretical Complexity:
 * - get(): O(1)
 * - set(): O(1)
 * - evict(): O(1)
 * - invalidateWorkspace(): O(1)
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

interface DListNode<T> {
  key: string;
  value: T;
  workspaceId: string | number;
  generation: number;
  expiresAt: number;
  prev: DListNode<T> | null;
  next: DListNode<T> | null;
}

export class BiTemporalCache<T = unknown> {
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private nodeMap: Map<string, DListNode<T>> = new Map();
  private workspaceGenerations: Map<string | number, number> = new Map();
  private head: DListNode<T> | null = null;
  private tail: DListNode<T> | null = null;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 5000;
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
  }

  private getWorkspaceGeneration(workspaceId: string | number): number {
    return this.workspaceGenerations.get(workspaceId) ?? 0;
  }

  public invalidateWorkspace(workspaceId: string | number): void {
    const current = this.getWorkspaceGeneration(workspaceId);
    this.workspaceGenerations.set(workspaceId, current + 1);
  }

  private detachNode(node: DListNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  private insertAtHead(node: DListNode<T>): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private moveToHead(node: DListNode<T>): void {
    if (this.head === node) return;
    this.detachNode(node);
    this.insertAtHead(node);
  }

  public get(workspaceId: string | number, key: string): T | undefined {
    const node = this.nodeMap.get(key);
    if (!node) {
      this.misses++;
      return undefined;
    }

    const now = Date.now();
    const currentGen = this.getWorkspaceGeneration(workspaceId);

    // Generation mismatch or TTL expiration check
    if (node.generation !== currentGen || now > node.expiresAt) {
      this.detachNode(node);
      this.nodeMap.delete(key);
      this.misses++;
      return undefined;
    }

    // O(1) promotion to head of LRU list
    this.moveToHead(node);
    this.hits++;
    return node.value;
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

    let node = this.nodeMap.get(key);
    if (node) {
      node.value = value;
      node.generation = generation;
      node.expiresAt = now + ttl;
      this.moveToHead(node);
      return;
    }

    // O(1) Eviction if at capacity: pop tail node
    if (this.nodeMap.size >= this.maxEntries && this.tail) {
      const evicted = this.tail;
      this.detachNode(evicted);
      this.nodeMap.delete(evicted.key);
    }

    // O(1) Insertion at head
    const newNode: DListNode<T> = {
      key,
      value,
      workspaceId,
      generation,
      expiresAt: now + ttl,
      prev: null,
      next: null,
    };
    this.insertAtHead(newNode);
    this.nodeMap.set(key, newNode);
  }

  public clear(): void {
    this.nodeMap.clear();
    this.workspaceGenerations.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
  }

  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      entryCount: this.nodeMap.size,
      hitRatio: total === 0 ? 0 : this.hits / total,
    };
  }
}
