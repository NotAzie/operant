import { describe, expect, it } from 'vitest';
import { PersistentHAMT } from './persistentHamt';

describe('PersistentHAMT', () => {
  it('inserts and retrieves elements immutably', () => {
    let trie = PersistentHAMT.empty<string>();
    trie = trie.set('host-01', 'ONLINE');
    trie = trie.set('host-02', 'DEGRADED');

    expect(trie.get('host-01')).toBe('ONLINE');
    expect(trie.get('host-02')).toBe('DEGRADED');
    expect(trie.get('host-03')).toBeUndefined();
    expect(trie.size()).toBe(2);
  });

  it('guarantees structural persistence across mutations (original trie unchanged)', () => {
    const v1 = PersistentHAMT.empty<number>().set('alpha', 100);
    const v2 = v1.set('beta', 200);
    const v3 = v2.set('alpha', 999);

    expect(v1.get('alpha')).toBe(100);
    expect(v1.get('beta')).toBeUndefined();

    expect(v2.get('alpha')).toBe(100);
    expect(v2.get('beta')).toBe(200);

    expect(v3.get('alpha')).toBe(999);
    expect(v3.get('beta')).toBe(200);
  });

  it('forks into independent shadow branch in O(1)', () => {
    const mainBranch = PersistentHAMT.empty<string>()
      .set('cluster:status', 'NOMINAL')
      .set('queue:depth', '42');

    const ghostBranch = mainBranch.fork();
    const mutatedGhost = ghostBranch.set('cluster:status', 'SIMULATED_FAILURE');

    expect(mainBranch.get('cluster:status')).toBe('NOMINAL');
    expect(mutatedGhost.get('cluster:status')).toBe('SIMULATED_FAILURE');
    expect(mutatedGhost.get('queue:depth')).toBe('42');
  });

  it('handles wide sets of keys across multiple trie depth levels', () => {
    let trie = PersistentHAMT.empty<number>();
    const count = 500;
    for (let i = 0; i < count; i++) {
      trie = trie.set(`metric_entity_key_${i}`, i * 10);
    }

    expect(trie.size()).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(trie.get(`metric_entity_key_${i}`)).toBe(i * 10);
    }
  });
});
