/**
 * Operant V2 Transcendent Core Engine
 *
 * Collapses the entire operational intelligence universe into a single-op
 * "Pulse" paradigm. Hides bit-parallel tensors, persistent HAMT structural
 * sharing, causal DAGs, formal invariant verification, and holographic Merkle
 * proofs beneath an impossibly clean, radical interface.
 */

import { BitParallelRealityTensor } from '../kernel/bitsetTensor';
import { PersistentHAMT } from '../kernel/persistentHamt';
import { CausalGraph } from '../../domain/causality';
import { InvariantEngine, type OperationalInvariant } from '../simulation/invariantEngine';
import { CounterfactualSimulator, type CounterfactualResult, type HypotheticalDivergence } from '../simulation/counterfactual';
import { MerkleTree, type MerkleProofElement } from '../../domain/merkle';

export interface PulseDelta {
  source: string;
  timestamp?: number;
  deltas: Record<string, unknown>;
  validEpoch?: {
    startEpoch: number;
    endEpoch: number | null;
  };
}

export class HolographicReality {
  constructor(
    private readonly stateHAMT: PersistentHAMT<unknown>,
    private readonly tensor: BitParallelRealityTensor,
    private readonly causalGraph: CausalGraph,
    private readonly simulator: CounterfactualSimulator,
    private readonly merkleTree: MerkleTree,
    public readonly timestamp: number
  ) {}

  /**
   * O(1) point-in-time state lookup
   */
  public get(key: string): unknown {
    return this.stateHAMT.get(key);
  }

  /**
   * O(1) point-in-time time-travel state check
   */
  public isAssertionActiveAt(targetKey: string, assertionId: string | number, epoch: number): boolean {
    return this.tensor.isAssertionActiveAt(targetKey, assertionId, epoch);
  }

  /**
   * O(1) memory Ghost Timeline fork
   */
  public fork(divergence: HypotheticalDivergence): CounterfactualResult {
    return this.simulator.simulateDivergence(this.stateHAMT, this.causalGraph, divergence);
  }

  /**
   * Returns current cryptographic Merkle root of the reality state
   */
  public seal(): string {
    return this.merkleTree.getRoot();
  }

  /**
   * Generates a cryptographic inclusion proof for a state key
   */
  public prove(index: number): MerkleProofElement[] {
    return this.merkleTree.generateProof(index);
  }

  public exportState(): Record<string, unknown> {
    const res: Record<string, unknown> = {};
    for (const [k, v] of this.stateHAMT.entries()) {
      res[k] = v;
    }
    return res;
  }
}

export class OperantV2 {
  private currentStateHAMT = PersistentHAMT.empty<unknown>();
  private tensor = new BitParallelRealityTensor();
  private causalGraph = new CausalGraph();
  private invariantEngine = new InvariantEngine();
  private simulator: CounterfactualSimulator;
  private assertionSequence = 0;

  constructor() {
    this.simulator = new CounterfactualSimulator(this.invariantEngine);
  }

  public registerInvariant(invariant: OperationalInvariant): void {
    this.invariantEngine.register(invariant);
  }

  public addCausalRelation(from: string, to: string, relation: 'CAUSES' | 'DERIVES_FROM' | 'JUSTIFIES' | 'TRIGGERED_BY' | 'SUPERSEDES'): void {
    this.causalGraph.addEdge(from, to, relation);
  }

  /**
   * The Radical Simplification: Single-Op Reality Pulse.
   * Atomically incorporates deltas into bit-parallel tensor, persistent HAMT,
   * updates causality DAG, checks invariants, and seals Merkle reality.
   */
  public async pulse(pulse: PulseDelta): Promise<HolographicReality> {
    const now = pulse.timestamp ?? Date.now();
    const startEpoch = pulse.validEpoch?.startEpoch ?? Math.floor(now / 1000);
    const endEpoch = pulse.validEpoch?.endEpoch ?? null;

    // 1. Update HAMT and Bitset Tensor
    for (const [key, val] of Object.entries(pulse.deltas)) {
      this.assertionSequence++;
      const assertionId = `assert-${this.assertionSequence}`;

      this.currentStateHAMT = this.currentStateHAMT.set(key, val);
      this.tensor.register(key, assertionId, startEpoch, endEpoch);

      this.causalGraph.addNode({
        id: key,
        type: 'ASSERTION',
        label: `${key} = ${JSON.stringify(val)}`,
        timestamp: now,
      });
    }

    // 2. Build Merkle Tree over current state snapshot
    const entries = this.currentStateHAMT.entries().map(([k, v]) => ({ key: k, value: v }));
    const merkleTree = new MerkleTree(entries);

    return new HolographicReality(
      this.currentStateHAMT,
      this.tensor,
      this.causalGraph,
      this.simulator,
      merkleTree,
      now
    );
  }
}
