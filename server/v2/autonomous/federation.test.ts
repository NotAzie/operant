import { describe, expect, it } from 'vitest';
import { FederatedConsensusMesh, type FederatedPulsePacket } from './federation';

describe('FederatedConsensusMesh (Vector Clock Consensus)', () => {
  it('correctly tracks and compares vector clock causal relationships', () => {
    const meshA = new FederatedConsensusMesh('node-A');
    const clockA1 = meshA.tick(); // A: 1

    const meshB = new FederatedConsensusMesh('node-B');
    const clockB1 = meshB.tick(); // B: 1

    // Concurrent
    expect(FederatedConsensusMesh.compare(clockA1, clockB1)).toBeNull();

    // After A learns of B
    meshA.reconcile({}, {
      originNodeId: 'node-B',
      vectorClock: clockB1,
      merkleRoot: 'abc',
      deltas: {},
    });

    const clockA2 = meshA.tick(); // A: 3, B: 1
    // Now A dominates B
    expect(FederatedConsensusMesh.compare(clockA2, clockB1)).toBe(1);
    expect(FederatedConsensusMesh.compare(clockB1, clockA2)).toBe(-1);
  });

  it('deterministically resolves concurrent conflicting deltas using authority tiers', () => {
    const mesh = new FederatedConsensusMesh('local-node');
    const localState = {
      'system:mode': { value: 'MAINTENANCE', authorityTier: 1, timestamp: 1000 },
    };

    const incoming: FederatedPulsePacket = {
      originNodeId: 'primary-node',
      vectorClock: { 'primary-node': 1 },
      merkleRoot: '0'.repeat(64),
      deltas: {
        'system:mode': { value: 'PRODUCTION', authorityTier: 2, timestamp: 900 },
      },
    };

    const reconciled = mesh.reconcile(localState, incoming);
    // Authority tier 2 wins over tier 1 even though timestamp was earlier
    expect(reconciled['system:mode'].value).toBe('PRODUCTION');
  });
});
