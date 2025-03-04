import { describe, expect, it } from "vitest";
import { assessConflictWindow } from "../operantDomain";
import { activeConflictGroups } from "./conflicts";

type ConflictRow = Parameters<typeof activeConflictGroups>[0][number];

const row = (overrides: Partial<ConflictRow> = {}): ConflictRow => ({
  id: 1,
  entityId: 7,
  attributeKey: "github_issue_state",
  value: "open",
  supersedesObservationId: null,
  recordedAt: new Date("2026-01-02T00:00:00.000Z"),
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null,
  sourceType: "integration",
  sourceProvider: "github",
  sourceConnectionId: 77,
  ...overrides,
});

describe("provider timeline conflict detection", () => {
  it("does not report an old snapshot as a current conflict after a later effective version", () => {
    const older = row({ id: 1, value: "open" });
    const newer = row({
      id: 2,
      value: "closed",
      validFrom: new Date("2026-01-05T00:00:00.000Z"),
      recordedAt: new Date("2026-01-06T00:00:00.000Z"),
      supersedesObservationId: 1,
    });

    expect(activeConflictGroups([older, newer], new Date("2026-01-07T00:00:00.000Z"))).toEqual([]);
  });

  it("still reports disagreement between independent provider connections", () => {
    const connectionA = row({ id: 1, value: "open" });
    const connectionB = row({ id: 2, value: "closed", sourceConnectionId: 88 });

    expect(activeConflictGroups([connectionA, connectionB], new Date("2026-01-07T00:00:00.000Z"))).toHaveLength(1);
  });

  it("keeps explicit manual assertions independent from provider timelines", () => {
    const provider = row({ id: 1, value: "open" });
    const manual = row({
      id: 2,
      value: "closed",
      recordedAt: new Date("2026-01-03T00:00:00.000Z"),
      sourceType: "manual",
      sourceProvider: "manual",
      sourceConnectionId: null,
    });

    expect(activeConflictGroups([provider, manual], new Date("2026-01-07T00:00:00.000Z"))).toHaveLength(1);
  });

  it("returns incomplete rather than clear when the background refresh row budget overflows", () => {
    const rows = Array.from({ length: 501 }, (_, index) => row({ id: index + 1, value: index === 500 ? "closed" : "open" }));
    expect(assessConflictWindow(rows, 500, new Date("2026-01-07T00:00:00.000Z"))).toEqual({ status: "incomplete", conflicts: null });
  });
});
