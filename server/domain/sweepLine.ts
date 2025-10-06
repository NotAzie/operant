/**
 * Operant Bi-Temporal Interval Sweep-Line Engine
 *
 * Implements an O(N log N) computational geometry sweep-line algorithm for
 * high-throughput interval intersection and attribute collision detection
 * across temporal reality assertions.
 *
 * Replaces O(N^2) naive pairwise interval comparison.
 */

export interface TemporalInterval {
  id: string | number;
  entityId: string | number;
  attributeKey: string;
  validFrom: Date | string | number;
  validTo: Date | string | number | null;
  value?: unknown;
  confidence?: number;
}

export interface SweepConflict {
  entityId: string | number;
  attributeKey: string;
  assertionAId: string | number;
  assertionBId: string | number;
  overlapStart: number;
  overlapEnd: number;
  contradictoryValues: boolean;
}

type EventType = 'END' | 'START';

interface SweepEvent {
  timestamp: number;
  type: EventType;
  interval: TemporalInterval;
}

function toEpochMs(val: Date | string | number | null | undefined): number {
  if (val === null || val === undefined) return Number.POSITIVE_INFINITY;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  const parsed = new Date(val).getTime();
  if (isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return parsed;
}

/**
 * Sweeps a collection of temporal intervals and detects overlapping contradictory assertions.
 * Complexity: O(N log N) where N is the number of intervals in the workspace.
 */
export function sweepLineIntervalConflicts(
  intervals: TemporalInterval[]
): SweepConflict[] {
  if (!intervals || intervals.length < 2) return [];

  // Group by (entityId, attributeKey) to avoid cross-attribute false positives
  const groups = new Map<string, TemporalInterval[]>();
  for (const interval of intervals) {
    const key = `${String(interval.entityId)}::${interval.attributeKey}`;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(interval);
  }

  const conflicts: SweepConflict[] = [];

  for (const [, groupIntervals] of groups) {
    if (groupIntervals.length < 2) continue;

    const events: SweepEvent[] = [];
    for (const iv of groupIntervals) {
      const startMs = toEpochMs(iv.validFrom);
      const endMs = toEpochMs(iv.validTo);

      if (endMs <= startMs) {
        // Degenerate or invalid interval; skip or treat as instantaneous
        continue;
      }

      events.push({ timestamp: startMs, type: 'START', interval: iv });
      if (endMs !== Number.POSITIVE_INFINITY) {
        events.push({ timestamp: endMs, type: 'END', interval: iv });
      }
    }

    // Sort events:
    // 1. By timestamp ascending
    // 2. If equal, 'END' before 'START' (half-open [start, end) semantics: end at t does not overlap start at t)
    events.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.type !== b.type) {
        return a.type === 'END' ? -1 : 1;
      }
      return 0;
    });

    const activeSet = new Map<string | number, { interval: TemporalInterval; startMs: number }>();

    for (const ev of events) {
      const iv = ev.interval;
      if (ev.type === 'START') {
        const startMs = ev.timestamp;
        const endMs = toEpochMs(iv.validTo);

        // Check overlap against all currently active intervals
        for (const [activeId, active] of activeSet) {
          const activeEndMs = toEpochMs(active.interval.validTo);
          const overlapStart = Math.max(startMs, active.startMs);
          const overlapEnd = Math.min(endMs, activeEndMs);

          if (overlapEnd > overlapStart) {
            const valA = JSON.stringify(iv.value);
            const valB = JSON.stringify(active.interval.value);
            const contradictory = valA !== valB;

            conflicts.push({
              entityId: iv.entityId,
              attributeKey: iv.attributeKey,
              assertionAId: activeId,
              assertionBId: iv.id,
              overlapStart,
              overlapEnd,
              contradictoryValues: contradictory,
            });
          }
        }

        activeSet.set(iv.id, { interval: iv, startMs });
      } else {
        // END event
        activeSet.delete(iv.id);
      }
    }
  }

  return conflicts;
}
