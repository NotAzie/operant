import { describe, expect, it } from 'vitest';
import { OperantV2 } from './operantV2';

describe('OperantV2 (Single-Op Pulse Paradigm)', () => {
  it('pulses operational deltas and retrieves state in O(1)', async () => {
    const operant = new OperantV2();

    const reality = await operant.pulse({
      source: 'telemetry_probe',
      timestamp: 1000,
      deltas: {
        'service:auth:health': 'UP',
        'service:billing:health': 'DEGRADED',
      },
      validEpoch: { startEpoch: 1, endEpoch: 50 },
    });

    expect(reality.get('service:auth:health')).toBe('UP');
    expect(reality.get('service:billing:health')).toBe('DEGRADED');
    expect(reality.seal()).toHaveLength(64); // Sealed cryptographic Merkle root!
    expect(reality.isAssertionActiveAt('service:auth:health', 'assert-1', 25)).toBe(true);
    expect(reality.isAssertionActiveAt('service:auth:health', 'assert-1', 100)).toBe(false);
  });

  it('performs counterfactual quantum branching directly from the pulsed reality', async () => {
    const operant = new OperantV2();

    operant.registerInvariant({
      id: 'INV_CRITICAL_SERVICE_UP',
      name: 'Critical Service Availability',
      operator: 'ALWAYS',
      description: 'Core payment gateway must remain available',
      evaluate: (state) => state['service:payment:health'] !== 'FAILED',
    });

    const reality = await operant.pulse({
      source: 'init_pulse',
      deltas: {
        'service:payment:health': 'UP',
        'service:payment:latencyMs': 45,
      },
    });

    // Fork a safe ghost timeline
    const safeSimulation = reality.fork({
      divergenceId: 'sim-load-increase',
      sourceTimestamp: 2000,
      label: 'Simulate high latency',
      stateMutations: {
        'service:payment:latencyMs': 250,
      },
    });
    expect(safeSimulation.isSafeToExecute).toBe(true);
    expect(safeSimulation.violations).toHaveLength(0);

    // Fork a hazardous ghost timeline
    const hazardSimulation = reality.fork({
      divergenceId: 'sim-service-crash',
      sourceTimestamp: 2000,
      label: 'Simulate payment service crash',
      stateMutations: {
        'service:payment:health': 'FAILED',
      },
    });
    expect(hazardSimulation.isSafeToExecute).toBe(false);
    expect(hazardSimulation.violations).toHaveLength(1);
    expect(hazardSimulation.violations[0].invariantId).toBe('INV_CRITICAL_SERVICE_UP');
  });
});
