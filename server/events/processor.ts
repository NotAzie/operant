import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, lt, notInArray, or, sql } from "drizzle-orm";
import {
  analysisJobs, auditLog, entities, eventAttempts, evidence, externalIdentities,
  githubConnections, inboundEvents, observations, operationalEvents, obligations, workspaceMembers, workspaces,
} from "../../drizzle/schema";
import type { OperantDb } from "../operantAccess";
import { refreshConflictFor } from "../domain/conflicts";
import { sha256Hex } from "../integrations/github/crypto";
import { compactProcessedGitHubIssuePayload, manualObservationPayloadSchema, githubIssuePayloadSchema, type ManualObservationPayload, type GitHubIssuePayload } from "./types";
import { retryDelaySeconds } from "./retry";

function idOf(result: { 0?: { insertId?: number | bigint } }): number {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new Error("Database did not return a new record identifier.");
  return id;
}

export type DrainResult = { claimed: number; processed: number; retryScheduled: number; deadLettered: number; busy: boolean };

type ClaimedEvent = typeof inboundEvents.$inferSelect & { attemptCount: number };

async function claimNext(db: OperantDb, workerId: string, excludedEventIds: number[] = []): Promise<ClaimedEvent | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const eligible = or(
      and(or(eq(inboundEvents.status, "queued"), eq(inboundEvents.status, "retryable_failure")), lte(inboundEvents.nextAttemptAt, now)),
      and(eq(inboundEvents.status, "processing"), or(isNull(inboundEvents.leaseExpiresAt), lt(inboundEvents.leaseExpiresAt, now))),
    );
    const claimable = excludedEventIds.length ? and(eligible, notInArray(inboundEvents.id, excludedEventIds)) : eligible;
    const rows = await tx.select().from(inboundEvents).where(claimable).orderBy(asc(inboundEvents.nextAttemptAt), asc(inboundEvents.id)).limit(1).for("update");
    const row = rows[0];
    if (!row) return null;
    const attemptCount = row.attemptCount + 1;
    await tx.update(inboundEvents).set({ status: "processing", attemptCount, leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + 45_000), lastErrorClass: null, lastErrorMessage: null }).where(eq(inboundEvents.id, row.id));
    await tx.insert(eventAttempts).values({ workspaceId: row.workspaceId, eventId: row.id, attemptNumber: attemptCount, outcome: "started", startedAt: now });
    return { ...row, status: "processing", attemptCount, leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + 45_000) };
  });
}

async function assertActorMayWrite(tx: Parameters<Parameters<OperantDb["transaction"]>[0]>[0], workspaceId: number, actorId: number) {
  const rows = await tx.select({ role: workspaceMembers.role, illustrative: workspaces.isIllustrative })
    .from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId))).limit(1);
  const membership = rows[0];
  if (!membership || membership.illustrative || !(membership.role === "owner" || membership.role === "admin" || membership.role === "editor")) {
    throw Object.assign(new Error("The event actor no longer has permission to write to this workspace."), { permanent: true, errorClass: "authorization" });
  }
}

