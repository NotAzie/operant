/**
 * Operant V2 Reality Kernel — Bit-Parallel Interval Tensor (BPIT)
 *
 * Replaces traditional database temporal range scans and pairwise comparisons
 * with vectorized 64-bit bitset operations. Enables O(1) point-in-time state checks,
 * O(1) word-level interval collision verification, and constant-cycle parallel popcount.
 */

export interface EpochRange {
  startEpoch: number;
  endEpoch: number;
}

function popcnt32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function popcnt64(x: bigint): number {
  const low = Number(BigInt.asUintN(32, x));
  const high = Number(BigInt.asUintN(32, x >> 32n));
  return popcnt32(low) + popcnt32(high);
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

  public intersects(other: Bitset64): boolean {
    const len = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < len; i++) {
      if ((this.words[i] & other.words[i]) !== 0n) {
        return true;
      }
    }
    if (this.isUnboundedEnd && other.isUnboundedEnd) {
      return true;
    }
    return false;
  }

  /**
   * O(1) per word population count using 32-bit parallel SWAR popcount.
   */
  public activeEpochCount(): number {
    let count = 0;
    for (const w of this.words) {
      if (w > 0n) {
        count += popcnt64(w);
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
