import { describe, expect, it } from 'vitest';
import { RemediationSynthesizer } from './remediation';
import { PersistentHAMT } from '../kernel/persistentHamt';
import { CausalGraph } from '../../domain/causality';
import { InvariantEngine, type InvariantViolation } from '../simulation/invariantEngine';
import { CounterfactualSimulator } from '../simulation/counterfactual';

describe('RemediationSynthesizer (Autonomous Auto-Healer)', () => {
  it('synthesizes verified remediation plans from invariant violations', () => {
    const invEngine = new InvariantEngine();
    const simulator = new CounterfactualSimulator(invEngine);
    const synthesizer = new RemediationSynthesizer(simulator);

    let state = PersistentHAMT.empty<string>();
    state = state.set('cluster:node1:health', 'FAILED');

    const graph = new CausalGraph();
    graph.addNode({ id: 'cluster:node1:health', type: 'ASSERTION', label: 'Node 1 Health', timestamp: 100 });

    const violations: InvariantViolation[] = [
      {
        invariantId: 'INV_NODE_QUORUM',
        invariantName: 'Cluster Node Quorum',
        operator: 'ALWAYS',
        description: 'Node health must remain active',
        failingStateSnapshot: { 'cluster:node1:health': 'FAILED' },
        severity: 'CRITICAL',
      },
    ];

    const plans = synthesizer.synthesize(violations, state, graph);
    expect(plans).toHaveLength(1);

    const plan = plans[0];
    expect(plan.sourceViolationId).toBe('INV_NODE_QUORUM');
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].actionType).toBe('FAILOVER');
    expect(plan.actions[0].proposedValue).toBe('STANDBY_REDIRECTED');
    expect(plan.simulatedSafetyVerdict).toBe(true);
    expect(plan.planSignature).toHaveLength(64);
  });
});
