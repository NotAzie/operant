import { describe, expect, it } from 'vitest';
import { PersistentHAMT } from '../kernel/persistentHamt';
import { CausalGraph } from '../../domain/causality';
import { InvariantEngine } from './invariantEngine';
import { CounterfactualSimulator } from './counterfactual';

describe('CounterfactualSimulator (Unfair Advantage Feature)', () => {
  it('forks ghost branch and projects causal blast radius without altering consensus', () => {
    // Setup consensus state
    let consensus = PersistentHAMT.empty<string>();
    consensus = consensus.set('db:primary:region', 'us-east-1');
    consensus = consensus.set('api:gateway:status', 'NOMINAL');
    consensus = consensus.set('billing:pipeline:status', 'ACTIVE');

    // Setup causal dependency DAG
    const graph = new CausalGraph();
    graph.addNode({ id: 'db:primary:region', type: 'ASSERTION', label: 'Primary DB Region', timestamp: 100 });
    graph.addNode({ id: 'api:gateway:status', type: 'ASSERTION', label: 'API Gateway', timestamp: 110 });
    graph.addNode({ id: 'billing:pipeline:status', type: 'OBLIGATION', label: 'Billing Pipeline', timestamp: 120 });

    graph.addEdge('db:primary:region', 'api:gateway:status', 'CAUSES');
    graph.addEdge('api:gateway:status', 'billing:pipeline:status', 'TRIGGERED_BY');

    const simulator = new CounterfactualSimulator();

    // Divergence: simulate primary DB failing over to eu-west-1
    const result = simulator.simulateDivergence(consensus, graph, {
      divergenceId: 'sim-failover-test',
      sourceTimestamp: 1500,
      label: 'Simulate primary DB failover',
      stateMutations: {
        'db:primary:region': 'eu-west-1',
      },
    });

    expect(result.blastRadiusCount).toBe(3); // db, api, billing all cascaded!
    expect(result.affectedKeys).toContain('db:primary:region');
    expect(result.affectedKeys).toContain('api:gateway:status');
    expect(result.affectedKeys).toContain('billing:pipeline:status');
    expect(result.isSafeToExecute).toBe(true);
    expect(result.simulationWitnessHash).toHaveLength(64);

    // Verify consensus remains completely untainted!
    expect(consensus.get('db:primary:region')).toBe('us-east-1');
    expect(consensus.get('api:gateway:status')).toBe('NOMINAL');
  });

  it('detects invariant violation in simulated ghost branch and blocks dangerous action', () => {
    const invEngine = new InvariantEngine();
    invEngine.register({
      id: 'INV_NO_UNAUTHORIZED_REGION',
      name: 'Forbidden Jurisdiction Policy',
      operator: 'NEVER',
      description: 'Customer data must NEVER be routed to restricted regions',
      evaluate: (state) => state['data:storage:jurisdiction'] === 'RESTRICTED_ZONE',
    });

    let consensus = PersistentHAMT.empty<string>();
    consensus = consensus.set('data:storage:jurisdiction', 'US_COMPLIANT');

    const graph = new CausalGraph();
    graph.addNode({ id: 'data:storage:jurisdiction', type: 'ASSERTION', label: 'Data Jurisdiction', timestamp: 100 });

    const simulator = new CounterfactualSimulator(invEngine);

    const result = simulator.simulateDivergence(consensus, graph, {
      divergenceId: 'sim-hazard-test',
      sourceTimestamp: 2000,
      label: 'Dangerous routing mutation',
      stateMutations: {
        'data:storage:jurisdiction': 'RESTRICTED_ZONE',
      },
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantId).toBe('INV_NO_UNAUTHORIZED_REGION');
    expect(result.isSafeToExecute).toBe(false); // Action blocked by formal invariant!
    expect(result.entropyScore).toBeGreaterThanOrEqual(0.25);
  });
});
