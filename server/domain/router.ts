import { and, asc, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLog, evidence, entities, inboundEvents, observations, obligations, operationalEvents, relationships, resources, resourceVersions, resourceAllocations, responsibilityAssignments, workspaceMembers } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspaceAccess, requireWritableWorkspace } from "../operantAccess";
import { reconstructAsOf, reconstructEntityMetadataAsOf, reconstructRelationshipDecisionsAsOf, resolveResourceVersions, type TemporalAssertion } from "./temporal";

const workspaceInput = z.object({ workspaceId: z.number().int().positive() });
const dateField = z.coerce.date();
const optionalDate = z.coerce.date().optional();
const validity = (value: { validFrom?: Date; validTo?: Date }) => !value.validFrom || !value.validTo || value.validTo >= value.validFrom;
const source = z.object({ sourceName: z.string().trim().min(1).max(200), sourceAuthority: z.enum(["unknown", "reported", "direct", "official"]).default("unknown"), sourceRef: z.string().trim().max(240).optional(), evidenceClaim: z.string().trim().min(1).max(5000), observedAt: dateField });

async function requireEvidence(db: Awaited<ReturnType<typeof import("../db").getDb>> & object, workspaceId: number, evidenceId: number) {
  const rows = await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.workspaceId, workspaceId), eq(evidence.id, evidenceId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected evidence is not in this workspace." });
}

function getId(result: { 0?: { insertId?: number | bigint } }) {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database did not return a new record ID." });
  return id;
}

async function recordEvidence(tx: Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>["transaction"]>[0]>[0], workspaceId: number, userId: number, data: z.infer<typeof source>) {
  const result = await tx.insert(evidence).values({ workspaceId, sourceName: data.sourceName, sourceType: "manual", sourceAuthority: data.sourceAuthority, sourceRef: data.sourceRef || null, claim: data.evidenceClaim, observedAt: data.observedAt, epistemicState: "observed", qualityState: "current", confidence: 100, createdBy: userId });
  return getId(result);
}

