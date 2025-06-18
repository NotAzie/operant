import { describe, expect, it } from "vitest";
import { buildCandidatePlan } from "./planning";

const now = new Date("2026-09-29T12:00:00.000Z");
const emptyInput = (): Parameters<typeof buildCandidatePlan>[0] => ({
  now,
  dueSoonDays: 3,
  staleAfterDays: 30,
  objectives: [{ id: 5, title: "Keep service available", priority: "required" }],
  obligations: [],
  evidence: [],
  conflicts: [],
  observations: [],
  resources: [],
  versions: [],
  allocations: [],
  responsibilities: [],
});

describe("deterministic advisory candidate plans", () => {
  it("links conflict review candidates to the evidence on their source observations without assigning objectives", () => {
    const input = emptyInput();
    input.conflicts = [{ id: 17, attributeKey: "status", observationIds: "[21,22,22,0]" }];
    input.observations = [{ id: 21, evidenceId: 31, value: "open" }, { id: 22, evidenceId: 32, value: "closed" }];
    const result = buildCandidatePlan(input);
    expect(result.mode).toBe("advisory");
    expect(result.candidates.find((candidate) => candidate.kind === "review_conflict")).toMatchObject({ kind: "review_conflict", targetId: 17, evidenceIds: [31, 32], objectiveIds: [] });
    expect(result.objectives).toEqual([{ id: 5, title: "Keep service available", priority: "required" }]);
  });

  it("classifies overdue obligations deterministically and never turns a review candidate into an action", () => {
    const input = emptyInput();
    input.obligations = [{ id: 8, title: "Renew certificate", status: "open", dueAt: "2026-09-20T00:00:00.000Z", evidenceId: 40 }];
    const result = buildCandidatePlan(input);
    expect(result.candidates.find((candidate) => candidate.kind === "review_obligation")).toMatchObject({ kind: "review_obligation", priority: "high", targetId: 8, evidenceIds: [40], objectiveIds: [] });
    expect(result.candidates.every((candidate) => !("actionId" in candidate))).toBe(true);
    expect(result.rules).toContain("Candidates are advisory only: they do not create actions, change world state, authorize a member, or call an external provider.");
  });

  it("uses exact thousandth-unit arithmetic and ignores mismatched units when identifying over-allocation", () => {
    const input = emptyInput();
    input.resources = [{ id: 4, name: "Engineer capacity" }];
    input.versions = [{ id: 7, resourceId: 4, capacity: "1.000", unit: "hours", availabilityState: "available", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, recordedAt: "2026-01-01T00:00:00.000Z", evidenceId: 51, supersedesVersionId: null }];
    input.allocations = [
      { resourceId: 4, amount: "1.000", unit: "hours", status: "active", validFrom: "2026-09-01T00:00:00.000Z", validTo: null, recordedAt: "2026-09-01T00:00:00.000Z" },
      { resourceId: 4, amount: "0.001", unit: "hours", status: "active", validFrom: "2026-09-01T00:00:00.000Z", validTo: null, recordedAt: "2026-09-01T00:00:00.000Z" },
      { resourceId: 4, amount: "99", unit: "days", status: "active", validFrom: "2026-09-01T00:00:00.000Z", validTo: null, recordedAt: "2026-09-01T00:00:00.000Z" },
    ];
    const result = buildCandidatePlan(input);
    expect(result.resourceConstraints).toMatchObject([{ resourceId: 4, capacity: "1.000", activeAllocated: "1.001", overAllocated: true, evidenceId: 51 }]);
    expect(result.candidates.find((candidate) => candidate.kind === "resource_constraint")).toMatchObject({ kind: "resource_constraint", targetId: 4, priority: "high", evidenceIds: [51], objectiveIds: [] });
  });

  it("does not use future-recorded or expired allocation/resource versions", () => {
    const input = emptyInput();
    input.resources = [{ id: 4, name: "Engineer capacity" }];
    input.versions = [{ id: 7, resourceId: 4, capacity: "1", unit: "hours", availabilityState: "unavailable", validFrom: "2026-01-01T00:00:00.000Z", validTo: "2026-09-01T00:00:00.000Z", recordedAt: "2026-01-01T00:00:00.000Z", evidenceId: 51, supersedesVersionId: null }];
    input.versions.push({ id: 8, resourceId: 4, capacity: "1", unit: "hours", availabilityState: "unavailable", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, recordedAt: "2026-10-01T00:00:00.000Z", evidenceId: 52, supersedesVersionId: null });
    expect(buildCandidatePlan(input).resourceConstraints).toEqual([]);
  });

  it("surfaces each active objective as an explicit review candidate without assigning it to unrelated records", () => {
    const input = emptyInput();
    input.objectives = [
      { id: 5, title: "Keep service available", priority: "required" },
      { id: 6, title: "Reduce optional spend", priority: "preference" },
    ];
    input.obligations = [{ id: 8, title: "Renew certificate", status: "open", dueAt: "2026-09-20T00:00:00.000Z", evidenceId: 40 }];
    const result = buildCandidatePlan(input);
    expect(result.candidates.filter((candidate) => candidate.kind === "review_objective")).toMatchObject([
      { targetId: 5, priority: "high", objectiveIds: [5] },
      { targetId: 6, priority: "low", objectiveIds: [6] },
    ]);
    expect(result.candidates.find((candidate) => candidate.kind === "review_obligation")?.objectiveIds).toEqual([]);
    input.objectives = [];
    expect(buildCandidatePlan(input).candidates.some((candidate) => candidate.kind === "review_objective")).toBe(false);
  });
});
