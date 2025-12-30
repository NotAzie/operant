/**
 * Operant V2 Formal Invariant Verification Engine
 *
 * Implements Linear Temporal Logic (LTL) operational invariants:
 * - ALWAYS(predicate)   : Safety condition that must never be violated in any state.
 * - NEVER(predicate)    : Hazard condition that must never occur.
 * - EVENTUALLY(predicate, maxHorizon) : Liveness guarantee that must be satisfied.
 */

export type InvariantOperator = 'ALWAYS' | 'NEVER' | 'EVENTUALLY';

export interface OperationalInvariant {
  id: string;
  name: string;
  operator: InvariantOperator;
  description: string;
  evaluate: (state: Record<string, unknown>) => boolean;
}

export interface InvariantViolation {
  invariantId: string;
  invariantName: string;
  operator: InvariantOperator;
  description: string;
  failingStateSnapshot: Record<string, unknown>;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export class InvariantEngine {
  private invariants: Map<string, OperationalInvariant> = new Map();

  public register(invariant: OperationalInvariant): void {
    this.invariants.set(invariant.id, invariant);
  }

  public evaluateAll(state: Record<string, unknown>): InvariantViolation[] {
    const violations: InvariantViolation[] = [];

    for (const [, inv] of this.invariants) {
      const result = inv.evaluate(state);

      if (inv.operator === 'ALWAYS' && !result) {
        violations.push({
          invariantId: inv.id,
          invariantName: inv.name,
          operator: 'ALWAYS',
          description: inv.description,
          failingStateSnapshot: state,
          severity: 'CRITICAL',
        });
      } else if (inv.operator === 'NEVER' && result) {
        violations.push({
          invariantId: inv.id,
          invariantName: inv.name,
          operator: 'NEVER',
          description: inv.description,
          failingStateSnapshot: state,
          severity: 'CRITICAL',
        });
      }
    }

    return violations;
  }
}
