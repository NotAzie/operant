import { describe, expect, it } from "vitest";
import { isValidAt, reconstructAsOf, reconstructEntityMetadataAsOf, reconstructRelationshipDecisionsAsOf, resolveResourceVersions, type TemporalAssertion, type TemporalResourceVersion } from "./temporal";

const assertion = (overrides: Partial<TemporalAssertion> = {}): TemporalAssertion => ({
  id: 1,
  entityId: 7,
  attributeKey: "status",
  value: "open",
  epistemicState: "observed",
  confidence: 90,
  evidenceId: 11,
  observedAt: "2026-01-02T00:00:00.000Z",
  recordedAt: "2026-01-03T00:00:00.000Z",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: null,
  supersedesObservationId: null,
  ...overrides,
});

const providerVersion = (overrides: Partial<TemporalAssertion> = {}): TemporalAssertion => assertion({
  attributeKey: "github_issue_state",
  sourceType: "integration",
  sourceProvider: "github",
  sourceConnectionId: 77,
  ...overrides,
});

const resourceVersion = (overrides: Partial<TemporalResourceVersion> = {}): TemporalResourceVersion => ({
  id: 1,
  resourceId: 17,
  recordedAt: "2026-01-02T00:00:00.000Z",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: null,
  supersedesVersionId: null,
  ...overrides,
});

