export type TemporalAssertion = {
  id: number;
  entityId: number | null;
  attributeKey: string;
  value: string;
  epistemicState: string;
  confidence: number;
  evidenceId: number;
  observedAt: Date | string;
  recordedAt: Date | string;
  validFrom: Date | string | null;
  validTo: Date | string | null;
  supersedesObservationId: number | null;
  sourceType?: string | null;
  sourceProvider?: string | null;
  sourceConnectionId?: number | null;
};

export type ReconstructedFact = {
  entityId: number | null;
  attributeKey: string;
  assertions: TemporalAssertion[];
};

export type TemporalAuditRecord = {
  recordId: number | null;
  operation: string;
  createdAt: Date | string;
  details: string | null;
};

type EntityProjection = {
  id: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  displayName: string;
  description: string | null;
  sourceIdentity: string | null;
  identityState: string;
};

const time = (value: Date | string | null | undefined): number | null => {
  if (value == null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Validity intervals use [validFrom, validTo): a fact expires at validTo. */
function parseDetails(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Reconstructs mutable entity metadata by reversing later audited corrections. */
export function reconstructEntityMetadataAsOf<T extends EntityProjection>(currentRows: T[], auditRows: TemporalAuditRecord[], knowledgeAsOf: Date): T[] {
  const cutoff = knowledgeAsOf.getTime();
  return currentRows.flatMap((row) => {
    const created = time(row.createdAt);
    if (created === null || created > cutoff) return [];
    const corrections = auditRows
      .filter((audit) => audit.recordId === row.id && audit.operation === "entity.corrected")
      .sort((a, b) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0));
    let state = { ...row };
    for (const audit of corrections) {
      const recorded = time(audit.createdAt);
      if (recorded === null || recorded <= cutoff) continue;
      const before = parseDetails(audit.details)?.before;
      if (!before || typeof before !== "object" || Array.isArray(before)) continue;
      const snapshot = before as Record<string, unknown>;
      if (typeof snapshot.displayName !== "string" ||
          !(snapshot.description === null || typeof snapshot.description === "string") ||
          !(snapshot.sourceIdentity === null || typeof snapshot.sourceIdentity === "string") ||
          !(snapshot.identityState === "resolved" || snapshot.identityState === "unresolved")) continue;
      state = { ...state, displayName: snapshot.displayName, description: snapshot.description, sourceIdentity: snapshot.sourceIdentity, identityState: snapshot.identityState };
    }
    const lastKnownCorrection = corrections.find((audit) => (time(audit.createdAt) ?? Infinity) <= cutoff);
    const lastKnownTime = lastKnownCorrection ? time(lastKnownCorrection.createdAt) : created;
    const updatedAt = lastKnownTime === null ? row.createdAt : row.updatedAt instanceof Date ? new Date(lastKnownTime) : new Date(lastKnownTime).toISOString();
    return [{ ...state, updatedAt }];
  });
}

/** Reconstructs identity-candidate state before a later explicit resolution. */
export function reconstructRelationshipDecisionsAsOf<T extends { id: number; createdAt: Date | string; epistemicState: string }>(currentRows: T[], auditRows: TemporalAuditRecord[], knowledgeAsOf: Date): T[] {
  const cutoff = knowledgeAsOf.getTime();
  return currentRows.flatMap((row) => {
    const created = time(row.createdAt);
    if (created === null || created > cutoff) return [];
    let epistemicState = row.epistemicState;
    const decisions = auditRows
      .filter((audit) => audit.recordId === row.id && audit.operation.startsWith("identity.candidate_"))
      .sort((a, b) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0));
    for (const audit of decisions) {
      const recorded = time(audit.createdAt);
      if (recorded === null || recorded <= cutoff) continue;
      const prior = parseDetails(audit.details)?.from;
      if (prior === "unresolved" || prior === "observed" || prior === "rejected") epistemicState = prior;
    }
    return [{ ...row, epistemicState }];
  });
}

export function isValidAt(assertion: TemporalAssertion, validAt: Date): boolean {
  const instant = validAt.getTime();
  const start = time(assertion.validFrom);
  const end = time(assertion.validTo);
  return (start === null || start <= instant) && (end === null || instant < end);
}

type TemporalAssertionLike = Pick<TemporalAssertion, "id" | "entityId" | "attributeKey" | "value" | "recordedAt" | "validFrom" | "validTo" | "supersedesObservationId">
  & Partial<Pick<TemporalAssertion, "sourceType" | "sourceProvider" | "sourceConnectionId">>;

function providerTimelineKey(assertion: TemporalAssertionLike): string | null {
  if (assertion.sourceType !== "integration" || !assertion.sourceProvider ||
      !Number.isSafeInteger(assertion.sourceConnectionId) || Number(assertion.sourceConnectionId) < 1 ||
      time(assertion.validFrom) === null) return null;
  return `${assertion.entityId ?? "none"}:${assertion.attributeKey.trim().toLocaleLowerCase()}:${assertion.sourceProvider}:${assertion.sourceConnectionId}`;
}

function dateLike(reference: Date | string | null, instant: number): Date | string {
  return reference instanceof Date ? new Date(instant) : new Date(instant).toISOString();
}

/**
 * Returns assertions believed at validAt as of knowledgeAsOf. Connected-provider snapshots
 * are versions in a source stream: their effective intervals are derived from neighboring
 * source timestamps, not database arrival order. This also interprets legacy GitHub
 * supersession chains as timeline versions while preserving explicit corrections across
 * streams (for example, a manual correction of an integration assertion).
 */
export function resolveTemporalAssertions<T extends TemporalAssertionLike>(
  assertions: T[],
  knowledgeAsOf: Date,
  validAt: Date,
): T[] {
  const cutoff = knowledgeAsOf.getTime();
  const validInstant = validAt.getTime();
  const known = assertions.filter((assertion) => {
    const recorded = time(assertion.recordedAt);
    return recorded !== null && recorded <= cutoff;
  });
  const byId = new Map(known.map((assertion) => [assertion.id, assertion]));
  const superseded = new Set<number>();
  for (const assertion of known) {
    const targetId = assertion.supersedesObservationId;
    if (targetId === null) continue;
    const target = byId.get(targetId);
    if (target && providerTimelineKey(assertion) !== null && providerTimelineKey(assertion) === providerTimelineKey(target)) continue;
    superseded.add(targetId);
  }

  const tracks = new Map<string, T[]>();
  for (const assertion of known) {
    const key = providerTimelineKey(assertion);
    if (key === null) continue;
    const track = tracks.get(key) ?? [];
    track.push(assertion);
    tracks.set(key, track);
  }
  const effectiveEnds = new Map<number, number | null>();
  for (const track of tracks.values()) {
    track.sort((a, b) => (time(a.validFrom) ?? 0) - (time(b.validFrom) ?? 0) || a.id - b.id);
    let index = 0;
    while (index < track.length) {
      const start = time(track[index]!.validFrom)!;
      let endOfCohort = index + 1;
      while (endOfCohort < track.length && time(track[endOfCohort]!.validFrom) === start) endOfCohort += 1;
      const nextStart = endOfCohort < track.length ? time(track[endOfCohort]!.validFrom) : null;
      for (let cursor = index; cursor < endOfCohort; cursor += 1) {
        const assertion = track[cursor]!;
        const explicitEnd = time(assertion.validTo);
        effectiveEnds.set(assertion.id, nextStart === null ? explicitEnd : explicitEnd === null ? nextStart : Math.min(explicitEnd, nextStart));
      }
      index = endOfCohort;
    }
  }

  return known.flatMap((assertion) => {
    if (superseded.has(assertion.id)) return [];
    const effectiveEnd = effectiveEnds.has(assertion.id) ? effectiveEnds.get(assertion.id)! : time(assertion.validTo);
    const start = time(assertion.validFrom);
    if ((start !== null && start > validInstant) || (effectiveEnd !== null && validInstant >= effectiveEnd)) return [];
    const currentEnd = time(assertion.validTo);
    return effectiveEnd !== currentEnd
      ? [{ ...assertion, validTo: effectiveEnd === null ? null : dateLike(assertion.validTo, effectiveEnd) }]
      : [assertion];
  });
}

export type TemporalResourceVersion = {
  id: number;
  resourceId: number;
  recordedAt: Date | string;
  validFrom: Date | string | null;
  validTo: Date | string | null;
  supersedesVersionId: number | null;
};

/**
 * Selects resource versions believed at validAt as of knowledgeAsOf. A known
 * successor closes its predecessor at the successor's effective start, not at
 * its database arrival time. Competing successor branches are not collapsed.
 */
export function resolveResourceVersions<T extends TemporalResourceVersion>(
  versions: T[],
  knowledgeAsOf: Date,
  validAt: Date,
): T[] {
  const cutoff = knowledgeAsOf.getTime();
  const validInstant = validAt.getTime();
  if (!Number.isFinite(cutoff) || !Number.isFinite(validInstant)) return [];

  const known = versions.filter((version) => {
    const recorded = time(version.recordedAt);
    const start = time(version.validFrom);
    const end = time(version.validTo);
    return recorded !== null && recorded <= cutoff && start !== null &&
      (version.validTo === null || (end !== null && end >= start));
  });
  const byId = new Map(known.map((version) => [version.id, version]));
  const supersededAt = new Map<number, number>();

  for (const successor of known) {
    if (successor.supersedesVersionId === null) continue;
    const predecessor = byId.get(successor.supersedesVersionId);
    const transition = time(successor.validFrom);
    if (!predecessor || predecessor.resourceId !== successor.resourceId || transition === null) continue;
    const current = supersededAt.get(predecessor.id);
    if (current === undefined || transition < current) supersededAt.set(predecessor.id, transition);
  }

  return known.filter((version) => {
    const start = time(version.validFrom);
    if (start === null || start > validInstant) return false;
    const explicitEnd = time(version.validTo);
    if (version.validTo !== null && explicitEnd === null) return false;
    const successorStart = supersededAt.get(version.id);
    const effectiveEnd = explicitEnd === null
      ? successorStart
      : successorStart === undefined
        ? explicitEnd
        : Math.min(explicitEnd, successorStart);
    return effectiveEnd === undefined || validInstant < effectiveEnd;
  });
}

/**
 * Reconstructs what the workspace had recorded by knowledgeAsOf, for facts
 * effective at validAt. Later corrections do not erase the earlier belief:
 * a superseding assertion only masks its target when that correction itself
 * was already recorded by knowledgeAsOf.
 */
export function reconstructAsOf(
  assertions: TemporalAssertion[],
  knowledgeAsOf: Date,
  validAt: Date = knowledgeAsOf,
): ReconstructedFact[] {
  const active = resolveTemporalAssertions(assertions, knowledgeAsOf, validAt);
  const groups = new Map<string, TemporalAssertion[]>();
  for (const assertion of active) {
    const key = `${assertion.entityId ?? "none"}:${assertion.attributeKey.trim().toLocaleLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(assertion);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      entityId: group[0]?.entityId ?? null,
      attributeKey: group[0]?.attributeKey ?? "unknown",
      assertions: group.slice().sort((a, b) => {
        const observedDifference = (time(a.observedAt) ?? 0) - (time(b.observedAt) ?? 0);
        return observedDifference || a.id - b.id;
      }),
    }))
    .sort((a, b) => `${a.entityId ?? ""}:${a.attributeKey}`.localeCompare(`${b.entityId ?? ""}:${b.attributeKey}`));
}

export function detectConflictingValues(assertions: TemporalAssertion[]): ReconstructedFact[] {
  return reconstructAsOf(assertions, new Date(), new Date()).filter(
    (fact) => new Set(fact.assertions.map((assertion) => assertion.value.trim().toLocaleLowerCase())).size > 1,
  );
}
