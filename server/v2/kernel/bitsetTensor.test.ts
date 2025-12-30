import { describe, expect, it } from 'vitest';
import { Bitset64, BitParallelRealityTensor } from './bitsetTensor';

describe('Bitset64 Interval Algebra', () => {
  it('correctly sets bit ranges and performs O(1) point-in-time checks', () => {
    const bitset = new Bitset64(4);
    bitset.setRange(10, 20); // [10, 19]

    expect(bitset.hasBit(9)).toBe(false);
    expect(bitset.hasBit(10)).toBe(true);
    expect(bitset.hasBit(15)).toBe(true);
    expect(bitset.hasBit(19)).toBe(true);
    expect(bitset.hasBit(20)).toBe(false);
    expect(bitset.activeEpochCount()).toBe(10);
  });

  it('correctly crosses 64-bit word boundaries seamlessly', () => {
    const bitset = new Bitset64(4);
    bitset.setRange(60, 70); // crosses word 0 (60-63) and word 1 (64-69)

    expect(bitset.hasBit(59)).toBe(false);
    expect(bitset.hasBit(60)).toBe(true);
    expect(bitset.hasBit(63)).toBe(true);
    expect(bitset.hasBit(64)).toBe(true);
    expect(bitset.hasBit(69)).toBe(true);
    expect(bitset.hasBit(70)).toBe(false);
    expect(bitset.activeEpochCount()).toBe(10);
  });

  it('detects interval intersection via bitwise AND in constant time', () => {
    const a = Bitset64.fromInterval(10, 30);
    const b = Bitset64.fromInterval(25, 45);
    const c = Bitset64.fromInterval(30, 50);

    expect(a.intersects(b)).toBe(true); // overlap in [25, 29]
    expect(a.intersects(c)).toBe(false); // [10, 30) and [30, 50) are disjoint half-open
  });

  it('handles unbounded intervals correctly', () => {
    const unbounded = Bitset64.fromInterval(100, null);
    expect(unbounded.hasBit(100)).toBe(true);
    expect(unbounded.hasBit(500)).toBe(true);
    expect(unbounded.hasBit(5000)).toBe(true);

    const bounded = Bitset64.fromInterval(200, 300);
    expect(unbounded.intersects(bounded)).toBe(true);
  });
});

describe('BitParallelRealityTensor', () => {
  it('registers assertions and queries active state in O(1)', () => {
    const tensor = new BitParallelRealityTensor();
    tensor.register('ent-1::status', 'assert-101', 5, 25);
    tensor.register('ent-1::status', 'assert-102', 30, 50);

    expect(tensor.isAssertionActiveAt('ent-1::status', 'assert-101', 10)).toBe(true);
    expect(tensor.isAssertionActiveAt('ent-1::status', 'assert-101', 28)).toBe(false);
    expect(tensor.isAssertionActiveAt('ent-1::status', 'assert-102', 40)).toBe(true);
  });

  it('finds colliding assertion IDs without disk or relational scanning', () => {
    const tensor = new BitParallelRealityTensor();
    tensor.register('server-alpha::health', 'a1', 100, 200);
    tensor.register('server-alpha::health', 'a2', 300, 400);

    // Candidate overlapping a1
    const collisions1 = tensor.findCollisions('server-alpha::health', 150, 250);
    expect(collisions1).toEqual(['a1']);

    // Candidate overlapping none
    const collisions2 = tensor.findCollisions('server-alpha::health', 210, 290);
    expect(collisions2).toEqual([]);

    // Candidate overlapping both
    const collisions3 = tensor.findCollisions('server-alpha::health', 50, 500);
    expect(collisions3).toEqual(['a1', 'a2']);
  });
});