async function processManual(tx: Parameters<Parameters<OperantDb["transaction"]>[0]>[0], row: ClaimedEvent, payloadUnknown: unknown) {
  const payload: ManualObservationPayload = manualObservationPayloadSchema.parse(payloadUnknown);
  if (!row.actorId) throw Object.assign(new Error("Manual event has no authenticated actor."), { permanent: true, errorClass: "authorization" });
  await assertActorMayWrite(tx, row.workspaceId, row.actorId);
  if (payload.entityId) {
    const exists = await tx.select({ id: entities.id }).from(entities).where(and(eq(entities.id, payload.entityId), eq(entities.workspaceId, row.workspaceId))).limit(1);
    if (!exists[0]) throw Object.assign(new Error("Selected entity is not in this workspace."), { permanent: true, errorClass: "tenant_reference" });
  }
  if (payload.obligationId) {
    const exists = await tx.select({ id: obligations.id }).from(obligations).where(and(eq(obligations.id, payload.obligationId), eq(obligations.workspaceId, row.workspaceId))).limit(1);
    if (!exists[0]) throw Object.assign(new Error("Selected obligation is not in this workspace."), { permanent: true, errorClass: "tenant_reference" });
  }
  let supersedesEvidenceId: number | null = null;
  if (payload.supersedesObservationId) {
    const prior = await tx.select({ id: observations.id, evidenceId: observations.evidenceId, entityId: observations.entityId, attributeKey: observations.attributeKey })
      .from(observations).where(and(eq(observations.id, payload.supersedesObservationId), eq(observations.workspaceId, row.workspaceId))).limit(1);
    if (!prior[0] || prior[0].entityId !== payload.entityId || prior[0].attributeKey.toLowerCase() !== payload.attributeKey.toLowerCase()) {
      throw Object.assign(new Error("Correction target is unavailable or does not match this entity and attribute."), { permanent: true, errorClass: "validation" });
    }
    supersedesEvidenceId = prior[0].evidenceId;
  }
  const observedAt = new Date(payload.observedAt);
  const evidenceId = idOf(await tx.insert(evidence).values({
    workspaceId: row.workspaceId, sourceName: payload.sourceName, sourceType: "manual", sourceAuthority: payload.sourceAuthority,
    sourceRef: payload.sourceRef, claim: payload.claim, sourceEventId: row.id, observedAt,
    validFrom: payload.validFrom ? new Date(payload.validFrom) : null, validTo: payload.validTo ? new Date(payload.validTo) : null,
    epistemicState: payload.epistemicState, qualityState: payload.qualityState, confidence: payload.confidence,
    supersedesEvidenceId, createdBy: row.actorId,
  }));
  const observationId = idOf(await tx.insert(observations).values({
    workspaceId: row.workspaceId, entityId: payload.entityId, obligationId: payload.obligationId, evidenceId,
    attributeKey: payload.attributeKey, value: payload.value, epistemicState: payload.epistemicState, confidence: payload.confidence,
    observedAt, validFrom: payload.validFrom ? new Date(payload.validFrom) : null, validTo: payload.validTo ? new Date(payload.validTo) : null,
    supersedesObservationId: payload.supersedesObservationId, sourceEventId: row.id, createdBy: row.actorId,
  }));
  await tx.insert(operationalEvents).values({
    workspaceId: row.workspaceId, eventType: payload.supersedesObservationId ? "observation.corrected" : "observation.captured",
    recordType: "observation", recordId: observationId, summary: `${payload.supersedesObservationId ? "Corrected" : "Recorded"} observation: ${payload.attributeKey}`,
    evidenceId, happenedAt: observedAt, observedAt, correlationId: row.correlationId, causationId: String(row.id), epistemicState: payload.epistemicState, actorId: row.actorId,
  });
  await tx.insert(auditLog).values({ workspaceId: row.workspaceId, actorId: row.actorId, operation: payload.supersedesObservationId ? "observation.corrected" : "observation.created", recordType: "observation", recordId: observationId, details: JSON.stringify({ sourceEventId: row.id, evidenceId, attributeKey: payload.attributeKey, supersedesObservationId: payload.supersedesObservationId }) });
  const conflictRefresh = await refreshConflictFor(tx as unknown as OperantDb, row.workspaceId, payload.entityId, payload.attributeKey, new Date());
  await tx.insert(analysisJobs).values({ workspaceId: row.workspaceId, eventId: row.id, status: "queued" }).onDuplicateKeyUpdate({ set: { status: "queued" } });
  return { evidenceId, observationId, conflictRefreshIncomplete: conflictRefresh?.status === "incomplete" ? [payload.attributeKey] : [] };
}