describe("temporal world reconstruction", () => {
  it("does not let a later-recorded correction erase the earlier belief at an earlier knowledge time", () => {
    const original = assertion();
    const correction = assertion({
      id: 2,
      value: "closed",
      evidenceId: 12,
      observedAt: "2026-01-05T00:00:00.000Z",
      recordedAt: "2026-01-06T00:00:00.000Z",
      supersedesObservationId: original.id,
    });

    expect(reconstructAsOf([original, correction], new Date("2026-01-04T00:00:00.000Z"))[0]?.assertions.map((row) => row.id)).toEqual([1]);
    expect(reconstructAsOf([original, correction], new Date("2026-01-07T00:00:00.000Z"))[0]?.assertions.map((row) => row.id)).toEqual([2]);
  });

  it("separates knowledge time from valid time and treats validTo as exclusive", () => {
    const fact = assertion({ validFrom: "2026-01-01T00:00:00.000Z", validTo: "2026-02-01T00:00:00.000Z" });
    const known = new Date("2026-03-01T00:00:00.000Z");
    expect(reconstructAsOf([fact], known, new Date("2026-01-31T23:59:59.999Z"))[0]?.assertions).toEqual([fact]);
    expect(reconstructAsOf([fact], known, new Date("2026-02-01T00:00:00.000Z"))).toEqual([]);
    expect(isValidAt(fact, new Date("2026-02-01T00:00:00.000Z"))).toBe(false);
  });

  it("derives provider state intervals from source time and preserves the earlier known view", () => {
    const first = providerVersion({ id: 1, value: "open", validFrom: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-02T00:00:00.000Z" });
    const next = providerVersion({ id: 2, value: "closed", validFrom: "2026-01-05T00:00:00.000Z", recordedAt: "2026-01-06T00:00:00.000Z", supersedesObservationId: 1 });

    const beforeArrival = reconstructAsOf([first, next], new Date("2026-01-04T00:00:00.000Z"), new Date("2026-01-03T00:00:00.000Z"));
    const afterArrivalBeforeTransition = reconstructAsOf([first, next], new Date("2026-01-07T00:00:00.000Z"), new Date("2026-01-03T00:00:00.000Z"));
    const afterTransition = reconstructAsOf([first, next], new Date("2026-01-07T00:00:00.000Z"), new Date("2026-01-06T00:00:00.000Z"));

    expect(beforeArrival[0]?.assertions.map((row) => row.value)).toEqual(["open"]);
    expect(afterArrivalBeforeTransition[0]?.assertions.map((row) => row.value)).toEqual(["open"]);
    expect(afterArrivalBeforeTransition[0]?.assertions[0]?.validTo).toBe("2026-01-05T00:00:00.000Z");
    expect(afterTransition[0]?.assertions.map((row) => row.value)).toEqual(["closed"]);
  });

  it("reconstructs delayed older provider events by effective time, not arrival order", () => {
    const laterEventArrivedFirst = providerVersion({ id: 1, value: "closed", validFrom: "2026-01-05T00:00:00.000Z", recordedAt: "2026-01-06T00:00:00.000Z" });
    const delayedOlderEvent = providerVersion({ id: 2, value: "open", validFrom: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-07T00:00:00.000Z" });
    const knowledgeAsOf = new Date("2026-01-08T00:00:00.000Z");

    expect(reconstructAsOf([laterEventArrivedFirst, delayedOlderEvent], knowledgeAsOf, new Date("2026-01-03T00:00:00.000Z"))[0]?.assertions.map((row) => row.value)).toEqual(["open"]);
    expect(reconstructAsOf([laterEventArrivedFirst, delayedOlderEvent], knowledgeAsOf, new Date("2026-01-06T00:00:00.000Z"))[0]?.assertions.map((row) => row.value)).toEqual(["closed"]);
    expect(reconstructAsOf([laterEventArrivedFirst, delayedOlderEvent], new Date("2026-01-06T12:00:00.000Z"), new Date("2026-01-03T00:00:00.000Z"))).toEqual([]);
  });

  it("keeps a superseded resource version visible before its successor's effective start", () => {
    const prior = resourceVersion({ id: 10 });
    const successor = resourceVersion({
      id: 11,
      recordedAt: "2026-01-06T00:00:00.000Z",
      validFrom: "2026-01-05T00:00:00.000Z",
      supersedesVersionId: prior.id,
    });
    const knowledgeAsOf = new Date("2026-01-07T00:00:00.000Z");

    expect(resolveResourceVersions([prior, successor], knowledgeAsOf, new Date("2026-01-03T00:00:00.000Z")).map((row) => row.id)).toEqual([10]);
    expect(resolveResourceVersions([prior, successor], knowledgeAsOf, new Date("2026-01-05T00:00:00.000Z")).map((row) => row.id)).toEqual([11]);
    expect(resolveResourceVersions([prior, successor], new Date("2026-01-04T00:00:00.000Z"), new Date("2026-01-03T00:00:00.000Z")).map((row) => row.id)).toEqual([10]);
  });

  it("reconstructs chained resource versions at each half-open transition", () => {
    const first = resourceVersion({ id: 20 });
    const second = resourceVersion({ id: 21, recordedAt: "2026-01-06T00:00:00.000Z", validFrom: "2026-01-05T00:00:00.000Z", supersedesVersionId: first.id });
    const third = resourceVersion({ id: 22, recordedAt: "2026-01-10T00:00:00.000Z", validFrom: "2026-01-09T00:00:00.000Z", supersedesVersionId: second.id });
    const knowledgeAsOf = new Date("2026-01-11T00:00:00.000Z");

    expect(resolveResourceVersions([first, second, third], knowledgeAsOf, new Date("2026-01-04T23:59:59.999Z")).map((row) => row.id)).toEqual([20]);
    expect(resolveResourceVersions([first, second, third], knowledgeAsOf, new Date("2026-01-05T00:00:00.000Z")).map((row) => row.id)).toEqual([21]);
    expect(resolveResourceVersions([first, second, third], knowledgeAsOf, new Date("2026-01-09T00:00:00.000Z")).map((row) => row.id)).toEqual([22]);
  });

  it("honors explicit resource-version validTo as an exclusive end", () => {
    const version = resourceVersion({ id: 30, validTo: "2026-01-05T00:00:00.000Z" });
    const knowledgeAsOf = new Date("2026-01-07T00:00:00.000Z");

    expect(resolveResourceVersions([version], knowledgeAsOf, new Date("2026-01-04T23:59:59.999Z")).map((row) => row.id)).toEqual([30]);
    expect(resolveResourceVersions([version], knowledgeAsOf, new Date("2026-01-05T00:00:00.000Z"))).toEqual([]);
  });

  it("preserves competing successor branches rather than choosing a last writer", () => {
    const prior = resourceVersion({ id: 40 });
    const firstBranch = resourceVersion({ id: 41, validFrom: "2026-01-05T00:00:00.000Z", supersedesVersionId: prior.id });
    const secondBranch = resourceVersion({ id: 42, validFrom: "2026-01-06T00:00:00.000Z", supersedesVersionId: prior.id });

    expect(resolveResourceVersions([prior, firstBranch, secondBranch], new Date("2026-01-07T00:00:00.000Z"), new Date("2026-01-06T12:00:00.000Z")).map((row) => row.id)).toEqual([41, 42]);
  });

  it("does not let a cross-resource supersession link close another resource's version", () => {
    const prior = resourceVersion({ id: 50 });
    const unrelated = resourceVersion({ id: 51, resourceId: 18, validFrom: "2026-01-05T00:00:00.000Z", supersedesVersionId: prior.id });

    expect(resolveResourceVersions([prior, unrelated], new Date("2026-01-07T00:00:00.000Z"), new Date("2026-01-06T00:00:00.000Z")).map((row) => row.id)).toEqual([50, 51]);
  });

  it("does not let an invalid persisted successor interval rewrite valid history", () => {
    const prior = resourceVersion({ id: 60 });
    const malformedSuccessor = resourceVersion({
      id: 61,
      validFrom: "2026-01-05T00:00:00.000Z",
      validTo: "2026-01-04T00:00:00.000Z",
      supersedesVersionId: prior.id,
    });

    expect(resolveResourceVersions([prior, malformedSuccessor], new Date("2026-01-07T00:00:00.000Z"), new Date("2026-01-06T00:00:00.000Z")).map((row) => row.id)).toEqual([60]);
  });

  it("keeps simultaneous conflicting snapshots and separate provider connections distinct", () => {
    const connectionA = providerVersion({ id: 1, value: "open", validFrom: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-02T00:00:00.000Z" });
    const sameInstantConflict = providerVersion({ id: 2, value: "closed", validFrom: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-03T00:00:00.000Z", supersedesObservationId: 1 });
    const otherConnection = providerVersion({ id: 3, value: "unknown", sourceConnectionId: 88, validFrom: "2026-01-02T00:00:00.000Z", recordedAt: "2026-01-03T00:00:00.000Z" });
    const result = reconstructAsOf([connectionA, sameInstantConflict, otherConnection], new Date("2026-01-04T00:00:00.000Z"), new Date("2026-01-02T12:00:00.000Z"));

    expect(result[0]?.assertions.map((row) => row.value).sort()).toEqual(["closed", "open", "unknown"]);
  });

  it("keeps concurrent conflicting assertions visible instead of selecting a winner", () => {
    const facts = [assertion({ id: 1, value: "open" }), assertion({ id: 2, value: "closed", evidenceId: 12 })];
    const result = reconstructAsOf(facts, new Date("2026-01-04T00:00:00.000Z"));
    expect(result).toHaveLength(1);
    expect(result[0]?.assertions.map((row) => row.value)).toEqual(["open", "closed"]);
  });

  it("excludes assertions not yet known at the requested cutoff", () => {
    const future = assertion({ recordedAt: "2027-01-01T00:00:00.000Z" });
    expect(reconstructAsOf([future], new Date("2026-12-31T23:59:59.999Z"))).toEqual([]);
  });

  it("reconstructs entity metadata before later corrections from audited snapshots", () => {
    const current = [{ id: 1, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", displayName: "Current", description: "current", sourceIdentity: "new-id", identityState: "resolved" as const }];
    const auditRows = [
      { recordId: 1, operation: "entity.corrected", createdAt: "2026-09-25T00:00:00.000Z", details: JSON.stringify({ before: { displayName: "Original", description: "original", sourceIdentity: "old-id", identityState: "unresolved" }, after: { displayName: "Middle", description: "middle", sourceIdentity: "mid-id", identityState: "resolved" } }) },
      { recordId: 1, operation: "entity.corrected", createdAt: "2026-09-28T00:00:00.000Z", details: JSON.stringify({ before: { displayName: "Middle", description: "middle", sourceIdentity: "mid-id", identityState: "resolved" }, after: { displayName: "Current", description: "current", sourceIdentity: "new-id", identityState: "resolved" } }) },
    ];
    expect(reconstructEntityMetadataAsOf(current, auditRows, new Date("2026-09-26T00:00:00.000Z"))[0]).toMatchObject({ displayName: "Middle", description: "middle", sourceIdentity: "mid-id", identityState: "resolved", updatedAt: "2026-09-25T00:00:00.000Z" });
    expect(reconstructEntityMetadataAsOf(current, auditRows, new Date("2026-09-24T00:00:00.000Z"))[0]).toMatchObject({ displayName: "Original", description: "original", sourceIdentity: "old-id", identityState: "unresolved", updatedAt: "2026-09-20T00:00:00.000Z" });
  });

  it("reconstructs an unresolved identity candidate before a later human decision", () => {
    const current = [{ id: 9, createdAt: "2026-09-25T00:00:00.000Z", epistemicState: "observed" }];
    const auditRows = [{ recordId: 9, operation: "identity.candidate_confirmed", createdAt: "2026-09-28T00:00:00.000Z", details: JSON.stringify({ from: "unresolved", to: "observed" }) }];
    expect(reconstructRelationshipDecisionsAsOf(current, auditRows, new Date("2026-09-26T00:00:00.000Z"))[0]?.epistemicState).toBe("unresolved");
    expect(reconstructRelationshipDecisionsAsOf(current, auditRows, new Date("2026-09-29T00:00:00.000Z"))[0]?.epistemicState).toBe("observed");
  });
});
