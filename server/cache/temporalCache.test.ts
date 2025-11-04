import { describe, expect, it } from 'vitest';
import { BiTemporalCache } from './temporalCache';

describe('BiTemporalCache', () => {
  it('stores and retrieves items correctly', () => {
    const cache = new BiTemporalCache<string>();
    cache.set('ws-1', 'ent-1:asof:1000', 'Active');
    expect(cache.get('ws-1', 'ent-1:asof:1000')).toBe('Active');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);
  });

  it('invalidates all workspace cache entries in O(1) via generational counter', () => {
    const cache = new BiTemporalCache<string>();
    cache.set('ws-1', 'k1', 'val1');
    cache.set('ws-1', 'k2', 'val2');
    cache.set('ws-2', 'k3', 'val3');

    expect(cache.get('ws-1', 'k1')).toBe('val1');
    expect(cache.get('ws-2', 'k3')).toBe('val3');

    // Invalidate ws-1
    cache.invalidateWorkspace('ws-1');

    // ws-1 entries are now misses
    expect(cache.get('ws-1', 'k1')).toBeUndefined();
    expect(cache.get('ws-1', 'k2')).toBeUndefined();

    // ws-2 entries remain valid
    expect(cache.get('ws-2', 'k3')).toBe('val3');
  });

  it('evicts least recently accessed entries when reaching max capacity', () => {
    const cache = new BiTemporalCache<number>({ maxEntries: 3 });
    cache.set('ws-1', 'k1', 1);
    cache.set('ws-1', 'k2', 2);
    cache.set('ws-1', 'k3', 3);

    // Access k1 so k2 becomes the oldest accessed
    cache.get('ws-1', 'k1');

    // Add k4 -> should evict k2
    cache.set('ws-1', 'k4', 4);

    expect(cache.get('ws-1', 'k1')).toBe(1);
    expect(cache.get('ws-1', 'k2')).toBeUndefined();
    expect(cache.get('ws-1', 'k3')).toBe(3);
    expect(cache.get('ws-1', 'k4')).toBe(4);
  });

  it('respects TTL expiration', () => {
    const cache = new BiTemporalCache<string>({ defaultTtlMs: -1 }); // already expired
    cache.set('ws-1', 'k1', 'expired');
    expect(cache.get('ws-1', 'k1')).toBeUndefined();
  });
});
