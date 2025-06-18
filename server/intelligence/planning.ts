import { classifyDueDate } from "../../shared/dateRules";

export type PlanEvidence = { id: number; qualityState: string; observedAt: Date | string };
export type PlanObligation = { id: number; title: string; status: string; dueAt: Date | string | null; evidenceId: number | null };
export type PlanObjective = { id: number; title: string; priority: "required" | "preference" };
export type PlanObservation = { id: number; evidenceId: number; value: string };
export type PlanConflict = { id: number; attributeKey: string; observationIds: unknown };
export type PlanResource = { id: number; name: string };
export type PlanResourceVersion = {
  id: number;
  resourceId: number;
  capacity: string | number | null;
  unit: string | null;
  availabilityState: string;
  validFrom: Date | string;
  validTo: Date | string | null;
  recordedAt: Date | string;
  evidenceId: number | null;
  supersedesVersionId: number | null;
};
export type PlanAllocation = {
  resourceId: number;
  amount: string | number;
  unit: string;
  status: string;
  validFrom: Date | string;
  validTo: Date | string | null;
  recordedAt: Date | string;
};
export type PlanResponsibility = {
  id: number;
  responsibilityType: string;
  status: string;
  validFrom: Date | string;
  validTo: Date | string | null;
  recordedAt: Date | string;
};

export type PlanCandidate = {
  id: string;
  kind: "review_objective" | "review_conflict" | "review_obligation" | "review_evidence" | "resource_constraint";
  title: string;
  priority: "high" | "medium" | "low";
  reason: string;
  evidenceIds: number[];
  objectiveIds: number[];
  targetId: number;
};

export type CandidatePlan = {
  generatedAt: string;
  mode: "advisory";
  policies: { dueSoonDays: number; staleAfterDays: number };
  objectives: Array<{ id: number; title: string; priority: string }>;
  candidates: PlanCandidate[];
  resourceConstraints: Array<{
    resourceId: number;
    name: string;
    availabilityState: string;
    capacity: string | null;
    unit: string | null;
    activeAllocated: string | null;
    overAllocated: boolean;
    evidenceVersionId: number | null;
    evidenceId: number | null;
  }>;
  activeResponsibilityCount: number;
  rules: string[];
};

