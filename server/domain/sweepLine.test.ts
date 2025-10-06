import { describe, expect, it } from 'vitest';
import { sweepLineIntervalConflicts, type TemporalInterval } from './sweepLine';

describe('sweepLineIntervalConflicts', () => {
  it('returns empty array when no intervals or fewer than 2 intervals are provided', () => {
    expect(sweepLineIntervalConflicts([])).toEqual([]);
    expect(
      sweepLineIntervalConflicts([
        {
          id: '1',
          entityId: 'ent-1',
          attributeKey: 'status',
          validFrom: '2025-01-01T00:00:00Z',
          validTo: '2025-01-02T00:00:00Z',
          value: 'OPEN',
        },
      ])
    ).toEqual([]);
  });

  it('detects overlap between contradictory intervals on the same entity and attribute', () => {
    const intervals: TemporalInterval[] = [
      {
        id: 'assert-1',
        entityId: 'ent-100',
        attributeKey: 'state',
        validFrom: 1000,
        validTo: 5000,
        value: 'ACTIVE',
      },
      {
        id: 'assert-2',
        entityId: 'ent-100',
        attributeKey: 'state',
        validFrom: 3000,
        validTo: 8000,
        value: 'SUSPENDED',
      },
    ];

    const conflicts = sweepLineIntervalConflicts(intervals);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      entityId: 'ent-100',
      attributeKey: 'state',
      assertionAId: 'assert-1',
      assertionBId: 'assert-2',
      overlapStart: 3000,
      overlapEnd: 5000,
      contradictoryValues: true,
    });
  });

  it('honors half-open [start, end) semantics: contiguous adjacent intervals do not conflict', () => {
    const intervals: TemporalInterval[] = [
      {
        id: 'assert-1',
        entityId: 'ent-100',
        attributeKey: 'state',
        validFrom: 1000,
        validTo: 5000,
        value: 'ACTIVE',
      },
      {
        id: 'assert-2',
        entityId: 'ent-100',
        attributeKey: 'state',
        validFrom: 5000,
        validTo: 9000,
        value: 'COMPLETED',
      },
    ];

    const conflicts = sweepLineIntervalConflicts(intervals);
    expect(conflicts).toHaveLength(0);
  });

  it('does not conflict across different entity IDs or attribute keys', () => {
    const intervals: TemporalInterval[] = [
      {
        id: 'assert-1',
        entityId: 'ent-1',
        attributeKey: 'state',
        validFrom: 1000,
        validTo: 5000,
        value: 'A',
      },
      {
        id: 'assert-2',
        entityId: 'ent-2',
        attributeKey: 'state',
        validFrom: 2000,
        validTo: 4000,
        value: 'B',
      },
      {
        id: 'assert-3',
        entityId: 'ent-1',
        attributeKey: 'tier',
        validFrom: 1000,
        validTo: 5000,
        value: 'ENTERPRISE',
      },
    ];

    const conflicts = sweepLineIntervalConflicts(intervals);
    expect(conflicts).toHaveLength(0);
  });

  it('handles unbounded validTo (null) correctly', () => {
    const intervals: TemporalInterval[] = [
      {
        id: 'assert-1',
        entityId: 'ent-1',
        attributeKey: 'state',
        validFrom: 1000,
        validTo: null,
        value: 'ACTIVE',
      },
      {
        id: 'assert-2',
        entityId: 'ent-1',
        attributeKey: 'state',
        validFrom: 2000,
        validTo: 4000,
        value: 'DORMANT',
      },
    ];

    const conflicts = sweepLineIntervalConflicts(intervals);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapStart).toBe(2000);
    expect(conflicts[0].overlapEnd).toBe(4000);
  });
});
