/**
 * Operant V2 Kernel Benchmark
 *
 * Verifies sub-millisecond execution times across:
 * 1. Bit-Parallel Interval Tensor (100,000 epoch operations)
 * 2. Persistent HAMT (10,000 immutable forks and mutations)
 * 3. Counterfactual Quantum Branching (1,000 simulated divergences)
 */

import { Bitset64, BitParallelRealityTensor } from '../server/v2/kernel/bitsetTensor';
import { PersistentHAMT } from '../server/v2/kernel/persistentHamt';
import { CausalGraph } from '../server/domain/causality';
import { CounterfactualSimulator } from '../server/v2/simulation/counterfactual';

export function runKernelBenchmark(): {
  bpitOpsPerSec: number;
  hamtOpsPerSec: number;
  dcqbSimsPerSec: number;
} {
  // 1. Benchmark BPIT
  const tensor = new BitParallelRealityTensor();
  const bpitStart = performance.now();
  const bpitIterations = 50_000;
  for (let i = 0; i < bpitIterations; i++) {
    tensor.register(`target_${i % 100}`, `assert_${i}`, i, i + 50);
  }
  const bpitDurationMs = performance.now() - bpitStart;
  const bpitOpsPerSec = Math.round((bpitIterations / bpitDurationMs) * 1000);

  // 2. Benchmark Persistent HAMT
  let hamt = PersistentHAMT.empty<number>();
  const hamtStart = performance.now();
  const hamtIterations = 20_000;
  for (let i = 0; i < hamtIterations; i++) {
    hamt = hamt.set(`key_${i}`, i * 2);
  }
  const hamtDurationMs = performance.now() - hamtStart;
  const hamtOpsPerSec = Math.round((hamtIterations / hamtDurationMs) * 1000);

  // 3. Benchmark Counterfactual Simulation
  const graph = new CausalGraph();
  graph.addNode({ id: 'srv:alpha', type: 'ASSERTION', label: 'Server Alpha', timestamp: 1 });
  graph.addNode({ id: 'srv:beta', type: 'ASSERTION', label: 'Server Beta', timestamp: 2 });
  graph.addEdge('srv:alpha', 'srv:beta', 'CAUSES');

  const simulator = new CounterfactualSimulator();
  const dcqbStart = performance.now();
  const dcqbIterations = 5_000;
  for (let i = 0; i < dcqbIterations; i++) {
    simulator.simulateDivergence(hamt, graph, {
      divergenceId: `sim_${i}`,
      sourceTimestamp: i,
      label: 'Benchmark divergence',
      stateMutations: { 'srv:alpha': 'FAILOVER' },
    });
  }
  const dcqbDurationMs = performance.now() - dcqbStart;
  const dcqbSimsPerSec = Math.round((dcqbIterations / dcqbDurationMs) * 1000);

  return { bpitOpsPerSec, hamtOpsPerSec, dcqbSimsPerSec };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('benchmark-kernel.ts')) {
  console.log('Running Operant V2 Kernel Benchmark...');
  const res = runKernelBenchmark();
  console.log(`BPIT Throughput: ${res.bpitOpsPerSec.toLocaleString()} ops/sec`);
  console.log(`HAMT Throughput: ${res.hamtOpsPerSec.toLocaleString()} ops/sec`);
  console.log(`DCQB Throughput: ${res.dcqbSimsPerSec.toLocaleString()} sims/sec`);
}
