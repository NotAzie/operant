import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  auditLog,
  entities,
  evidence,
  inboundEvents,
  observations,
  operationalEvents,
  obligations,
  relationships,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { requireWorkspaceAccess, requireWritableWorkspace } from "./operantAccess";
import { enqueueManualObservation, drainEventQueue } from "./events/processor";
import { correlationIdFor } from "./observability/correlation";

function idOf(result: { 0?: { insertId?: number | bigint } }): number {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database did not return a new record ID." });
  return id;
}

async function requireEntityInWorkspace(db: Awaited<ReturnType<typeof import("./db").getDb>> & object, workspaceId: number, entityId: number) {
  const rows = await db.select({ id: entities.id }).from(entities).where(and(eq(entities.id, entityId), eq(entities.workspaceId, workspaceId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected entity is not in this workspace." });
}

async function requireEvidenceInWorkspace(db: Awaited<ReturnType<typeof import("./db").getDb>> & object, workspaceId: number, evidenceId: number) {
  const rows = await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.id, evidenceId), eq(evidence.workspaceId, workspaceId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected evidence is not in this workspace." });
}

const workspaceInput = z.object({ workspaceId: z.number().int().positive() });
const epistemicState = z.enum(["observed", "derived", "inferred", "predicted"]);
const qualityState = z.enum(["current", "unknown", "uncertain", "incomplete", "unavailable", "unresolved", "stale", "conflicting"]);
const dateField = z.coerce.date().optional();
const orderedValidity = (input: { validFrom?: Date; validTo?: Date }) => !input.validFrom || !input.validTo || input.validTo.getTime() >= input.validFrom.getTime();

export const operantRecordsRouter = router({
  entities: router({
    list: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
      return db.select().from(entities).where(eq(entities.workspaceId, input.workspaceId)).orderBy(asc(entities.displayName));
    }),
    create: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      entityType: z.string().trim().min(1).max(64),
      displayName: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
      sourceIdentity: z.string().trim().max(220).optional(),
      identityState: z.enum(["resolved", "unresolved"]).default("unresolved"),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      return access.db.transaction(async (tx) => {
        const result = await tx.insert(entities).values({
          workspaceId: input.workspaceId,
          entityType: input.entityType,
          displayName: input.displayName,
          description: input.description || null,
          sourceIdentity: input.sourceIdentity || null,
          identityState: input.identityState,
          createdBy: ctx.user.id,
        });
        const entityId = idOf(result);
        await tx.insert(operationalEvents).values({
          workspaceId: input.workspaceId,
          eventType: "entity.created",
          recordType: "entity",
          recordId: entityId,
          summary: `Entity added: ${input.displayName}`,
          epistemicState: "observed",
          actorId: ctx.user.id,
        });
        await tx.insert(auditLog).values({
          workspaceId: input.workspaceId,
          actorId: ctx.user.id,
          operation: "entity.created",
          recordType: "entity",
          recordId: entityId,
          details: JSON.stringify({ entityType: input.entityType, identityState: input.identityState }),
        });
        return { id: entityId };
      });
    }),
    update: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      entityId: z.number().int().positive(),
      displayName: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
      sourceIdentity: z.string().trim().max(220).optional(),
      identityState: z.enum(["resolved", "unresolved"]),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      const next = { displayName: input.displayName, description: input.description || null, sourceIdentity: input.sourceIdentity || null, identityState: input.identityState };
      return access.db.transaction(async (tx) => {
        const rows = await tx.select().from(entities).where(and(eq(entities.id, input.entityId), eq(entities.workspaceId, input.workspaceId))).limit(1).for("update");
        const previous = rows[0];
        if (!previous) throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found in this workspace." });
        if (previous.displayName === next.displayName && previous.description === next.description && previous.sourceIdentity === next.sourceIdentity && previous.identityState === next.identityState) return { updated: false };
        await tx.update(entities).set(next).where(and(eq(entities.id, input.entityId), eq(entities.workspaceId, input.workspaceId)));
        await tx.insert(operationalEvents).values({ workspaceId: input.workspaceId, eventType: "entity.corrected", recordType: "entity", recordId: input.entityId, summary: `Entity record corrected: ${next.displayName}`, observedAt: new Date(), epistemicState: "observed", actorId: ctx.user.id });
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "entity.corrected", recordType: "entity", recordId: input.entityId, details: JSON.stringify({ before: { displayName: previous.displayName, description: previous.description, sourceIdentity: previous.sourceIdentity, identityState: previous.identityState }, after: next }) });
        return { updated: true };
      });
    }),
    relationships: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
      return db.select().from(relationships).where(eq(relationships.workspaceId, input.workspaceId)).orderBy(desc(relationships.createdAt));
    }),
    addRelationship: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      subjectEntityId: z.number().int().positive(),
      predicate: z.string().trim().min(1).max(100),
      objectEntityId: z.number().int().positive(),
      evidenceId: z.number().int().positive().optional(),
      epistemicState: z.enum(["observed", "inferred", "unresolved"]).default("observed"),
      confidence: z.number().int().min(0).max(100).default(100),
      validFrom: dateField,
      validTo: dateField,
    }).refine(orderedValidity, { message: "Valid-to cannot precede valid-from.", path: ["validTo"] })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      if (input.subjectEntityId === input.objectEntityId) throw new TRPCError({ code: "BAD_REQUEST", message: "An entity cannot be related to itself here." });
      if (input.predicate.trim().toLowerCase() === "possible_identity_match") throw new TRPCError({ code: "BAD_REQUEST", message: "Use the evidence-backed identity-candidate workflow for possible identity matches." });
      await requireEntityInWorkspace(access.db, input.workspaceId, input.subjectEntityId);
      await requireEntityInWorkspace(access.db, input.workspaceId, input.objectEntityId);
      if (input.evidenceId) await requireEvidenceInWorkspace(access.db, input.workspaceId, input.evidenceId);
      return access.db.transaction(async (tx) => {
        const result = await tx.insert(relationships).values({
          workspaceId: input.workspaceId,
          subjectEntityId: input.subjectEntityId,
          predicate: input.predicate,
          objectEntityId: input.objectEntityId,
          evidenceId: input.evidenceId ?? null,
          epistemicState: input.epistemicState,
          confidence: input.confidence,
          validFrom: input.validFrom ?? new Date(),
          validTo: input.validTo ?? null,
          createdBy: ctx.user.id,
        });
        const relationshipId = idOf(result);
        await tx.insert(operationalEvents).values({
          workspaceId: input.workspaceId,
          eventType: "relationship.created",
          recordType: "relationship",
          recordId: relationshipId,
          summary: `Relationship recorded: ${input.predicate}${input.epistemicState === "unresolved" ? " (unresolved)" : ""}`,
          evidenceId: input.evidenceId ?? null,
          observedAt: new Date(),
          epistemicState: input.epistemicState === "inferred" ? "inferred" : "observed",
          actorId: ctx.user.id,
        });
        await tx.insert(auditLog).values({
          workspaceId: input.workspaceId,
          actorId: ctx.user.id,
          operation: "relationship.created",
          recordType: "relationship",
          recordId: relationshipId,
          details: JSON.stringify({ subjectEntityId: input.subjectEntityId, predicate: input.predicate, objectEntityId: input.objectEntityId, epistemicState: input.epistemicState }),
        });
        return { id: relationshipId };
      });
    }),
    addIdentityCandidate: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      subjectEntityId: z.number().int().positive(),
      objectEntityId: z.number().int().positive(),
      evidenceId: z.number().int().positive(),
      confidence: z.number().int().min(0).max(100),
      validFrom: dateField,
      validTo: dateField,
    }).refine(orderedValidity, { message: "Valid-to cannot precede valid-from.", path: ["validTo"] })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      if (input.subjectEntityId === input.objectEntityId) throw new TRPCError({ code: "BAD_REQUEST", message: "An entity cannot be a candidate match to itself." });
      await requireEntityInWorkspace(access.db, input.workspaceId, input.subjectEntityId);
      await requireEntityInWorkspace(access.db, input.workspaceId, input.objectEntityId);
      await requireEvidenceInWorkspace(access.db, input.workspaceId, input.evidenceId);
      const result = await access.db.transaction(async (tx) => {
        const inserted = await tx.insert(relationships).values({ workspaceId: input.workspaceId, subjectEntityId: input.subjectEntityId, predicate: "possible_identity_match", objectEntityId: input.objectEntityId, evidenceId: input.evidenceId, epistemicState: "unresolved", confidence: input.confidence, validFrom: input.validFrom ?? new Date(), validTo: input.validTo ?? null, createdBy: ctx.user.id });
        const relationshipId = idOf(inserted);
        await tx.insert(operationalEvents).values({ workspaceId: input.workspaceId, eventType: "identity.candidate_created", recordType: "relationship", recordId: relationshipId, summary: "Evidence-linked identity candidate recorded; records remain separate.", evidenceId: input.evidenceId, observedAt: new Date(), epistemicState: "observed", actorId: ctx.user.id });
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "identity.candidate_created", recordType: "relationship", recordId: relationshipId, details: JSON.stringify({ subjectEntityId: input.subjectEntityId, objectEntityId: input.objectEntityId, evidenceId: input.evidenceId, confidence: input.confidence }) });
        return relationshipId;
      });
      return { id: result };
    }),
    resolveIdentityCandidate: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), relationshipId: z.number().int().positive(), decision: z.enum(["confirmed", "rejected"]) })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      await access.db.transaction(async (tx) => {
        const rows = await tx.select().from(relationships).where(and(eq(relationships.id, input.relationshipId), eq(relationships.workspaceId, input.workspaceId))).limit(1).for("update");
        const candidate = rows[0];
        if (!candidate || candidate.predicate !== "possible_identity_match") throw new TRPCError({ code: "NOT_FOUND", message: "Identity candidate not found in this workspace." });
        if (candidate.epistemicState !== "unresolved") throw new TRPCError({ code: "CONFLICT", message: "This identity candidate has already been resolved." });
        const nextState = input.decision === "confirmed" ? "observed" : "rejected";
        await tx.update(relationships).set({ epistemicState: nextState }).where(and(eq(relationships.id, input.relationshipId), eq(relationships.workspaceId, input.workspaceId)));
        await tx.insert(operationalEvents).values({ workspaceId: input.workspaceId, eventType: `identity.candidate_${input.decision}`, recordType: "relationship", recordId: input.relationshipId, summary: input.decision === "confirmed" ? "Identity link explicitly confirmed; entity records remain separate." : "Identity candidate explicitly rejected; entity records remain separate.", evidenceId: candidate.evidenceId, observedAt: new Date(), epistemicState: input.decision === "confirmed" ? "confirmed" : "observed", actorId: ctx.user.id });
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: `identity.candidate_${input.decision}`, recordType: "relationship", recordId: input.relationshipId, details: JSON.stringify({ from: "unresolved", to: nextState, evidenceId: candidate.evidenceId, confidence: candidate.confidence, entityIdsRemainSeparate: true }) });
      });
      return { decision: input.decision };
    }),
  }),

  evidence: router({
    list: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
      const [records, assertions] = await Promise.all([
        db.select().from(evidence).where(eq(evidence.workspaceId, input.workspaceId)).orderBy(desc(evidence.recordedAt)).limit(200),
        db.select().from(observations).where(eq(observations.workspaceId, input.workspaceId)).orderBy(desc(observations.recordedAt)).limit(300),
      ]);
      return { records, observations: assertions };
    }),
    create: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      sourceName: z.string().trim().min(1).max(200),
      sourceAuthority: z.enum(["unknown", "reported", "direct", "official"]).default("unknown"),
      sourceRef: z.string().trim().max(240).optional(),
      claim: z.string().trim().min(1).max(5000),
      observedAt: z.coerce.date(),
      validFrom: dateField,
      validTo: dateField,
      entityId: z.number().int().positive().nullable().optional(),
      attributeKey: z.string().trim().min(1).max(120),
      obligationId: z.number().int().positive().nullable().optional(),
      value: z.string().trim().min(1).max(5000),
      epistemicState: epistemicState.default("observed"),
      qualityState: qualityState.default("current"),
      confidence: z.number().int().min(0).max(100).default(100),
      supersedesObservationId: z.number().int().positive().optional(),
      idempotencyKey: z.string().uuid(),
    }).refine(orderedValidity, { message: "Valid-to cannot precede valid-from.", path: ["validTo"] })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      if (input.entityId) await requireEntityInWorkspace(access.db, input.workspaceId, input.entityId);
      if (input.obligationId) {
        const linked = await access.db.select({ id: obligations.id }).from(obligations).where(and(eq(obligations.id, input.obligationId), eq(obligations.workspaceId, input.workspaceId))).limit(1);
        if (!linked[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected obligation is not in this workspace." });
      }
      let supersedesEvidenceId: number | null = null;
      if (input.supersedesObservationId) {
        const previousRows = await access.db
          .select({ id: observations.id, evidenceId: observations.evidenceId, entityId: observations.entityId, attributeKey: observations.attributeKey })
          .from(observations)
          .where(and(eq(observations.id, input.supersedesObservationId), eq(observations.workspaceId, input.workspaceId)))
          .limit(1);
        const previous = previousRows[0];
        if (!previous) throw new TRPCError({ code: "BAD_REQUEST", message: "The observation to correct is not in this workspace." });
        if (previous.entityId !== (input.entityId ?? null) || previous.attributeKey.toLowerCase() !== input.attributeKey.toLowerCase()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A correction must refer to the same entity and attribute." });
        }
        supersedesEvidenceId = previous.evidenceId;
      }
      void supersedesEvidenceId;
      const queued = await enqueueManualObservation(access.db, {
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        correlationId: correlationIdFor(ctx.req),
        idempotencyKey: input.idempotencyKey,
        payload: {
          kind: "manual_observation",
          sourceName: input.sourceName,
          sourceAuthority: input.sourceAuthority,
          sourceRef: input.sourceRef || null,
          claim: input.claim,
          observedAt: input.observedAt.toISOString(),
          validFrom: input.validFrom?.toISOString() ?? null,
          validTo: input.validTo?.toISOString() ?? null,
          entityId: input.entityId ?? null,
          obligationId: input.obligationId ?? null,
          attributeKey: input.attributeKey,
          value: input.value,
          epistemicState: input.epistemicState,
          qualityState: input.qualityState,
          confidence: input.confidence,
          supersedesObservationId: input.supersedesObservationId ?? null,
        },
      });
      if (!queued.duplicate) await drainEventQueue(access.db, `manual-${ctx.user.id}-${queued.eventId}`, 1);
      const latest = await access.db.select({ status: inboundEvents.status }).from(inboundEvents).where(eq(inboundEvents.id, queued.eventId)).limit(1);
      return { eventId: queued.eventId, status: latest[0]?.status ?? queued.status, duplicate: queued.duplicate };
    }),
  }),

  obligations: router({
    list: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
      return db.select().from(obligations).where(eq(obligations.workspaceId, input.workspaceId)).orderBy(asc(obligations.dueAt), desc(obligations.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      title: z.string().trim().min(1).max(220),
      description: z.string().max(5000).optional(),
      ownerEntityId: z.number().int().positive().optional(),
      counterpartyEntityId: z.number().int().positive().optional(),
      dueAt: dateField,
      amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional(),
      currency: z.string().trim().length(3).optional(),
      sourceName: z.string().trim().min(1).max(200),
      sourceAuthority: z.enum(["unknown", "reported", "direct", "official"]).default("unknown"),
      evidenceClaim: z.string().trim().min(1).max(5000),
      observedAt: z.coerce.date(),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      if (input.ownerEntityId) await requireEntityInWorkspace(access.db, input.workspaceId, input.ownerEntityId);
      if (input.counterpartyEntityId) await requireEntityInWorkspace(access.db, input.workspaceId, input.counterpartyEntityId);
      const result = await access.db.transaction(async (tx) => {
        const evidenceResult = await tx.insert(evidence).values({
          workspaceId: input.workspaceId,
          sourceName: input.sourceName,
          sourceType: "manual",
          sourceAuthority: input.sourceAuthority,
          claim: input.evidenceClaim,
          observedAt: input.observedAt,
          epistemicState: "observed",
          qualityState: "current",
          confidence: 100,
          createdBy: ctx.user.id,
        });
        const evidenceId = idOf(evidenceResult);
        const obligationResult = await tx.insert(obligations).values({
          workspaceId: input.workspaceId,
          title: input.title,
          description: input.description || null,
          ownerEntityId: input.ownerEntityId ?? null,
          counterpartyEntityId: input.counterpartyEntityId ?? null,
          dueAt: input.dueAt ?? null,
          amount: input.amount ?? null,
          currency: input.currency?.toUpperCase() ?? null,
          status: "open",
          evidenceId,
          createdBy: ctx.user.id,
        });
        const obligationId = idOf(obligationResult);
        await tx.insert(operationalEvents).values({
          workspaceId: input.workspaceId,
          eventType: "obligation.created",
          recordType: "obligation",
          recordId: obligationId,
          summary: `Obligation recorded: ${input.title}`,
          evidenceId,
          happenedAt: input.observedAt,
          observedAt: input.observedAt,
          epistemicState: "observed",
          actorId: ctx.user.id,
        });
        await tx.insert(auditLog).values({
          workspaceId: input.workspaceId,
          actorId: ctx.user.id,
          operation: "obligation.created",
          recordType: "obligation",
          recordId: obligationId,
          details: JSON.stringify({ evidenceId, dueAt: input.dueAt?.toISOString() ?? null }),
        });
        return { id: obligationId, evidenceId };
      });
      return result;
    }),
    updateStatus: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      obligationId: z.number().int().positive(),
      status: z.enum(["open", "satisfied", "cancelled", "disputed"]),
      completionEvidenceId: z.number().int().positive().optional(),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
      requireWritableWorkspace(access);
      return access.db.transaction(async (tx) => {
        const rows = await tx.select().from(obligations).where(and(eq(obligations.id, input.obligationId), eq(obligations.workspaceId, input.workspaceId))).limit(1).for("update");
        const obligation = rows[0];
        if (!obligation) throw new TRPCError({ code: "NOT_FOUND", message: "Obligation not found in this workspace." });
        if (input.status === "satisfied" && !input.completionEvidenceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Attach evidence before marking an obligation satisfied." });
        if (input.completionEvidenceId) {
          const linked = await tx.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.id, input.completionEvidenceId), eq(evidence.workspaceId, input.workspaceId))).limit(1);
          if (!linked[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected evidence is not in this workspace." });
        }
        const changedAt = new Date();
        await tx.update(obligations).set({ status: input.status, completionEvidenceId: input.status === "satisfied" ? input.completionEvidenceId! : null }).where(and(eq(obligations.id, input.obligationId), eq(obligations.workspaceId, input.workspaceId)));
        await tx.insert(operationalEvents).values({ workspaceId: input.workspaceId, eventType: "obligation.status_changed", recordType: "obligation", recordId: input.obligationId, summary: `Obligation status changed to ${input.status}.`, evidenceId: input.completionEvidenceId ?? obligation.evidenceId, observedAt: changedAt, epistemicState: input.status === "satisfied" ? "confirmed" : "observed", actorId: ctx.user.id });
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "obligation.status_changed", recordType: "obligation", recordId: input.obligationId, details: JSON.stringify({ from: obligation.status, to: input.status, fromCompletionEvidenceId: obligation.completionEvidenceId, toCompletionEvidenceId: input.status === "satisfied" ? input.completionEvidenceId! : null }) });
        return { updated: true };
      });
    }),
  }),

  events: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    return db.select().from(operationalEvents).where(eq(operationalEvents.workspaceId, input.workspaceId)).orderBy(desc(operationalEvents.recordedAt)).limit(100);
  }),

  history: protectedProcedure.input(z.object({
    workspaceId: z.number().int().positive(),
    recordType: z.enum(["entity", "obligation", "relationship"]),
  })).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const records = await db.select().from(auditLog)
      .where(and(eq(auditLog.workspaceId, input.workspaceId), eq(auditLog.recordType, input.recordType)))
      .orderBy(desc(auditLog.createdAt)).limit(300);
    return { records };
  }),
});
