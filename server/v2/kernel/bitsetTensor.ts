/**
 * Operant V2 Reality Kernel — Bit-Parallel Interval Tensor (BPIT)
 *
 * Replaces traditional database temporal range scans and pairwise comparisons
 * with vectorized 64-bit bitset operations. Enables O(1) point-in-time state checks
 * and O(1) word-level interval collision verification.
 */

export interface EpochRange {
  startEpoch: number;
  endEpoch: number; // Inclusive or exclusive depending on half-open semantics
}

export class Bitset64 {
  private words: bigint[];
  private isUnboundedEnd: boolean;

  constructor(wordCount: number = 4, isUnboundedEnd: boolean = false) {
    this.words = new Array(Math.max(1, wordCount)).fill(0n);
    this.isUnboundedEnd = isUnboundedEnd;
  }

  public static fromInterval(
    startEpoch: number,
    endEpoch: number | null,
    maxWords: number = 16
  ): Bitset64 {
    const isUnbounded = endEpoch === null || endEpoch === Number.POSITIVE_INFINITY;
    const effectiveEnd = isUnbounded ? startEpoch + 1024 : Math.max(startEpoch, endEpoch);
    const requiredWords = Math.min(maxWords, Math.ceil((effectiveEnd + 1) / 64));
    const bitset = new Bitset64(Math.max(4, requiredWords), isUnbounded);

    bitset.setRange(startEpoch, isUnbounded ? startEpoch + 1024 : effectiveEnd);
    return bitset;
  }

  public setBit(epoch: number): void {
    if (epoch < 0) return;
    const wordIdx = Math.floor(epoch / 64);
    const bitIdx = BigInt(epoch % 64);
    this.ensureCapacity(wordIdx + 1);
    this.words[wordIdx] |= 1n << bitIdx;
  }

  public hasBit(epoch: number): boolean {
    if (epoch < 0) return false;
    const wordIdx = Math.floor(epoch / 64);
    if (wordIdx >= this.words.length) {
      return this.isUnboundedEnd;
    }
    const bitIdx = BigInt(epoch % 64);
    return (this.words[wordIdx] & (1n << bitIdx)) !== 0n;
  }

  public setRange(startEpoch: number, endEpoch: number): void {
    if (endEpoch <= startEpoch || startEpoch < 0) return;

    const startWord = Math.floor(startEpoch / 64);
    const endWord = Math.floor((endEpoch - 1) / 64);
    this.ensureCapacity(endWord + 1);

    for (let w = startWord; w <= endWord; w++) {
      const bitStart = w === startWord ? startEpoch % 64 : 0;
      const bitEnd = w === endWord ? (endEpoch - 1) % 64 : 63;

      let mask = 0n;
      for (let b = bitStart; b <= bitEnd; b++) {
        mask |= 1n << BigInt(b);
      }
      this.words[w] |= mask;
    }
  }

  /**
   * O(1) per word bitwise intersection.
   * Returns true if there is any shared temporal epoch between the two bitsets.
   */
  public intersects(other: Bitset64): boolean {
    const len = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < len; i++) {
      if ((this.words[i] & other.words[i]) !== 0n) {
        return true;
      }
    }
    // If either is unbounded and the other extends beyond length
    if (this.isUnboundedEnd && other.isUnboundedEnd) {
      return true;
    }
    return false;
  }

  /**
   * Vectorized population count: counts total active temporal epochs in constant word time.
   */
  public activeEpochCount(): number {
    let count = 0;
    for (const w of this.words) {
      let temp = w;
      while (temp > 0n) {
        count += Number(temp & 1n);
        temp >>= 1n;
      }
    }
    return count;
  }

  private ensureCapacity(size: number): void {
    while (this.words.length < size) {
      this.words.push(0n);
    }
  }

  public getRawWords(): readonly bigint[] {
    return this.words;
  }
}

/**
 * High-performance bit-parallel reality tensor holding multiple assertion timelines
 * indexed by attribute key.
 */
export class BitParallelRealityTensor {
  private tensors: Map<string, Map<string | number, Bitset64>> = new Map();

  public register(
    targetKey: string,
    assertionId: string | number,
    startEpoch: number,
    endEpoch: number | null
  ): void {
    let group = this.tensors.get(targetKey);
    if (!group) {
      group = new Map();
      this.tensors.set(targetKey, group);
    }

    const bitset = Bitset64.fromInterval(startEpoch, endEpoch);
    group.set(assertionId, bitset);
  }

  /**
   * O(1) query checking if an assertion was valid at a specific temporal epoch.
   */
  public isAssertionActiveAt(
    targetKey: string,
    assertionId: string | number,
    epoch: number
  ): boolean {
    const group = this.tensors.get(targetKey);
    if (!group) return false;
    const bitset = group.get(assertionId);
    return bitset ? bitset.hasBit(epoch) : false;
  }

  /**
   * Detects all collisions against an incoming interval in O(K) word time where K is
   * the number of concurrent assertions on that target, completely skipping disk scans.
   */
  public findCollisions(
    targetKey: string,
    startEpoch: number,
    endEpoch: number | null,
    excludeId?: string | number
  ): Array<string | number> {
    const group = this.tensors.get(targetKey);
    if (!group) return [];

    const candidateBitset = Bitset64.fromInterval(startEpoch, endEpoch);
    const collidingIds: Array<string | number> = [];

    for (const [id, existingBitset] of group) {
      if (excludeId !== undefined && id === excludeId) continue;
      if (candidateBitset.intersects(existingBitset)) {
        collidingIds.push(id);
      }
    }

    return collidingIds;
  }
}
