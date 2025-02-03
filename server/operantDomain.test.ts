import { describe, expect, it } from "vitest";
import { assessConflictWindow, canAccessRole, canTransitionAction, conflictObservationKey, findActiveConflicts, groupConflictObservations, uniqueConflictTargets } from "./operantDomain";

describe("operational domain invariants", () => {
  it("enforces the workspace role hierarchy", () => {
    expect(canAccessRole("viewer", "viewer")).toBe(true);
    expect(canAccessRole("editor", "admin")).toBe(false);
    expect(canAccessRole("owner", "admin")).toBe(true);
  });

  it("allows proposal then approval but does not skip directly to execution", () => {
    expect(canTransitionAction("proposed", "authorized")).toBe(true);
    expect(canTransitionAction("proposed", "submitted")).toBe(false);
    expect(canTransitionAction("authorized", "submitted")).toBe(true);
  });

  it("keeps provider-unknown outcomes reconcilable and does not permit a direct resend transition", () => {
    expect(canTransitionAction("unknown", "confirmed")).toBe(true);
    expect(canTransitionAction("unknown", "failed")).toBe(true);
    expect(canTransitionAction("unknown", "submitted")).toBe(false);
  });

  it("reduces only explicitly superseded observations and preserves unresolved disagreement", () => {
    const conflicts = findActiveConflicts([
      { id: 1, entityId: 2, attributeKey: "status", value: "draft", supersedesObservationId: null },
      { id: 2, entityId: 2, attributeKey: "STATUS", value: "open", supersedesObservationId: 1 },
      { id: 3, entityId: 2, attributeKey: "status", value: "closed", supersedesObservationId: null },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.observations.map((row) => row.id)).toEqual([2, 3]);
  });

  it("uses effective provider versions for action conflict evaluation without merging connections", () => {
    const conflict = findActiveConflicts([
      { id: 1, entityId: 2, attributeKey: "github_issue_state", value: "open", supersedesObservationId: null, recordedAt: "2026-01-02T00:00:00.000Z", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, sourceType: "integration", sourceProvider: "github", sourceConnectionId: 77 },
      { id: 2, entityId: 2, attributeKey: "github_issue_state", value: "closed", supersedesObservationId: 1, recordedAt: "2026-01-06T00:00:00.000Z", validFrom: "2026-01-05T00:00:00.000Z", validTo: null, sourceType: "integration", sourceProvider: "github", sourceConnectionId: 77 },
      { id: 3, entityId: 2, attributeKey: "github_issue_state", value: "blocked", supersedesObservationId: null, recordedAt: "2026-01-06T00:00:00.000Z", validFrom: "2026-01-04T00:00:00.000Z", validTo: null, sourceType: "integration", sourceProvider: "github", sourceConnectionId: 88 },
    ]);

    expect(conflict).toHaveLength(1);
    expect(conflict[0]?.observations.map((row) => row.id).sort()).toEqual([2, 3]);
  });

  it("does not label an over-budget temporal conflict scan as clear", () => {
    const rows = Array.from({ length: 301 }, (_, index) => ({ id: index + 1, entityId: 2, attributeKey: "status", value: index === 300 ? "closed" : "open", supersedesObservationId: null }));
    expect(assessConflictWindow(rows, 300)).toEqual({ status: "incomplete", conflicts: null });
  });

  it("evaluates a complete conflict scan exactly at its row budget", () => {
    const rows = Array.from({ length: 300 }, (_, index) => ({ id: index + 1, entityId: 2, attributeKey: "status", value: index === 299 ? "closed" : "open", supersedesObservationId: null }));
    const assessment = assessConflictWindow(rows, 300);
    expect(assessment.status).toBe("complete");
    if (assessment.status === "complete") expect(assessment.conflicts).toHaveLength(1);
  });

  it("deduplicates batch scan targets case-insensitively while keeping null-entity scopes separate", () => {
    const targets = uniqueConflictTargets([
      { entityId: 7, attributeKey: "Status" },
      { entityId: 7, attributeKey: " status " },
      { entityId: null, attributeKey: "status" },
    ]);
    expect(targets).toEqual([
      { entityId: 7, attributeKey: "status" },
      { entityId: null, attributeKey: "status" },
    ]);
    expect(conflictObservationKey(targets[0]!)).not.toBe(conflictObservationKey(targets[1]!));
  });

  it("groups batched comparable rows by the same normalized entity/attribute key", () => {
    const rows = [
      { id: 1, entityId: 7, attributeKey: "Status", value: "open", supersedesObservationId: null },
      { id: 2, entityId: 7, attributeKey: " status ", value: "closed", supersedesObservationId: null },
      { id: 3, entityId: null, attributeKey: "status", value: "unknown", supersedesObservationId: null },
    ];
    const grouped = groupConflictObservations(rows);
    expect(grouped.get("7:status")?.map((row) => row.id)).toEqual([1, 2]);
    expect(grouped.get("none:status")?.map((row) => row.id)).toEqual([3]);
  });
});
