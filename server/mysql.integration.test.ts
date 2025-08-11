import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { auditLog, entities, eventAttempts, evidence, inboundEvents, observations, operationalEvents, relationships, users, workspaces } from "../drizzle/schema";

const testDatabaseUrl = process.env.OPERANT_TEST_DATABASE_URL;
function isSafeTestDatabase(url: string | undefined): boolean {
  if (!url || url === process.env.DATABASE_URL) return false;
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, "")).toLowerCase();
    return ["mysql:", "mysql2:"].includes(parsed.protocol) && /(?:^|[_-])test(?:[_-]|$)/.test(name);
  } catch {
    return false;
  }
}
if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error("OPERANT_TEST_DATABASE_URL must name a distinct MySQL database containing a standalone 'test' segment.");
}

const databaseSuite = describe.skipIf(!isSafeTestDatabase(testDatabaseUrl));
databaseSuite("disposable MySQL persistence invariants", () => {
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    db = drizzle(testDatabaseUrl!);
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  it("persists queue and attempt rows transactionally and enforces global idempotency/attempt-number uniqueness", async () => {
    const nonce = randomUUID();
    const openId = `operant_test_${nonce}`;
    const deliveryId = `test-${nonce}`;
    const idempotencyKey = `mysql-test-${nonce}`;
    const rollbackSentinel = new Error("expected integration-test rollback");

    await expect(db.transaction(async (tx) => {
      const userInsert = await tx.insert(users).values({ openId });
      const userId = Number(userInsert[0].insertId);
      const workspaceInsert = await tx.insert(workspaces).values({ name: `Disposable ${nonce}`, kind: "personal", isIllustrative: false, createdBy: userId });
      const workspaceId = Number(workspaceInsert[0].insertId);
      const eventInput = {
        workspaceId,
        connectionId: null,
        provider: "manual" as const,
        deliveryId,
        idempotencyKey,
        eventType: "manual.observation",
        eventAction: "captured",
        sourceExternalId: deliveryId,
        correlationId: nonce.replace(/-/g, "").slice(0, 32),
        payloadHash: "a".repeat(64),
        payload: { kind: "test" },
        observedAt: new Date(),
      };
      const eventInsert = await tx.insert(inboundEvents).values(eventInput);
      const eventId = Number(eventInsert[0].insertId);
      const startedAt = new Date();
      await tx.insert(eventAttempts).values({ workspaceId, eventId, attemptNumber: 1, outcome: "started", startedAt });

      await expect(tx.insert(inboundEvents).values(eventInput)).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      await expect(tx.insert(eventAttempts).values({ workspaceId, eventId, attemptNumber: 1, outcome: "started", startedAt })).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      throw rollbackSentinel;
    })).rejects.toBe(rollbackSentinel);

    const residue = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    expect(residue).toEqual([]);
  });

  it("rejects a cross-workspace entity relationship at the database boundary", async () => {
    const nonce = randomUUID();
    const openId = `operant_tenant_test_${nonce}`;
    const rollbackSentinel = new Error("expected tenant-test rollback");
    await expect(db.transaction(async (tx) => {
      const userInsert = await tx.insert(users).values({ openId });
      const userId = Number(userInsert[0].insertId);
      const firstWorkspace = Number((await tx.insert(workspaces).values({ name: `Tenant A ${nonce}`, kind: "personal", createdBy: userId }))[0].insertId);
      const secondWorkspace = Number((await tx.insert(workspaces).values({ name: `Tenant B ${nonce}`, kind: "personal", createdBy: userId }))[0].insertId);
      const firstEntity = Number((await tx.insert(entities).values({ workspaceId: firstWorkspace, entityType: "test", displayName: `A ${nonce}`, createdBy: userId }))[0].insertId);
      const secondEntity = Number((await tx.insert(entities).values({ workspaceId: secondWorkspace, entityType: "test", displayName: `B ${nonce}`, createdBy: userId }))[0].insertId);

      await expect(tx.insert(relationships).values({ workspaceId: firstWorkspace, subjectEntityId: firstEntity, objectEntityId: secondEntity, predicate: "test_link", createdBy: userId })).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
      throw rollbackSentinel;
    })).rejects.toBe(rollbackSentinel);

    const residue = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    expect(residue).toEqual([]);
  });

  it("rolls back entity, operational event, and audit history as one unit", async () => {
    const nonce = randomUUID();
    const openId = `operant_atomic_test_${nonce}`;
    const rollbackSentinel = new Error("expected atomic-write rollback");
    let workspaceId = 0;
    let entityId = 0;

    await expect(db.transaction(async (tx) => {
      const userId = Number((await tx.insert(users).values({ openId }))[0].insertId);
      workspaceId = Number((await tx.insert(workspaces).values({ name: `Atomic ${nonce}`, kind: "personal", createdBy: userId }))[0].insertId);
      entityId = Number((await tx.insert(entities).values({ workspaceId, entityType: "test", displayName: `Atomic entity ${nonce}`, createdBy: userId }))[0].insertId);
      await tx.insert(operationalEvents).values({ workspaceId, eventType: "entity.created", recordType: "entity", recordId: entityId, summary: "Atomic-write integration test", actorId: userId });
      await tx.insert(auditLog).values({ workspaceId, actorId: userId, operation: "entity.created", recordType: "entity", recordId: entityId, details: JSON.stringify({ test: true }) });
      throw rollbackSentinel;
    })).rejects.toBe(rollbackSentinel);

    expect(workspaceId).toBeGreaterThan(0);
    expect(entityId).toBeGreaterThan(0);
    expect(await db.select({ id: entities.id }).from(entities).where(eq(entities.id, entityId))).toEqual([]);
    expect(await db.select({ id: operationalEvents.id }).from(operationalEvents).where(eq(operationalEvents.workspaceId, workspaceId))).toEqual([]);
    expect(await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.workspaceId, workspaceId))).toEqual([]);
    const usersLeft = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    expect(usersLeft).toEqual([]);
  });

  it("enforces workspace-scoped event provenance and requires audited detachment before retention deletion", async () => {
    const nonce = randomUUID();
    const openId = `operant_event_scope_test_${nonce}`;
    const rollbackSentinel = new Error("expected provenance-test rollback");

    await expect(db.transaction(async (tx) => {
      const userId = Number((await tx.insert(users).values({ openId }))[0].insertId);
      const workspaceA = Number((await tx.insert(workspaces).values({ name: `Provenance A ${nonce}`, kind: "personal", createdBy: userId }))[0].insertId);
      const workspaceB = Number((await tx.insert(workspaces).values({ name: `Provenance B ${nonce}`, kind: "personal", createdBy: userId }))[0].insertId);
      const observedAt = new Date();
      const makeEvent = (workspaceId: number, suffix: string) => ({
        workspaceId,
        connectionId: null,
        provider: "manual" as const,
        deliveryId: `prov-${nonce}-${suffix}`,
        idempotencyKey: `provenance-test-${nonce}-${suffix}`,
        eventType: "manual.observation",
        eventAction: "captured",
        sourceExternalId: `prov-${nonce}-${suffix}`,
        correlationId: nonce.replace(/-/g, "").slice(0, 32),
        payloadHash: "b".repeat(64),
        payload: { kind: "test" },
        observedAt,
      });
      const eventA = Number((await tx.insert(inboundEvents).values(makeEvent(workspaceA, "a")))[0].insertId);
      const eventB = Number((await tx.insert(inboundEvents).values(makeEvent(workspaceB, "b")))[0].insertId);

      const evidenceInput = {
        sourceName: "integration-test",
        sourceType: "integration" as const,
        sourceAuthority: "reported" as const,
        claim: "Test claim retained after event purge",
        observedAt,
        createdBy: userId,
      };
      await expect(tx.insert(evidence).values({ ...evidenceInput, workspaceId: workspaceA, sourceEventId: eventB }))
        .rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });

      const evidenceId = Number((await tx.insert(evidence).values({ ...evidenceInput, workspaceId: workspaceA, sourceEventId: eventA }))[0].insertId);
      const observationId = Number((await tx.insert(observations).values({
        workspaceId: workspaceA,
        evidenceId,
        attributeKey: "status",
        value: "observed",
        observedAt,
        sourceEventId: eventA,
        createdBy: userId,
      }))[0].insertId);
      await expect(tx.update(observations).set({ sourceEventId: eventB }).where(and(
        eq(observations.workspaceId, workspaceA), eq(observations.id, observationId),
      ))).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });

      await expect(tx.delete(inboundEvents).where(and(
        eq(inboundEvents.workspaceId, workspaceA), eq(inboundEvents.id, eventA),
      ))).rejects.toMatchObject({ code: "ER_ROW_IS_REFERENCED_2" });

      // Retention detaches both provenance links and records the operation in one transaction.
      await tx.update(evidence).set({ sourceEventId: null }).where(and(
        eq(evidence.workspaceId, workspaceA), eq(evidence.id, evidenceId),
      ));
      await tx.update(observations).set({ sourceEventId: null }).where(and(
        eq(observations.workspaceId, workspaceA), eq(observations.id, observationId),
      ));
      await tx.insert(auditLog).values({
        workspaceId: workspaceA,
        actorId: userId,
        operation: "inbound_event.references_detached",
        recordType: "inbound_event",
        recordId: eventA,
        details: JSON.stringify({ reason: "integration-test retention purge", evidenceReferencesDetached: 1, observationReferencesDetached: 1 }),
      });
      await tx.delete(inboundEvents).where(and(
        eq(inboundEvents.workspaceId, workspaceA), eq(inboundEvents.id, eventA),
      ));

      expect(await tx.select({ id: inboundEvents.id }).from(inboundEvents).where(eq(inboundEvents.id, eventA))).toEqual([]);
      expect(await tx.select({ sourceEventId: evidence.sourceEventId }).from(evidence).where(eq(evidence.id, evidenceId)))
        .toEqual([{ sourceEventId: null }]);
      expect(await tx.select({ sourceEventId: observations.sourceEventId }).from(observations).where(eq(observations.id, observationId)))
        .toEqual([{ sourceEventId: null }]);
      expect(await tx.select({ id: auditLog.id }).from(auditLog).where(and(
        eq(auditLog.workspaceId, workspaceA), eq(auditLog.recordId, eventA), eq(auditLog.operation, "inbound_event.references_detached"),
      ))).toHaveLength(1);

      throw rollbackSentinel;
    })).rejects.toBe(rollbackSentinel);

    const residue = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    expect(residue).toEqual([]);
  });
});
