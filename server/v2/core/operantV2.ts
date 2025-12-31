/**
 * Operant V2 Transcendent Core Engine
 *
 * Collapses the entire operational intelligence universe into a single-op
 * "Pulse" paradigm. Hides bit-parallel tensors, persistent HAMT structural
 * sharing, causal DAGs, formal invariant verification, holographic Merkle
 * proofs, autonomous remediation, and federated vector clocks beneath an
 * impossibly clean interface.
 */

import { BitParallelRealityTensor } from '../kernel/bitsetTensor';
import { PersistentHAMT } from '../kernel/persistentHamt';
import { CausalGraph } from '../../domain/causality';
import { InvariantEngine, type OperationalInvariant, type InvariantViolation } from '../simulation/invariantEngine';
import { CounterfactualSimulator, type CounterfactualResult, type HypotheticalDivergence } from '../simulation/counterfactual';
import { MerkleTree, type MerkleProofElement } from '../../domain/merkle';
import { RemediationSynthesizer, type RemediationPlan } from '../autonomous/remediation';
import { EntropyPredictor, type EntropyForecast } from '../autonomous/entropyPredictor';
import { FederatedConsensusMesh, type FederatedPulsePacket, type VectorClock } from '../autonomous/federation';

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

  public get(key: string): unknown {
    return this.stateHAMT.get(key);
  }

  public isAssertionActiveAt(targetKey: string, assertionId: string | number, epoch: number): boolean {
    return this.tensor.isAssertionActiveAt(targetKey, assertionId, epoch);
  }

  public fork(divergence: HypotheticalDivergence): CounterfactualResult {
    return this.simulator.simulateDivergence(this.stateHAMT, this.causalGraph, divergence);
  }

  public seal(): string {
    return this.merkleTree.getRoot();
  }

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
  private remediationSynthesizer: RemediationSynthesizer;
  private entropyPredictor = new EntropyPredictor();
  private federationMesh: FederatedConsensusMesh;
  private assertionSequence = 0;

  constructor(nodeId: string = 'operant-node-primary') {
    this.simulator = new CounterfactualSimulator(this.invariantEngine);
    this.remediationSynthesizer = new RemediationSynthesizer(this.simulator);
    this.federationMesh = new FederatedConsensusMesh(nodeId);
  }

  public registerInvariant(invariant: OperationalInvariant): void {
    this.invariantEngine.register(invariant);
  }

  public addCausalRelation(
    from: string,
    to: string,
    relation: 'CAUSES' | 'DERIVES_FROM' | 'JUSTIFIES' | 'TRIGGERED_BY' | 'SUPERSEDES'
  ): void {
    this.causalGraph.addEdge(from, to, relation);
  }

  public async pulse(pulse: PulseDelta): Promise<HolographicReality> {
    const now = pulse.timestamp ?? Date.now();
    const startEpoch = pulse.validEpoch?.startEpoch ?? Math.floor(now / 1000);
    const endEpoch = pulse.validEpoch?.endEpoch ?? null;

    let mutationCount = 0;
    for (const [key, val] of Object.entries(pulse.deltas)) {
      this.assertionSequence++;
      mutationCount++;
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

    // Record epoch observation for wavelet entropy predictor
    this.entropyPredictor.recordEpoch(startEpoch, mutationCount, 0);

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

  public synthesizeRemediations(violations: InvariantViolation[]): RemediationPlan[] {
    return this.remediationSynthesizer.synthesize(violations, this.currentStateHAMT, this.causalGraph);
  }

  public forecastEntropy(horizonEpochs: number = 10): EntropyForecast {
    return this.entropyPredictor.forecast(horizonEpochs);
  }

  public getVectorClock(): VectorClock {
    return this.federationMesh.getVectorClock();
  }

  public syncFederation(
    localState: Record<string, { value: unknown; authorityTier: number; timestamp: number }>,
    packet: FederatedPulsePacket
  ): Record<string, { value: unknown; authorityTier: number; timestamp: number }> {
    return this.federationMesh.reconcile(localState, packet);
  }
}