async function processGitHubIssue(tx: Parameters<Parameters<OperantDb["transaction"]>[0]>[0], row: ClaimedEvent, payloadUnknown: unknown) {
  const payload: GitHubIssuePayload = githubIssuePayloadSchema.parse(payloadUnknown);
  if (!row.connectionId) throw Object.assign(new Error("GitHub event has no connection."), { permanent: true, errorClass: "integration" });
  const connections = await tx.select().from(githubConnections).where(and(eq(githubConnections.id, row.connectionId), eq(githubConnections.workspaceId, row.workspaceId), eq(githubConnections.status, "active"))).limit(1);
  const connection = connections[0];
  if (!connection || connection.repositoryId !== payload.repository.id || connection.repositoryOwner.toLowerCase() + "/" + connection.repositoryName.toLowerCase() !== payload.repository.fullName.toLowerCase()) {
    throw Object.assign(new Error("Event repository does not match the active connection."), { permanent: true, errorClass: "tenant_reference" });
  }
  const externalId = `${payload.repository.id}:issue:${payload.issue.id}`;
  const identityRows = await tx.select().from(externalIdentities).where(and(eq(externalIdentities.workspaceId, row.workspaceId), eq(externalIdentities.provider, "github"), eq(externalIdentities.externalKind, "issue"), eq(externalIdentities.externalId, externalId))).limit(1).for("update");
  let entityId = identityRows[0]?.entityId ?? null;
  if (!entityId) {
    entityId = idOf(await tx.insert(entities).values({ workspaceId: row.workspaceId, entityType: "github_issue", displayName: `GitHub issue #${payload.issue.number}`, description: null, sourceIdentity: payload.issue.htmlUrl, identityState: "unresolved", createdBy: row.actorId ?? connection.createdBy }));
    const inserted = await tx.insert(externalIdentities).values({ workspaceId: row.workspaceId, connectionId: connection.id, provider: "github", externalKind: "issue", externalId, externalUrl: payload.issue.htmlUrl, entityId, identityState: "resolved", lastSeenAt: new Date() });
    void inserted;
  } else {
    await tx.update(externalIdentities).set({ lastSeenAt: new Date(), externalUrl: payload.issue.htmlUrl }).where(eq(externalIdentities.id, identityRows[0].id));
  }
  const occurredAt = payload.issue.updatedAt ? new Date(payload.issue.updatedAt) : new Date();
  const claim = `GitHub issue #${payload.issue.number} ${payload.eventAction}: ${payload.issue.title}${payload.issue.body ? ` — ${payload.issue.body.slice(0, 1500)}` : ""}`;
  const evidenceId = idOf(await tx.insert(evidence).values({
    workspaceId: row.workspaceId, sourceName: `GitHub · ${payload.repository.fullName}`, sourceType: "integration", sourceAuthority: "direct",
    sourceRef: payload.issue.htmlUrl, claim, sourceEventId: row.id, observedAt: occurredAt, validFrom: occurredAt,
    epistemicState: "observed", qualityState: "current", confidence: 100, createdBy: row.actorId ?? connection.createdBy,
  }));
  const values = [
    { key: "github_issue_state", value: payload.issue.state },
    { key: "github_issue_title", value: payload.issue.title },
  ];
  const observationIds: number[] = [];
  const conflictRefreshIncomplete: string[] = [];
  for (const item of values) {
    const sameStreamRows = await tx.select({ value: observations.value, validFrom: observations.validFrom }).from(observations)
      .innerJoin(evidence, and(eq(observations.evidenceId, evidence.id), eq(observations.workspaceId, evidence.workspaceId)))
      .innerJoin(inboundEvents, and(eq(observations.sourceEventId, inboundEvents.id), eq(observations.workspaceId, inboundEvents.workspaceId)))
      .where(and(eq(observations.workspaceId, row.workspaceId), eq(observations.entityId, entityId), eq(observations.attributeKey, item.key), eq(evidence.sourceType, "integration"), eq(inboundEvents.provider, "github"), eq(inboundEvents.connectionId, row.connectionId)))
      .orderBy(asc(observations.validFrom), asc(observations.recordedAt), asc(observations.id)).limit(1000).for("update");
    if (sameStreamRows.some((existing) => existing.value === item.value && existing.validFrom?.getTime() === occurredAt.getTime())) continue;
    const id = idOf(await tx.insert(observations).values({
      workspaceId: row.workspaceId, entityId, evidenceId, attributeKey: item.key, value: item.value,
      epistemicState: "observed", confidence: 100, observedAt: occurredAt, validFrom: occurredAt,
      supersedesObservationId: null, sourceEventId: row.id, createdBy: row.actorId ?? connection.createdBy,
    }));
    observationIds.push(id);
    const conflictRefresh = await refreshConflictFor(tx as unknown as OperantDb, row.workspaceId, entityId, item.key, new Date());
    if (conflictRefresh?.status === "incomplete") conflictRefreshIncomplete.push(item.key);
  }
  await tx.insert(operationalEvents).values({
    workspaceId: row.workspaceId, eventType: `github.issue.${payload.eventAction}`, recordType: "entity", recordId: entityId,
    summary: `GitHub issue #${payload.issue.number}: ${payload.eventAction} · ${payload.issue.title.slice(0, 250)}`,
    evidenceId, happenedAt: occurredAt, observedAt: new Date(), sourceProvider: "github", sourceExternalId: externalId,
    correlationId: row.correlationId, causationId: String(row.id), epistemicState: "observed", actorId: row.actorId,
  });
  await tx.update(githubConnections).set({ lastWebhookAt: new Date(), lastErrorAt: null, lastErrorCode: null }).where(eq(githubConnections.id, connection.id));
  await tx.insert(auditLog).values({ workspaceId: row.workspaceId, actorId: row.actorId, operation: "github.issue.ingested", recordType: "entity", recordId: entityId, details: JSON.stringify({ connectionId: connection.id, eventId: row.id, sourceExternalId: externalId, eventAction: payload.eventAction, evidenceId, observationIds }) });
  await tx.insert(analysisJobs).values({ workspaceId: row.workspaceId, eventId: row.id, status: "queued" }).onDuplicateKeyUpdate({ set: { status: "queued" } });
  return { entityId, evidenceId, observationIds, conflictRefreshIncomplete };
}