function instant(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function validAt(from: Date | string, to: Date | string | null, at: Date): boolean {
  const start = instant(from);
  const end = instant(to);
  return start !== null && start <= at.getTime() && (end === null || at.getTime() < end);
}

function milliUnits(value: string | number | null): bigint | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

function decimal(milli: bigint): string {
  const whole = milli / 1000n;
  const fraction = String(milli % 1000n).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function observationIds(value: unknown): number[] {
  let decoded = value;
  if (typeof decoded === "string") {
    try { decoded = JSON.parse(decoded) as unknown; } catch { return []; }
  }
  return Array.isArray(decoded) ? decoded.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0) : [];
}

/**
 * Builds a deterministic review plan from one workspace snapshot. It never
 * chooses a disputed fact, maps an objective implicitly to unrelated records,
 * or authorizes an action. Each active objective gets its own explicit review item.
 */
export function buildCandidatePlan(input: {
  now: Date;
  dueSoonDays: number;
  staleAfterDays: number;
  objectives: PlanObjective[];
  obligations: PlanObligation[];
  evidence: PlanEvidence[];
  conflicts: PlanConflict[];
  observations: PlanObservation[];
  resources: PlanResource[];
  versions: PlanResourceVersion[];
  allocations: PlanAllocation[];
  responsibilities: PlanResponsibility[];
}): CandidatePlan {
  const candidates: PlanCandidate[] = [];
  const knownConflicts = input.conflicts;
  const observationsById = new Map(input.observations.map((row) => [row.id, row]));

  for (const objective of input.objectives) {
    candidates.push({
      id: `objective-${objective.id}`,
      kind: "review_objective",
      title: `Review active objective: ${objective.title}`,
      priority: objective.priority === "required" ? "high" : "low",
      reason: `Explicit ${objective.priority} workspace objective. No obligation, resource, or assertion is implicitly assigned to it; review its current evidence and record explicit links through the governed workflow.`,
      evidenceIds: [],
      objectiveIds: [objective.id],
      targetId: objective.id,
    });
  }

  for (const conflict of knownConflicts) {
    const cited = observationIds(conflict.observationIds).map((id) => observationsById.get(id)?.evidenceId).filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0);
    candidates.push({
      id: `conflict-${conflict.id}`,
      kind: "review_conflict",
      title: `Review conflicting assertions: ${conflict.attributeKey}`,
      priority: "high",
      reason: "Persisted active conflict; Operant does not choose a winning value. Review the linked assertions and their evidence.",
      evidenceIds: [...new Set(cited)],
      objectiveIds: [],
      targetId: conflict.id,
    });
  }

  for (const obligation of input.obligations) {
    const due = classifyDueDate(obligation.dueAt, obligation.status, input.dueSoonDays, input.now);
    if (due === "overdue" || due === "due_soon") {
      candidates.push({
        id: `obligation-${obligation.id}`,
        kind: "review_obligation",
        title: `${due === "overdue" ? "Review overdue" : "Review due soon"}: ${obligation.title}`,
        priority: due === "overdue" ? "high" : "medium",
        reason: `Deterministic UTC due-date rule classified this open obligation as ${due}; window is ${input.dueSoonDays} calendar day(s). This is a review candidate, not an automatic task or action.`,
        evidenceIds: obligation.evidenceId ? [obligation.evidenceId] : [],
        objectiveIds: [],
        targetId: obligation.id,
      });
    }
  }

  for (const record of input.evidence) {
    const stale = record.qualityState === "stale" || (() => {
      const observed = instant(record.observedAt);
      return observed !== null && input.now.getTime() - observed > input.staleAfterDays * 24 * 60 * 60 * 1000;
    })();
    if (stale) candidates.push({
      id: `evidence-${record.id}`,
      kind: "review_evidence",
      title: `Review possibly stale evidence #${record.id}`,
      priority: "medium",
      reason: `Observed at ${new Date(record.observedAt).toISOString()}; the workspace freshness threshold is ${input.staleAfterDays} day(s). Source age is not proof that the claim is false.`,
      evidenceIds: [record.id],
      objectiveIds: [],
      targetId: record.id,
    });
  }

  const knownVersions = input.versions.filter((row) => {
    const recorded = instant(row.recordedAt);
    return recorded !== null && recorded <= input.now.getTime();
  });
  const supersededVersionIds = new Set(knownVersions.map((row) => row.supersedesVersionId).filter((id): id is number => id !== null));
  const currentVersions = knownVersions
    .filter((row) => !supersededVersionIds.has(row.id) && validAt(row.validFrom, row.validTo, input.now))
    .sort((a, b) => (instant(b.recordedAt) ?? 0) - (instant(a.recordedAt) ?? 0));
  const allocationByResource = new Map<number, PlanAllocation[]>();
  for (const allocation of input.allocations) {
    const recorded = instant(allocation.recordedAt);
    if (recorded === null || recorded > input.now.getTime() || allocation.status !== "active" || !validAt(allocation.validFrom, allocation.validTo, input.now)) continue;
    const list = allocationByResource.get(allocation.resourceId) ?? [];
    list.push(allocation);
    allocationByResource.set(allocation.resourceId, list);
  }

  const resourceConstraints: CandidatePlan["resourceConstraints"] = [];
  const seenResources = new Set<number>();
  for (const version of currentVersions) {
    if (seenResources.has(version.resourceId)) continue;
    seenResources.add(version.resourceId);
    const resource = input.resources.find((row) => row.id === version.resourceId);
    if (!resource) continue;
    const active = allocationByResource.get(version.resourceId) ?? [];
    const sameUnit = active.filter((item) => version.unit && item.unit.toLocaleLowerCase() === version.unit.toLocaleLowerCase());
    const amounts = sameUnit.map((item) => milliUnits(item.amount));
    const capacity = milliUnits(version.capacity);
    const total = amounts.every((value): value is bigint => value !== null) ? amounts.reduce((sum, value) => sum + value, 0n) : null;
    const overAllocated = capacity !== null && total !== null && total > capacity;
    const activeAllocated = total === null ? null : decimal(total);
    resourceConstraints.push({ resourceId: resource.id, name: resource.name, availabilityState: version.availabilityState, capacity: version.capacity === null ? null : String(version.capacity), unit: version.unit, activeAllocated, overAllocated, evidenceVersionId: version.id, evidenceId: version.evidenceId });
    const constrained = version.availabilityState === "unavailable" || version.availabilityState === "limited" || overAllocated;
    if (constrained) {
        candidates.push({
        id: `resource-${resource.id}-${version.id}`,
        kind: "resource_constraint",
        title: `Review resource constraint: ${resource.name}`,
        priority: overAllocated || version.availabilityState === "unavailable" ? "high" : "medium",
        reason: overAllocated
          ? `Active allocations (${activeAllocated ?? "unknown"} ${version.unit ?? "units"}) exceed the recorded capacity (${version.capacity ?? "unknown"} ${version.unit ?? "units"}).`
          : `Recorded availability is ${version.availabilityState}; allocation and capacity are not changed by this candidate plan.`,
        evidenceIds: version.evidenceId ? [version.evidenceId] : [],
        objectiveIds: [],
        targetId: resource.id,
      });
    }
  }

  const responsibilityCount = input.responsibilities.filter((row) => {
    const recorded = instant(row.recordedAt);
    return recorded !== null && recorded <= input.now.getTime() && row.status !== "ended" && validAt(row.validFrom, row.validTo, input.now);
  }).length;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title));

  return {
    generatedAt: input.now.toISOString(),
    mode: "advisory",
    policies: { dueSoonDays: input.dueSoonDays, staleAfterDays: input.staleAfterDays },
    objectives: input.objectives.map(({ id, title, priority }) => ({ id, title, priority })),
    candidates,
    resourceConstraints,
    activeResponsibilityCount: responsibilityCount,
    rules: [
      "Only records in the selected workspace snapshot are considered.",
      "Due dates use the shared UTC calendar rule; evidence age uses the recorded workspace freshness threshold.",
      "A conflict creates a review candidate and never selects a winning assertion.",
      "Every active objective appears as its own review candidate; other candidates are not implicitly mapped to objectives without an explicit link.",
      "Capacity is compared using exact thousandth-unit arithmetic and only matching units; unknown or mismatched units are not summed.",
      "Candidates are advisory only: they do not create actions, change world state, authorize a member, or call an external provider.",
    ],
  };
}
