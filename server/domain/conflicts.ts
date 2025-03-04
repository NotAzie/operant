import { and, eq, isNull, sql } from "drizzle-orm";
import { conflictRecords, evidence, inboundEvents, observations } from "../../drizzle/schema";
import type { OperantDb } from "../operantAccess";
import { assessConflictWindow, findActiveConflicts } from "../operantDomain";
import { sha256Hex } from "../integrations/github/crypto";

type ObservationLike = Pick<typeof observations.$inferSelect, "id" | "entityId" | "attributeKey" | "value" | "supersedesObservationId" | "recordedAt" | "validFrom" | "validTo"> & {
  sourceType: string;
  sourceProvider: string | null;
  sourceConnectionId: number | null;
};

export function activeConflictGroups(rows: ObservationLike[], asOf = new Date()) {
  return findActiveConflicts(rows, asOf).map((group) => group.observations);
}

export async function refreshConflictFor(
  db: OperantDb,
  workspaceId: number,
  entityId: number | null,
  attributeKey: string,
  asOf = new Date(),
) {
  const subject = entityId === null ? isNull(observations.entityId) : eq(observations.entityId, entityId);
  const rows = await db.select({
    id: observations.id, entityId: observations.entityId, attributeKey: observations.attributeKey,
    value: observations.value, supersedesObservationId: observations.supersedesObservationId,
    recordedAt: observations.recordedAt, validFrom: observations.validFrom, validTo: observations.validTo,
    sourceType: evidence.sourceType, sourceProvider: inboundEvents.provider, sourceConnectionId: inboundEvents.connectionId,
  }).from(observations).innerJoin(evidence, and(eq(observations.evidenceId, evidence.id), eq(observations.workspaceId, evidence.workspaceId)))
    .leftJoin(inboundEvents, and(eq(observations.sourceEventId, inboundEvents.id), eq(observations.workspaceId, inboundEvents.workspaceId))).where(and(
    eq(observations.workspaceId, workspaceId), subject,
    sql`lower(${observations.attributeKey}) = ${attributeKey.trim().toLowerCase()}`,
  )).limit(501);
  const assessment = assessConflictWindow(rows, 500, asOf);
  if (assessment.status === "incomplete") {
    console.warn(JSON.stringify({ level: "warn", component: "conflict-refresh", workspaceId, entityId, attributeKey: attributeKey.trim(), status: "incomplete", maximumRows: 500 }));
    return { status: "incomplete" as const, maximumRows: 500 };
  }
  const target = assessment.conflicts.find((group) => group.entityId === entityId && group.attributeKey.trim().toLowerCase() === attributeKey.trim().toLowerCase());
  const active = await db.select({ id: conflictRecords.id }).from(conflictRecords).where(and(
    eq(conflictRecords.workspaceId, workspaceId),
    entityId === null ? isNull(conflictRecords.entityId) : eq(conflictRecords.entityId, entityId),
    sql`lower(${conflictRecords.attributeKey}) = ${attributeKey.trim().toLowerCase()}`,
    eq(conflictRecords.status, "active"),
  ));
  if (!target) {
    if (active.length) await db.update(conflictRecords).set({ status: "resolved", resolvedAt: asOf, resolution: "No current disagreeing assertions remain under supersession and valid-time rules." }).where(and(
      eq(conflictRecords.workspaceId, workspaceId),
      entityId === null ? isNull(conflictRecords.entityId) : eq(conflictRecords.entityId, entityId),
      sql`lower(${conflictRecords.attributeKey}) = ${attributeKey.trim().toLowerCase()}`,
      eq(conflictRecords.status, "active"),
    ));
    return null;
  }
  const observationIds = target.observations.map((row) => row.id).sort((a, b) => a - b);
  const key = sha256Hex(`${workspaceId}|${entityId ?? "none"}|${attributeKey.trim().toLowerCase()}|${observationIds.join(",")}`).slice(0, 64);
  await db.insert(conflictRecords).values({
    workspaceId, conflictKey: key, entityId, attributeKey: attributeKey.trim(), observationIds, status: "active", detectedAt: asOf,
  }).onDuplicateKeyUpdate({ set: { status: "active", observationIds, detectedAt: asOf, resolvedAt: null, resolvedBy: null, resolution: null } });
  for (const old of active) {
    const sameKey = await db.select({ id: conflictRecords.id }).from(conflictRecords).where(and(eq(conflictRecords.id, old.id), eq(conflictRecords.conflictKey, key))).limit(1);
    if (!sameKey.length) await db.update(conflictRecords).set({ status: "resolved", resolvedAt: asOf, resolution: "Superseded by a newer active conflict fingerprint." }).where(eq(conflictRecords.id, old.id));
  }
  return { status: "active" as const, conflictKey: key, observationIds };
}