function failureInfo(error: unknown): { permanent: boolean; errorClass: string; safeMessage: string } {
  const decorated = error as { permanent?: boolean; errorClass?: string };
  if (error instanceof Error && error.name === "ZodError") return { permanent: true, errorClass: "validation", safeMessage: "The event payload did not match the accepted schema." };
  if (decorated?.permanent) return { permanent: true, errorClass: decorated.errorClass ?? "processing", safeMessage: error instanceof Error ? error.message.slice(0, 450) : "Event processing failed." };
  return { permanent: false, errorClass: decorated?.errorClass ?? "processing", safeMessage: "Event processing failed; a bounded retry may be scheduled." };
}

async function processClaimed(db: OperantDb, row: ClaimedEvent, workerId: string): Promise<"processed" | "retry" | "dead"> {
  try {
    await db.transaction(async (tx) => {
      const locked = await tx.select({ id: inboundEvents.id, leaseOwner: inboundEvents.leaseOwner, status: inboundEvents.status }).from(inboundEvents).where(eq(inboundEvents.id, row.id)).limit(1).for("update");
      if (!locked[0] || locked[0].status !== "processing" || locked[0].leaseOwner !== workerId) return;
      const result = row.provider === "manual"
        ? await processManual(tx, row, row.payload)
        : await processGitHubIssue(tx, row, row.payload);
      const retainedPayload = row.provider === "github" ? compactProcessedGitHubIssuePayload(row.payload) : row.payload;
      await tx.update(inboundEvents).set({ status: "processed", payload: retainedPayload, resultPayload: result, processedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }).where(eq(inboundEvents.id, row.id));
      await tx.update(eventAttempts).set({ outcome: "succeeded", finishedAt: new Date() }).where(and(eq(eventAttempts.eventId, row.id), eq(eventAttempts.attemptNumber, row.attemptCount)));
    });
    return "processed";
  } catch (error) {
    const failure = failureInfo(error);
    const dead = failure.permanent || row.attemptCount >= row.maxAttempts;
    const backoffSeconds = dead ? null : retryDelaySeconds(row.attemptCount);
    await db.transaction(async (tx) => {
      const latest = await tx.select({ status: inboundEvents.status, leaseOwner: inboundEvents.leaseOwner }).from(inboundEvents).where(eq(inboundEvents.id, row.id)).limit(1).for("update");
      if (!latest[0] || latest[0].status !== "processing" || latest[0].leaseOwner !== workerId) return;
      const now = new Date();
      const nextAttemptAt = backoffSeconds === null ? now : new Date(now.getTime() + backoffSeconds * 1000);
      await tx.update(inboundEvents).set({ status: dead ? "dead_letter" : "retryable_failure", lastErrorClass: failure.errorClass, lastErrorMessage: failure.safeMessage, nextAttemptAt, deadLetteredAt: dead ? now : null, leaseOwner: null, leaseExpiresAt: null }).where(eq(inboundEvents.id, row.id));
      await tx.update(eventAttempts).set({ outcome: dead ? "dead_letter" : "retry_scheduled", finishedAt: now, errorClass: failure.errorClass, errorMessage: failure.safeMessage }).where(and(eq(eventAttempts.eventId, row.id), eq(eventAttempts.attemptNumber, row.attemptCount)));
    });
    console.error(JSON.stringify({ level: "error", component: "event-worker", eventId: row.id, correlationId: row.correlationId, errorClass: failure.errorClass, status: dead ? "dead_letter" : "retryable_failure", retryDelaySeconds: backoffSeconds }));
    return dead ? "dead" : "retry";
  }
}