export const operantDomainRouter = router({
  asOf: protectedProcedure.input(z.object({ ...workspaceInput.shape, knowledgeAsOf: optionalDate, validAt: optionalDate })).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const knowledgeAsOf = input.knowledgeAsOf ?? new Date();
    const validAt = input.validAt ?? knowledgeAsOf;
    const [entityRows, observationRows, relationshipRows, obligationRows, obligationAuditRows, entityAuditRows, relationshipAuditRows, resourceRows, versionRows, allocationRows, assignmentRows] = await Promise.all([
      db.select().from(entities).where(eq(entities.workspaceId, input.workspaceId)).orderBy(asc(entities.displayName)).limit(501),
      db.select({ id: observations.id, entityId: observations.entityId, obligationId: observations.obligationId, evidenceId: observations.evidenceId, attributeKey: observations.attributeKey, value: observations.value, epistemicState: observations.epistemicState, confidence: observations.confidence, observedAt: observations.observedAt, recordedAt: observations.recordedAt, validFrom: observations.validFrom, validTo: observations.validTo, supersedesObservationId: observations.supersedesObservationId, evidenceQuality: evidence.qualityState, sourceName: evidence.sourceName, sourceAuthority: evidence.sourceAuthority, sourceType: evidence.sourceType, sourceProvider: inboundEvents.provider, sourceConnectionId: inboundEvents.connectionId })
        .from(observations).innerJoin(evidence, and(eq(observations.evidenceId, evidence.id), eq(observations.workspaceId, evidence.workspaceId))).leftJoin(inboundEvents, and(eq(observations.sourceEventId, inboundEvents.id), eq(observations.workspaceId, inboundEvents.workspaceId))).where(eq(observations.workspaceId, input.workspaceId)).orderBy(desc(observations.recordedAt)).limit(1001),
      db.select().from(relationships).where(eq(relationships.workspaceId, input.workspaceId)).orderBy(desc(relationships.createdAt)).limit(501),
      db.select().from(obligations).where(eq(obligations.workspaceId, input.workspaceId)).orderBy(asc(obligations.dueAt)).limit(501),
      db.select().from(auditLog).where(and(eq(auditLog.workspaceId, input.workspaceId), eq(auditLog.recordType, "obligation"))).orderBy(asc(auditLog.createdAt)).limit(2001),
      db.select().from(auditLog).where(and(eq(auditLog.workspaceId, input.workspaceId), eq(auditLog.recordType, "entity"))).orderBy(asc(auditLog.createdAt)).limit(2001),
      db.select().from(auditLog).where(and(eq(auditLog.workspaceId, input.workspaceId), eq(auditLog.recordType, "relationship"))).orderBy(asc(auditLog.createdAt)).limit(2001),
      db.select().from(resources).where(eq(resources.workspaceId, input.workspaceId)).orderBy(asc(resources.name)).limit(501),
      db.select().from(resourceVersions).where(eq(resourceVersions.workspaceId, input.workspaceId)).orderBy(desc(resourceVersions.recordedAt)).limit(1001),
      db.select().from(resourceAllocations).where(eq(resourceAllocations.workspaceId, input.workspaceId)).orderBy(desc(resourceAllocations.recordedAt)).limit(1001),
      db.select().from(responsibilityAssignments).where(eq(responsibilityAssignments.workspaceId, input.workspaceId)).orderBy(desc(responsibilityAssignments.recordedAt)).limit(1001),
    ]);

    const limits = { entities: 500, observations: 1000, relationships: 500, obligations: 500, obligationAudit: 2000, entityAudit: 2000, relationshipAudit: 2000, resources: 500, resourceVersions: 1000, allocations: 1000, assignments: 1000 } as const;
    const truncatedCollections = [
      entityRows.length > limits.entities && "entities",
      observationRows.length > limits.observations && "observations",
      relationshipRows.length > limits.relationships && "relationships",
      obligationRows.length > limits.obligations && "obligations",
      obligationAuditRows.length > limits.obligationAudit && "obligationAudit",
      entityAuditRows.length > limits.entityAudit && "entityAudit",
      relationshipAuditRows.length > limits.relationshipAudit && "relationshipAudit",
      resourceRows.length > limits.resources && "resources",
      versionRows.length > limits.resourceVersions && "resourceVersions",
      allocationRows.length > limits.allocations && "allocations",
      assignmentRows.length > limits.assignments && "assignments",
    ].filter((collection): collection is string => Boolean(collection));
    const bounded = {
      entities: entityRows.slice(0, limits.entities), observations: observationRows.slice(0, limits.observations),
      relationships: relationshipRows.slice(0, limits.relationships), obligations: obligationRows.slice(0, limits.obligations),
      obligationAudit: obligationAuditRows.slice(0, limits.obligationAudit), entityAudit: entityAuditRows.slice(0, limits.entityAudit),
      relationshipAudit: relationshipAuditRows.slice(0, limits.relationshipAudit), resources: resourceRows.slice(0, limits.resources),
      versions: versionRows.slice(0, limits.resourceVersions), allocations: allocationRows.slice(0, limits.allocations),
      assignments: assignmentRows.slice(0, limits.assignments),
    };

    const knownEntities = reconstructEntityMetadataAsOf(bounded.entities, bounded.entityAudit, knowledgeAsOf);
    const knownRelationshipStates = reconstructRelationshipDecisionsAsOf(bounded.relationships, bounded.relationshipAudit, knowledgeAsOf);
    const temporalAssertions: TemporalAssertion[] = bounded.observations.map((row) => ({ ...row, observedAt: row.observedAt, recordedAt: row.recordedAt, validFrom: row.validFrom, validTo: row.validTo }));
    const facts = reconstructAsOf(temporalAssertions, knowledgeAsOf, validAt).map((fact) => ({
      entityId: fact.entityId,
      entityName: knownEntities.find((item) => item.id === fact.entityId)?.displayName ?? (fact.entityId === null ? "Unlinked assertion" : "Entity unavailable at selected knowledge time"),
      attributeKey: fact.attributeKey,
      assertions: fact.assertions.map((assertion) => {
        const sourceRecord = bounded.observations.find((item) => item.id === assertion.id);
        return { ...assertion, evidenceQuality: sourceRecord?.evidenceQuality ?? "unknown", sourceName: sourceRecord?.sourceName ?? "Unspecified source", sourceAuthority: sourceRecord?.sourceAuthority ?? "unknown" };
      }),
      hasConflict: new Set(fact.assertions.map((item) => item.value.trim().toLocaleLowerCase())).size > 1,
    }));

    const knownRelationships = knownRelationshipStates.filter((row) => row.validFrom <= validAt && (!row.validTo || validAt < row.validTo));
    const obligationStatuses = new Map<number, string>();
    const obligationCompletionEvidence = new Map<number, number | null>();
    for (const row of bounded.obligations) if (row.createdAt <= knowledgeAsOf) { obligationStatuses.set(row.id, "open"); obligationCompletionEvidence.set(row.id, null); }
    for (const entry of bounded.obligationAudit) {
      if (entry.createdAt > knowledgeAsOf || entry.operation !== "obligation.status_changed" || entry.recordId === null || !obligationStatuses.has(entry.recordId)) continue;
      try {
        const details = JSON.parse(entry.details ?? "{}") as Record<string, unknown>;
        if (["open", "satisfied", "cancelled", "disputed"].includes(String(details.to))) {
          obligationStatuses.set(entry.recordId, String(details.to));
          const evidenceId = details.toCompletionEvidenceId ?? details.completionEvidenceId;
          obligationCompletionEvidence.set(entry.recordId, Number.isSafeInteger(evidenceId) && Number(evidenceId) > 0 ? Number(evidenceId) : null);
        }
      } catch { /* malformed historical audit is not applied */ }
    }
    const knownObligations = bounded.obligations.filter((row) => row.createdAt <= knowledgeAsOf).map((row) => ({ ...row, statusAsKnown: obligationStatuses.get(row.id) ?? "open", completionEvidenceIdAsKnown: obligationCompletionEvidence.get(row.id) ?? null, dueAt: row.dueAt }));

    const activeVersions = resolveResourceVersions(bounded.versions, knowledgeAsOf, validAt);
    const knownAllocations = bounded.allocations.filter((row) => row.recordedAt <= knowledgeAsOf && row.validFrom <= validAt && (!row.validTo || validAt < row.validTo));
    const knownAssignments = bounded.assignments.filter((row) => row.recordedAt <= knowledgeAsOf && row.validFrom <= validAt && (!row.validTo || validAt < row.validTo));
    const assignmentSupersededIds = new Set(bounded.assignments.filter((row) => row.recordedAt <= knowledgeAsOf).map((row) => row.supersedesAssignmentId).filter((id): id is number => id !== null));
    const currentAssignments = knownAssignments.filter((row) => !assignmentSupersededIds.has(row.id));
    return {
      knowledgeAsOf, validAt,
      completeness: { complete: truncatedCollections.length === 0, truncatedCollections, limits },
      modelLimitations: ["Observation assertions, audited entity corrections, explicit identity-candidate decisions, obligation status changes, resource versions, allocations, and responsibility assignments are reconstructed from records known by the selected knowledge time.", "Resource names and obligation descriptive fields have no edit procedure in this version; their initial recorded values are shown. Historical reconstruction is limited to fields with recorded temporal or audit history.", "Bounded collections are explicitly marked incomplete when a configured row cap is exceeded; do not treat a partial reconstruction as a complete workspace snapshot."],
      entities: knownEntities,
      facts,
      relationships: knownRelationships,
      obligations: knownObligations,
      resources: bounded.resources.filter((row) => row.createdAt <= knowledgeAsOf),
      resourceVersions: activeVersions,
      allocations: knownAllocations,
      responsibilities: currentAssignments,
      counts: { entities: knownEntities.length, facts: facts.length, assertions: facts.reduce((count, fact) => count + fact.assertions.length, 0), relationships: knownRelationships.length, obligations: knownObligations.length, resources: bounded.resources.filter((row) => row.createdAt <= knowledgeAsOf).length, resourceVersions: activeVersions.length, allocations: knownAllocations.length, responsibilities: currentAssignments.length },
    };
  }),

  resources: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const [items, versions] = await Promise.all([
      db.select().from(resources).where(eq(resources.workspaceId, input.workspaceId)).orderBy(asc(resources.name)).limit(500),
      db.select().from(resourceVersions).where(eq(resourceVersions.workspaceId, input.workspaceId)).orderBy(desc(resourceVersions.recordedAt)).limit(1000),
    ]);
    return { items, versions };
  }),

  createResource: protectedProcedure.input(z.object({ ...workspaceInput.shape, resourceType: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(180), description: z.string().max(5000).optional(), capacity: z.string().regex(/^\d{1,11}(\.\d{1,3})?$/).optional(), unit: z.string().trim().max(40).optional(), availabilityState: z.enum(["available", "limited", "unavailable", "unknown"]).default("unknown"), validFrom: dateField, validTo: optionalDate, ...source.shape }).refine(validity, { path: ["validTo"], message: "Valid-to cannot precede valid-from." })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor"); requireWritableWorkspace(access);
    const { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt, ...data } = input;
    return access.db.transaction(async (tx) => {
      const evidenceId = await recordEvidence(tx, input.workspaceId, ctx.user.id, { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt });
      const resourceId = getId(await tx.insert(resources).values({ workspaceId: input.workspaceId, resourceType: data.resourceType, name: data.name, description: data.description || null, createdBy: ctx.user.id }));
      const versionId = getId(await tx.insert(resourceVersions).values({ workspaceId: input.workspaceId, resourceId, capacity: data.capacity ?? null, unit: data.unit || null, availabilityState: data.availabilityState, validFrom: data.validFrom, validTo: data.validTo ?? null, evidenceId, createdBy: ctx.user.id }));
      await tx.insert(operationalEvents).values({ workspaceId: input.workspaceId, eventType: "resource.created", recordType: "resource", recordId: resourceId, summary: `Resource recorded: ${data.name}`, evidenceId, happenedAt: observedAt, observedAt, epistemicState: "observed", actorId: ctx.user.id });
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "resource.created", recordType: "resource", recordId: resourceId, details: JSON.stringify({ versionId, evidenceId, resourceType: data.resourceType }) });
      return { resourceId, versionId, evidenceId };
    });
  }),

  addResourceVersion: protectedProcedure.input(z.object({ ...workspaceInput.shape, resourceId: z.number().int().positive(), capacity: z.string().regex(/^\d{1,11}(\.\d{1,3})?$/).optional(), unit: z.string().trim().max(40).optional(), availabilityState: z.enum(["available", "limited", "unavailable", "unknown"]), validFrom: dateField, validTo: optionalDate, supersedesVersionId: z.number().int().positive().optional(), ...source.shape }).refine(validity, { path: ["validTo"], message: "Valid-to cannot precede valid-from." })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor"); requireWritableWorkspace(access);
    const item = await access.db.select({ id: resources.id }).from(resources).where(and(eq(resources.id, input.resourceId), eq(resources.workspaceId, input.workspaceId))).limit(1);
    if (!item[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The resource is not in this workspace." });
    if (input.supersedesVersionId) {
      const prior = await access.db.select({ id: resourceVersions.id, resourceId: resourceVersions.resourceId }).from(resourceVersions).where(and(eq(resourceVersions.id, input.supersedesVersionId), eq(resourceVersions.workspaceId, input.workspaceId))).limit(1);
      if (!prior[0] || prior[0].resourceId !== input.resourceId) throw new TRPCError({ code: "BAD_REQUEST", message: "The superseded version is not for this resource and workspace." });
    }
    const { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt, ...data } = input;
    return access.db.transaction(async (tx) => {
      const evidenceId = await recordEvidence(tx, input.workspaceId, ctx.user.id, { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt });
      const versionId = getId(await tx.insert(resourceVersions).values({ workspaceId: input.workspaceId, resourceId: data.resourceId, capacity: data.capacity ?? null, unit: data.unit || null, availabilityState: data.availabilityState, validFrom: data.validFrom, validTo: data.validTo ?? null, evidenceId, supersedesVersionId: data.supersedesVersionId ?? null, createdBy: ctx.user.id }));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "resource.version_added", recordType: "resource", recordId: data.resourceId, details: JSON.stringify({ versionId, evidenceId, supersedesVersionId: data.supersedesVersionId ?? null }) });
      return { versionId, evidenceId };
    });
  }),

  createAllocation: protectedProcedure.input(z.object({ ...workspaceInput.shape, resourceId: z.number().int().positive(), obligationId: z.number().int().positive().optional(), amount: z.string().regex(/^\d{1,11}(\.\d{1,3})?$/), unit: z.string().trim().min(1).max(40), status: z.enum(["planned", "active", "released", "unknown"]).default("planned"), validFrom: dateField, validTo: optionalDate, ...source.shape }).refine(validity, { path: ["validTo"], message: "Valid-to cannot precede valid-from." })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor"); requireWritableWorkspace(access);
    const [resourceRows, obligationRows] = await Promise.all([
      access.db.select({ id: resources.id }).from(resources).where(and(eq(resources.id, input.resourceId), eq(resources.workspaceId, input.workspaceId))).limit(1),
      input.obligationId ? access.db.select({ id: obligations.id }).from(obligations).where(and(eq(obligations.id, input.obligationId), eq(obligations.workspaceId, input.workspaceId))).limit(1) : Promise.resolve([]),
    ]);
    if (!resourceRows[0] || (input.obligationId && !obligationRows[0])) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected resource or obligation is not in this workspace." });
    const { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt, ...data } = input;
    return access.db.transaction(async (tx) => {
      const evidenceId = await recordEvidence(tx, input.workspaceId, ctx.user.id, { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt });
      const allocationId = getId(await tx.insert(resourceAllocations).values({ workspaceId: input.workspaceId, resourceId: data.resourceId, obligationId: data.obligationId ?? null, amount: data.amount, unit: data.unit, status: data.status, validFrom: data.validFrom, validTo: data.validTo ?? null, evidenceId, createdBy: ctx.user.id }));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "resource.allocation_created", recordType: "resource_allocation", recordId: allocationId, details: JSON.stringify({ resourceId: data.resourceId, obligationId: data.obligationId ?? null, evidenceId }) });
      return { allocationId, evidenceId };
    });
  }),

  createResponsibility: protectedProcedure.input(z.object({ ...workspaceInput.shape, responsibleUserId: z.number().int().positive().optional(), responsibleEntityId: z.number().int().positive().optional(), subjectEntityId: z.number().int().positive().optional(), responsibilityType: z.string().trim().min(1).max(100), status: z.enum(["active", "delegated", "ended", "unknown"]).default("active"), validFrom: dateField, validTo: optionalDate, ...source.shape }).refine((value) => Boolean(value.responsibleUserId) !== Boolean(value.responsibleEntityId), { path: ["responsibleUserId"], message: "Select exactly one responsible member or entity." }).refine(validity, { path: ["validTo"], message: "Valid-to cannot precede valid-from." })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor"); requireWritableWorkspace(access);
    if (input.responsibleUserId) {
      const member = await access.db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.responsibleUserId))).limit(1);
      if (!member[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The responsible user is not a member of this workspace." });
    }
    if (input.responsibleEntityId || input.subjectEntityId) {
      const ids = [input.responsibleEntityId, input.subjectEntityId].filter((id): id is number => id !== undefined);
      const found = await access.db.select({ id: entities.id }).from(entities).where(and(eq(entities.workspaceId, input.workspaceId), or(...ids.map((id) => eq(entities.id, id))!))).limit(ids.length);
      if (found.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A selected responsibility entity is not in this workspace." });
    }
    const { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt, ...data } = input;
    return access.db.transaction(async (tx) => {
      const evidenceId = await recordEvidence(tx, input.workspaceId, ctx.user.id, { sourceName, sourceAuthority, sourceRef, evidenceClaim, observedAt });
      const assignmentId = getId(await tx.insert(responsibilityAssignments).values({ workspaceId: input.workspaceId, responsibleUserId: data.responsibleUserId ?? null, responsibleEntityId: data.responsibleEntityId ?? null, subjectEntityId: data.subjectEntityId ?? null, responsibilityType: data.responsibilityType, status: data.status, validFrom: data.validFrom, validTo: data.validTo ?? null, evidenceId, createdBy: ctx.user.id }));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "responsibility.created", recordType: "responsibility_assignment", recordId: assignmentId, details: JSON.stringify({ evidenceId, responsibleUserId: data.responsibleUserId ?? null, responsibleEntityId: data.responsibleEntityId ?? null }) });
      return { assignmentId, evidenceId };
    });
  }),
});
