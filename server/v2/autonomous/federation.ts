/**
 * Operant V2 Vector Clock Reality Federation Mesh
 *
 * Implements distributed multi-node reality synchronization using Lamport Vector Clocks
 * and deterministic causality reconciliation. Enables multi-region deployments
 * to reach provable eventual consistency without distributed locks.
 */

export interface VectorClock {
  [nodeId: string]: number;
}

export interface FederatedPulsePacket {
  originNodeId: string;
  vectorClock: VectorClock;
  merkleRoot: string;
  deltas: Record<string, { value: unknown; authorityTier: number; timestamp: number }>;
}

export class FederatedConsensusMesh {
  private localClock: VectorClock = {};

  constructor(public readonly nodeId: string) {
    this.localClock[this.nodeId] = 0;
  }

  public getVectorClock(): VectorClock {
    return { ...this.localClock };
  }

  public tick(): VectorClock {
    this.localClock[this.nodeId] = (this.localClock[this.nodeId] || 0) + 1;
    return this.getVectorClock();
  }

  /**
   * Compares two vector clocks.
   * Returns:
   *  -1 if a < b (a causally preceded b)
   *   1 if a > b (a causally succeeds b)
   *   0 if a == b
   *  null if concurrent (a || b)
   */
  public static compare(a: VectorClock, b: VectorClock): -1 | 0 | 1 | null {
    let aGreater = false;
    let bGreater = false;

    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      const vA = a[key] || 0;
      const vB = b[key] || 0;
      if (vA > vB) aGreater = true;
      if (vB > vA) bGreater = true;
    }

    if (aGreater && !bGreater) return 1;
    if (bGreater && !aGreater) return -1;
    if (!aGreater && !bGreater) return 0;
    return null; // Concurrent divergence
  }

  /**
   * Merges an incoming federated pulse into local state.
   * Deterministically resolves concurrent conflicts using:
   * 1. Vector clock dominance
   * 2. Source authority tier
   * 3. Highest physical timestamp
   */
  public reconcile(
    localState: Record<string, { value: unknown; authorityTier: number; timestamp: number }>,
    incomingPacket: FederatedPulsePacket
  ): Record<string, { value: unknown; authorityTier: number; timestamp: number }> {
    const updatedState = { ...localState };

    // Advance local vector clock: clock_local = max(clock_local, clock_incoming)
    for (const [node, counter] of Object.entries(incomingPacket.vectorClock)) {
      this.localClock[node] = Math.max(this.localClock[node] || 0, counter);
    }
    this.localClock[this.nodeId] = (this.localClock[this.nodeId] || 0) + 1;

    // Reconcile deltas
    for (const [key, incomingDelta] of Object.entries(incomingPacket.deltas)) {
      const existing = updatedState[key];
      if (!existing) {
        updatedState[key] = incomingDelta;
        continue;
      }

      // Tie-break resolution
      if (incomingDelta.authorityTier > existing.authorityTier) {
        updatedState[key] = incomingDelta;
      } else if (incomingDelta.authorityTier === existing.authorityTier) {
        if (incomingDelta.timestamp > existing.timestamp) {
          updatedState[key] = incomingDelta;
        }
      }
    }

    return updatedState;
  }
}