export async function drainEventQueue(db: OperantDb, workerId = `worker-${randomUUID()}`, maxEvents = 5): Promise<DrainResult> {
  const max = Math.max(1, Math.min(10, Math.floor(maxEvents)));
  const result: DrainResult = { claimed: 0, processed: 0, retryScheduled: 0, deadLettered: 0, busy: false };
  const claimedEventIds: number[] = [];
  for (let index = 0; index < max; index++) {
    const row = await claimNext(db, workerId, claimedEventIds);
    if (!row) break;
    claimedEventIds.push(row.id);
    result.claimed += 1;
    const outcome = await processClaimed(db, row, workerId);
    if (outcome === "processed") result.processed += 1;
    else if (outcome === "retry") result.retryScheduled += 1;
    else result.deadLettered += 1;
  }
  return result;
}

export async function enqueueManualObservation(
  db: OperantDb,
  params: { workspaceId: number; actorId: number; correlationId: string; idempotencyKey: string; payload: ManualObservationPayload },
) {
  const payload = manualObservationPayloadSchema.parse(params.payload);
  const now = new Date();
  const payloadHash = sha256Hex(JSON.stringify(payload));
  const rows = await db.insert(inboundEvents).values({
    workspaceId: params.workspaceId, provider: "manual", deliveryId: `manual:${params.idempotencyKey}`,
    idempotencyKey: `manual:${params.workspaceId}:${params.idempotencyKey}`, eventType: "manual.observation", eventAction: "captured",
    sourceExternalId: params.idempotencyKey, correlationId: params.correlationId, payloadHash,
    payload, actorId: params.actorId, happenedAt: new Date(payload.observedAt), observedAt: now, status: "queued", nextAttemptAt: now,
  }).onDuplicateKeyUpdate({ set: { status: sql`${inboundEvents.status}` } });
  const affectedRows = Number(rows[0]?.affectedRows ?? 0);
  const existing = await db.select({ id: inboundEvents.id, status: inboundEvents.status, payloadHash: inboundEvents.payloadHash }).from(inboundEvents)
    .where(and(eq(inboundEvents.workspaceId, params.workspaceId), eq(inboundEvents.idempotencyKey, `manual:${params.workspaceId}:${params.idempotencyKey}`))).limit(1);
  if (!existing[0]) throw new Error("The event could not be persisted.");
  if (existing[0].payloadHash !== payloadHash) throw new Error("This idempotency key is already bound to a different evidence submission. Use a new submission key.");
  return { eventId: existing[0].id, status: existing[0].status, duplicate: affectedRows === 0 };
}
