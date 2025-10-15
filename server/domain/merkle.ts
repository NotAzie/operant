/**
 * Operant Cryptographic Reality Merkle Tree
 *
 * Constructs a binary Merkle tree over workspace operational assertions and audit logs.
 * Provides cryptographic inclusion proofs and tamper-evident root verification.
 */

import { createHash } from 'node:crypto';

export interface MerkleProofElement {
  position: 'left' | 'right';
  hash: string;
}

export interface MerkleTreeResult {
  root: string;
  leafCount: number;
  leaves: string[];
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministically serialize any object into sorted canonical JSON
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalStringify((obj as Record<string, unknown>)[k])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Hash a single leaf node with a 0x00 domain separator prefix to prevent length-extension
 * and second-preimage attacks.
 */
export function hashLeaf(payload: unknown): string {
  const serialized = canonicalStringify(payload);
  return sha256(`LEAF:${serialized}`);
}

/**
 * Hash an interior branch pair with a 0x01 domain separator prefix.
 */
export function hashBranch(left: string, right: string): string {
  return sha256(`BRANCH:${left}:${right}`);
}

export class MerkleTree {
  private leaves: string[];
  private layers: string[][];

  constructor(items: unknown[] = []) {
    this.leaves = items.map((item) => hashLeaf(item));
    this.layers = [];
    this.buildTree();
  }

  private buildTree(): void {
    if (this.leaves.length === 0) {
      this.layers = [['0'.repeat(64)]];
      return;
    }

    this.layers = [this.leaves.slice()];
    let currentLayer = this.layers[0];

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        if (i + 1 < currentLayer.length) {
          const right = currentLayer[i + 1];
          nextLayer.push(hashBranch(left, right));
        } else {
          // Odd element is promoted or paired with itself; promote for standard tree
          nextLayer.push(hashBranch(left, left));
        }
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): string {
    return this.layers[this.layers.length - 1][0];
  }

  public getLeafCount(): number {
    return this.leaves.length;
  }

  public getLeaf(index: number): string | undefined {
    return this.leaves[index];
  }

  /**
   * Generates a cryptographic inclusion proof for the leaf at `index`.
   */
  public generateProof(index: number): MerkleProofElement[] {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds (total leaves: ${this.leaves.length})`);
    }

    const proof: MerkleProofElement[] = [];
    let currentIndex = index;

    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const layer = this.layers[layerIdx];
      const isRightNode = currentIndex % 2 === 1;
      const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < layer.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: layer[pairIndex],
        });
      } else {
        // Paired with self
        proof.push({
          position: 'right',
          hash: layer[currentIndex],
        });
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Verifies an inclusion proof against a known root hash.
   */
  public static verifyProof(
    leafHash: string,
    proof: MerkleProofElement[],
    expectedRoot: string
  ): boolean {
    let currentHash = leafHash;

    for (const element of proof) {
      if (element.position === 'left') {
        currentHash = hashBranch(element.hash, currentHash);
      } else {
        currentHash = hashBranch(currentHash, element.hash);
      }
    }

    return currentHash === expectedRoot;
  }
}
