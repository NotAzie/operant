import { describe, expect, it } from 'vitest';
import { MerkleTree, canonicalStringify, hashLeaf } from './merkle';

describe('MerkleTree', () => {
  it('canonicalStringify produces deterministic output regardless of key order', () => {
    const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const objB = { a: 2, z: 1, m: { a: 4, b: 3 } };
    expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
    expect(hashLeaf(objA)).toBe(hashLeaf(objB));
  });

  it('generates consistent root and handles empty tree', () => {
    const emptyTree = new MerkleTree([]);
    expect(emptyTree.getRoot()).toBe('0'.repeat(64));
    expect(emptyTree.getLeafCount()).toBe(0);
  });

  it('generates valid cryptographic inclusion proofs for all leaves', () => {
    const assertions = [
      { id: 1, entity: 'E1', attr: 'status', val: 'ACTIVE' },
      { id: 2, entity: 'E2', attr: 'tier', val: 'PRO' },
      { id: 3, entity: 'E3', attr: 'risk', val: 'LOW' },
      { id: 4, entity: 'E4', attr: 'auth', val: 'GRANTED' },
      { id: 5, entity: 'E5', attr: 'state', val: 'PENDING' },
    ];

    const tree = new MerkleTree(assertions);
    const root = tree.getRoot();
    expect(root).toHaveLength(64);

    for (let i = 0; i < assertions.length; i++) {
      const leafHash = tree.getLeaf(i)!;
      const proof = tree.generateProof(i);
      const isValid = MerkleTree.verifyProof(leafHash, proof, root);
      expect(isValid).toBe(true);
    }
  });

  it('rejects forged inclusion proofs or altered leaf hashes', () => {
    const assertions = [
      { id: 1, val: 'A' },
      { id: 2, val: 'B' },
      { id: 3, val: 'C' },
    ];

    const tree = new MerkleTree(assertions);
    const root = tree.getRoot();

    const leafHash0 = tree.getLeaf(0)!;
    const proof0 = tree.generateProof(0);

    // Tamper with leaf hash
    const fakeHash = 'a'.repeat(64);
    expect(MerkleTree.verifyProof(fakeHash, proof0, root)).toBe(false);

    // Tamper with root
    const fakeRoot = 'b'.repeat(64);
    expect(MerkleTree.verifyProof(leafHash0, proof0, fakeRoot)).toBe(false);

    // Tamper with proof element
    const corruptedProof = proof0.map((p) => ({ ...p, hash: 'f'.repeat(64) }));
    expect(MerkleTree.verifyProof(leafHash0, corruptedProof, root)).toBe(false);
  });
});
