import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  requireManager: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  requireWritableWorkspace: vi.fn(),
}));

vi.mock("./operantAccess", () => ({
  requireManager: accessMocks.requireManager,
  requireWorkspaceAccess: accessMocks.requireWorkspaceAccess,
  requireWritableWorkspace: accessMocks.requireWritableWorkspace,
}));

import { operantActionsRouter } from "./operantActionsRouter";

function makeQueryBuilder<T>(result: T, events: string[]) {
  const builder: Record<string, any> = {};
  for (const method of ["from", "where", "limit", "orderBy", "innerJoin", "leftJoin", "for"]) {
    builder[method] = (..._args: unknown[]) => builder;
  }
  builder.then = (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) => {
    events.push("query-resolved");
    return Promise.resolve(result).then(resolve, reject);
  };
  return builder;
}

function makeHarness(actorRole: "owner" | "admin" | "editor" | "viewer" = "editor") {
  const events: string[] = [];
  const inserted: Record<string, unknown>[] = [];
  const currentAssertions = [
    { id: 31, entityId: 9, attributeKey: "status", value: "open", supersedesObservationId: null, recordedAt: new Date("2026-10-01T00:00:00.000Z"), validFrom: null, validTo: null, sourceType: "integration", sourceProvider: "github", sourceConnectionId: 2 },
    { id: 32, entityId: 9, attributeKey: "status", value: "closed", supersedesObservationId: null, recordedAt: new Date("2026-10-02T00:00:00.000Z"), validFrom: null, validTo: null, sourceType: "integration", sourceProvider: "github", sourceConnectionId: 3 },
  ];
  const results: unknown[][] = [
    [{ role: actorRole, isIllustrative: false }],
    [{ id: 4, summary: "Review the open issue", evidenceId: 8, recordType: "note", recordId: null }],
    [{
      id: 8,
      sourceName: "GitHub issue",
      sourceType: "integration",
      sourceAuthority: "reported",
      epistemicState: "observed",
      qualityState: "unverified",
      confidence: null,
      observedAt: new Date("2026-10-01T00:00:00.000Z"),
      recordedAt: new Date("2026-10-01T00:00:00.000Z"),
      validFrom: null,
      validTo: null,
    }],
    [],
    [currentAssertions[0]],
    currentAssertions,
  ];
  let nextInsertId = 100;
  const tx = {
    select: vi.fn(() => {
      events.push("select");
      return makeQueryBuilder(results.shift() ?? [], events);
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        inserted.push(value);
        return [{ insertId: ++nextInsertId }];
      }),
    })),
  };
  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      events.push("transaction-start");
      return callback(tx);
    }),
  };
  const access = { db, workspaceId: 1, role: "editor", isIllustrative: false, createdBy: 7 };
  return { access, db, events, inserted, tx };
}

function caller() {
  return operantActionsRouter.createCaller({ user: { id: 7 } } as any);
}

beforeEach(() => {
  accessMocks.requireManager.mockReset();
  accessMocks.requireWorkspaceAccess.mockReset();
  accessMocks.requireWritableWorkspace.mockReset();
});

describe("internal action proposal transaction boundary", () => {
  it("evaluates linked records, evidence, policies, conflicts, and writes through one transaction", async () => {
    const harness = makeHarness();
    accessMocks.requireWorkspaceAccess.mockResolvedValue(harness.access);

    const result = await caller().propose({ workspaceId: 1, title: "Follow up", eventId: 4 });

    expect(result).toEqual({ id: 101 });
    expect(harness.db.transaction).toHaveBeenCalledTimes(1);
    expect(harness.events[0]).toBe("transaction-start");
    expect(harness.tx.select).toHaveBeenCalledTimes(6);
    expect(harness.tx.insert).toHaveBeenCalledTimes(4);
    expect(harness.inserted[1]?.actorRole).toBe("editor");
    const action = harness.inserted[0];
    const provenance = action?.decisionProvenance as { capturedAt: string; rules: Array<{ id: string; result: string }> };
    expect(Number.isNaN(Date.parse(provenance.capturedAt))).toBe(false);
    expect(provenance.rules.find((rule) => rule.id === "evidence_conflicts")?.result).toBe("conflicting");
  });

  it("rejects a proposer whose role was demoted before the transaction locked membership", async () => {
    const harness = makeHarness("viewer");
    accessMocks.requireWorkspaceAccess.mockResolvedValue(harness.access);

    await expect(caller().propose({ workspaceId: 1, title: "Follow up", eventId: 4 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(harness.db.transaction).toHaveBeenCalledTimes(1);
    expect(harness.tx.select).toHaveBeenCalledTimes(1);
    expect(harness.tx.insert).not.toHaveBeenCalled();
  });
});
