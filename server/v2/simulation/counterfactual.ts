/**
 * Operant V2 Counterfactual Quantum Branching & Simulation Engine (DCQB)
 *
 * Implements deterministic timeline divergence and forward blast-radius
 * projection. Enables operators to fork reality in O(1) memory, inject
 * hypothetical mutations, cascade causal dependencies along the DAG,
 * and verify operational invariants without touching persistent consensus state.
 */

import { createHash } from 'node:crypto';
import { PersistentHAMT } from '../kernel/persistentHamt';
import { CausalGraph } from '../../domain/causality';
import { InvariantEngine, type InvariantViolation } from './invariantEngine';

export interface HypotheticalDivergence {
  divergenceId: string;
  sourceTimestamp: number;
  label: string;
  stateMutations: Record<string, unknown>;
  triggerAction?: string;
}

export interface CounterfactualResult {
  divergenceId: string;
  forkTimestamp: number;
  blastRadiusCount: number;
  affectedKeys: string[];
  divergenceDelta: Array<{
    key: string;
    consensusValue: unknown;
    counterfactualValue: unknown;
  }>;
  violations: InvariantViolation[];
  entropyScore: number; // 0.0 (perfectly stable) to 1.0 (extreme cascade hazard)
  isSafeToExecute: boolean;
  simulationWitnessHash: string;
}

export class CounterfactualSimulator {
  constructor(
    private readonly invariantEngine: InvariantEngine = new InvariantEngine()
  ) {}

  /**
   * Forks a consensus state into a Ghost Timeline and computes forward trajectory.
   * Runs in O(D + K) where D is the divergence size and K is the downstream causal fan-out.
   */
  public simulateDivergence(
    consensusState: PersistentHAMT<unknown>,
    causalGraph: CausalGraph,
    divergence: HypotheticalDivergence
  ): CounterfactualResult {
    // 1. O(1) Ghost Branch creation via HAMT structural sharing
    let ghostBranch = consensusState.fork();
    const affectedKeysSet = new Set<string>();
    const delta: CounterfactualResult['divergenceDelta'] = [];

    // 2. Apply initial divergences
    for (const [key, newVal] of Object.entries(divergence.stateMutations)) {
      const oldVal = consensusState.get(key);
      if (oldVal !== newVal) {
        ghostBranch = ghostBranch.set(key, newVal);
        affectedKeysSet.add(key);
        delta.push({
          key,
          consensusValue: oldVal,
          counterfactualValue: newVal,
        });
      }
    }

    // 3. Forward causal cascade projection along the DAG
    for (const key of Object.keys(divergence.stateMutations)) {
      const downstreamImpact = causalGraph.traceDownstreamImpact(key);
      for (const node of downstreamImpact) {
        affectedKeysSet.add(node.id);
        const currentVal = ghostBranch.get(node.id);
        // Cascade simulated synthetic status
        const syntheticVal = `CASCADE_FROM:${key}`;
        ghostBranch = ghostBranch.set(node.id, syntheticVal);
        delta.push({
          key: node.id,
          consensusValue: currentVal,
          counterfactualValue: syntheticVal,
        });
      }
    }

    // 4. Invariant Verification
    const ghostStateRecord: Record<string, unknown> = {};
    for (const [k, v] of ghostBranch.entries()) {
      ghostStateRecord[k] = v;
    }
    const violations = this.invariantEngine.evaluateAll(ghostStateRecord);

    // 5. Entropy & Blast Radius Calculation
    const blastRadius = affectedKeysSet.size;
    // Normalized entropy heuristic based on blast radius and violation severity
    const violationPenalty = violations.length * 0.25;
    const blastFactor = Math.min(0.5, blastRadius / 20);
    const entropyScore = Math.min(1.0, violationPenalty + blastFactor);

    // 6. Cryptographic Witness Digest
    const witnessPayload = JSON.stringify({
      divergenceId: divergence.divergenceId,
      delta,
      violationsCount: violations.length,
      entropyScore,
    });
    const simulationWitnessHash = createHash('sha256').update(witnessPayload).digest('hex');

    return {
      divergenceId: divergence.divergenceId,
      forkTimestamp: divergence.sourceTimestamp,
      blastRadiusCount: blastRadius,
      affectedKeys: Array.from(affectedKeysSet),
      divergenceDelta: delta,
      violations,
      entropyScore: Number(entropyScore.toFixed(3)),
      isSafeToExecute: violations.length === 0 && entropyScore < 0.6,
      simulationWitnessHash,
    };
  }
}
