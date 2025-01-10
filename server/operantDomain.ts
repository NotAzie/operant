import { resolveTemporalAssertions } from "./domain/temporal";

export const ACTION_STATES = [
  "proposed",
  "authorized",
  "submitted",
  "accepted",
  "executing",
  "confirmed",
  "failed",
  "rejected",
  "expired",
  "unknown",
] as const;

export type ActionState = (typeof ACTION_STATES)[number];
export type MemberRole = "owner" | "admin" | "editor" | "viewer";

const roleRank: Record<MemberRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function canAccessRole(role: MemberRole, minimum: MemberRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

const transitions: Record<ActionState, readonly ActionState[]> = {
  proposed: ["authorized", "rejected", "expired"],
  authorized: ["submitted", "failed", "expired", "unknown"],
  submitted: ["accepted", "executing", "failed", "unknown"],
  accepted: ["executing", "failed", "unknown"],
  executing: ["confirmed", "failed", "unknown"],
  confirmed: [],
  failed: [],
  rejected: [],
  expired: [],
  unknown: ["confirmed", "failed", "expired"],
};

export function canTransitionAction(from: ActionState, to: ActionState): boolean {
  return transitions[from].includes(to);
}

export function isStaleAt(observedAt: Date, staleAfterDays: number, now = new Date()): boolean {
  if (!Number.isFinite(staleAfterDays) || staleAfterDays < 0) return false;
  const ageMs = now.getTime() - observedAt.getTime();
  return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
}

export interface ConflictObservation {
  id: number;
  entityId: number | null;
  attributeKey: string;
  value: string;
  supersedesObservationId: number | null;
  recordedAt?: Date | string;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  sourceType?: string | null;
  sourceProvider?: string | null;
  sourceConnectionId?: number | null;
}

export interface ConflictGroup {
  entityId: number | null;
  attributeKey: string;
  observations: ConflictObservation[];
}

export type ConflictTarget = Pick<ConflictObservation, "entityId" | "attributeKey">;

export function conflictObservationKey(observation: ConflictTarget): string {
  return `${observation.entityId ?? "none"}:${observation.attributeKey.trim().toLowerCase()}`;
}

export function uniqueConflictTargets(observations: ConflictTarget[]): ConflictTarget[] {
  const targets = new Map<string, ConflictTarget>();
  for (const observation of observations) {
    const target = { entityId: observation.entityId, attributeKey: observation.attributeKey.trim().toLowerCase() };
    targets.set(conflictObservationKey(target), target);
  }
  return [...targets.values()];
}

export function groupConflictObservations<T extends ConflictObservation>(observations: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const observation of observations) {
    const key = conflictObservationKey(observation);
    const rows = groups.get(key) ?? [];
    rows.push(observation);
    groups.set(key, rows);
  }
  return groups;
}

export type ConflictWindowAssessment =
  | { status: "complete"; conflicts: ConflictGroup[] }
  | { status: "incomplete"; conflicts: null };

export function findActiveConflicts(observations: ConflictObservation[], asOf = new Date()): ConflictGroup[] {
  const knownNow = observations.map((observation) => ({
    ...observation,
    recordedAt: observation.recordedAt ?? asOf,
    validFrom: observation.validFrom ?? null,
    validTo: observation.validTo ?? null,
    sourceType: observation.sourceType ?? null,
    sourceProvider: observation.sourceProvider ?? null,
    sourceConnectionId: observation.sourceConnectionId ?? null,
  }));
  const current = resolveTemporalAssertions(knownNow, asOf, asOf);
  const groups = new Map<string, ConflictObservation[]>();

  for (const observation of current) {
    const key = conflictObservationKey(observation);
    const current = groups.get(key) ?? [];
    current.push(observation);
    groups.set(key, current);
  }

  return [...groups.values()]
    .filter((group) => new Set(group.map((item) => item.value.trim().toLocaleLowerCase())).size > 1)
    .map((group) => ({
      entityId: group[0]?.entityId ?? null,
      attributeKey: group[0]?.attributeKey ?? "unknown",
      observations: group,
    }));
}

export function assessConflictWindow(observations: ConflictObservation[], maximumRows: number, asOf = new Date()): ConflictWindowAssessment {
  if (observations.length > maximumRows) return { status: "incomplete", conflicts: null };
  return { status: "complete", conflicts: findActiveConflicts(observations, asOf) };
}
