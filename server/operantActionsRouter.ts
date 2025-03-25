import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { actionEvaluations, actionEvents, actions, auditLog, entities, evidence, followUps, inboundEvents, objectives, observations, obligations, operationalEvents, responsibilityAssignments, workspaceMembers, workspaces, workspacePolicies } from "../drizzle/schema";
import type { ActionDecisionProvenance } from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { requireManager, requireWorkspaceAccess, requireWritableWorkspace, type OperantDb } from "./operantAccess";
import { assessConflictWindow, canAccessRole, canTransitionAction, conflictObservationKey, groupConflictObservations, isStaleAt, uniqueConflictTargets, type ActionState, type MemberRole } from "./operantDomain";
import { classifyDueDate } from "../shared/dateRules";

function idOf(result: { 0?: { insertId?: number | bigint } }): number {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database did not return a new record ID." });
  return id;
}

async function transition(
  db: Pick<OperantDb, "update" | "insert">,
  action: typeof actions.$inferSelect,
  next: ActionState,
  actorId: number,
  note: string,
) {
  const current = action.status as ActionState;
  if (!canTransitionAction(current, next)) {
    throw new TRPCError({ code: "CONFLICT", message: `Action cannot move from ${current} to ${next}.` });
  }
  await db.update(actions).set({ status: next }).where(and(eq(actions.id, action.id), eq(actions.workspaceId, action.workspaceId)));
  await db.insert(actionEvents).values({
    workspaceId: action.workspaceId,
    actionId: action.id,
    fromState: current,
    toState: next,
    actorId,
    note,
  });
}

const workspaceActionInput = z.object({ workspaceId: z.number().int().positive(), actionId: z.number().int().positive() });

export const operantActionsRouter = router({
  list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const [actionRows, followUpRows, historyRows, evaluationRows] = await Promise.all([
      db.select().from(actions).where(eq(actions.workspaceId, input.workspaceId)).orderBy(desc(actions.createdAt)).limit(200),
      db.select().from(followUps).where(eq(followUps.workspaceId, input.workspaceId)).orderBy(desc(followUps.createdAt)).limit(200),
      db.select().from(actionEvents).where(eq(actionEvents.workspaceId, input.workspaceId)).orderBy(desc(actionEvents.createdAt)).limit(500),
      db.select().from(actionEvaluations).where(eq(actionEvaluations.workspaceId, input.workspaceId)).orderBy(desc(actionEvaluations.createdAt)).limit(500),
    ]);
    return { actions: actionRows, followUps: followUpRows, history: historyRows, evaluations: evaluationRows };
  }),

  propose: protectedProcedure.input(z.object({
    workspaceId: z.number().int().positive(),
    title: z.string().trim().min(1).max(220),
    description: z.string().max(5000).optional(),
    obligationId: z.number().int().positive().optional(),
    evidenceId: z.number().int().positive().optional(),
    eventId: z.number().int().positive().optional(),
    objectiveId: z.number().int().positive().optional(),
    dueAt: z.coerce.date().optional(),
  }).refine((input) => Boolean(input.obligationId) !== Boolean(input.eventId), { message: "Link this follow-up to exactly one obligation or operational event.", path: ["obligationId"] })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
    requireWritableWorkspace(access);
    return access.db.transaction(async (tx) => {
      // Lock and revalidate membership/writability; all decision inputs and writes then share one transaction snapshot.
      const actorRows = await tx.select({ role: workspaceMembers.role, isIllustrative: workspaces.isIllustrative })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(and(eq(workspaceMembers.userId, ctx.user.id), eq(workspaceMembers.workspaceId, input.workspaceId)))
        .limit(1)
        .for("update");
      const actor = actorRows[0];
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace." });
      const currentRole = actor.role as MemberRole;
      if (!canAccessRole(currentRole, "editor")) throw new TRPCError({ code: "FORBIDDEN", message: "Your workspace role does not allow this operation." });
      requireWritableWorkspace({ ...access, role: currentRole, isIllustrative: actor.isIllustrative });
      let linkedObligation: { id: number; title: string; dueAt: Date | null; evidenceId: number | null; ownerEntityId: number | null; status: typeof obligations.$inferSelect.status } | undefined;
      if (input.obligationId) {
        const linked = await tx.select({ id: obligations.id, title: obligations.title, dueAt: obligations.dueAt, evidenceId: obligations.evidenceId, ownerEntityId: obligations.ownerEntityId, status: obligations.status }).from(obligations)
          .where(and(eq(obligations.id, input.obligationId), eq(obligations.workspaceId, input.workspaceId))).limit(1);
        if (!linked[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected obligation is not in this workspace." });
        linkedObligation = linked[0];
      }
      let linkedEvent: { id: number; summary: string; evidenceId: number | null; recordType: string | null; recordId: number | null } | undefined;
      if (input.eventId) {
        const linked = await tx.select({ id: operationalEvents.id, summary: operationalEvents.summary, evidenceId: operationalEvents.evidenceId, recordType: operationalEvents.recordType, recordId: operationalEvents.recordId }).from(operationalEvents)
          .where(and(eq(operationalEvents.id, input.eventId), eq(operationalEvents.workspaceId, input.workspaceId))).limit(1);
        if (!linked[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected event is not in this workspace." });
        linkedEvent = linked[0];
      }
      const capturedAt = new Date();

      let objective: { id: number; title: string; priority: "required" | "preference" } | null = null;
      if (input.objectiveId) {
        const objectiveRows = await tx.select({ id: objectives.id, title: objectives.title, priority: objectives.priority }).from(objectives)
          .where(and(eq(objectives.id, input.objectiveId), eq(objectives.workspaceId, input.workspaceId), eq(objectives.active, true))).limit(1);
        if (!objectiveRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected objective is not active in this workspace." });
        objective = objectiveRows[0];
      }

      const target = linkedObligation
        ? { kind: "obligation" as const, id: linkedObligation.id, label: linkedObligation.title }
        : { kind: "event" as const, id: linkedEvent!.id, label: linkedEvent!.summary };
      const effectiveEvidenceId = input.evidenceId ?? linkedObligation?.evidenceId ?? linkedEvent?.evidenceId ?? null;
      const [evidenceRows, policyRows] = await Promise.all([
        effectiveEvidenceId
          ? tx.select().from(evidence).where(and(eq(evidence.id, effectiveEvidenceId), eq(evidence.workspaceId, input.workspaceId))).limit(1)
          : Promise.resolve([]),
        tx.select().from(workspacePolicies).where(eq(workspacePolicies.workspaceId, input.workspaceId)),
      ]);
      const linkedEvidence = evidenceRows[0];
      if (effectiveEvidenceId && !linkedEvidence) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected evidence is not in this workspace." });
      const dueSoonDays = policyRows.find((row) => row.key === "due_soon_days")?.value ?? 7;
      const staleAfterDays = policyRows.find((row) => row.key === "stale_after_days")?.value ?? 30;
      const eventEntityId = linkedEvent?.recordType === "entity" ? Number(linkedEvent.recordId) : Number.NaN;
      const candidateResponsibilityEntityId = linkedObligation?.ownerEntityId ?? (Number.isSafeInteger(eventEntityId) && eventEntityId > 0 ? eventEntityId : null);
      let responsibilitySubjectEntityId: number | null = null;
      if (candidateResponsibilityEntityId !== null) {
        const subjectRows = await tx.select({ id: entities.id }).from(entities)
          .where(and(eq(entities.id, candidateResponsibilityEntityId), eq(entities.workspaceId, input.workspaceId))).limit(1);
        if (!subjectRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The linked responsibility subject is not in this workspace." });
        responsibilitySubjectEntityId = candidateResponsibilityEntityId;
      }
      const assignmentRows = responsibilitySubjectEntityId === null ? [] : await tx.select({
        id: responsibilityAssignments.id,
        responsibleUserId: responsibilityAssignments.responsibleUserId,
        responsibleEntityId: responsibilityAssignments.responsibleEntityId,
        responsibilityType: responsibilityAssignments.responsibilityType,
        status: responsibilityAssignments.status,
        validFrom: responsibilityAssignments.validFrom,
        validTo: responsibilityAssignments.validTo,
        evidenceId: responsibilityAssignments.evidenceId,
      }).from(responsibilityAssignments).where(and(
        eq(responsibilityAssignments.workspaceId, input.workspaceId),
        eq(responsibilityAssignments.subjectEntityId, responsibilitySubjectEntityId),
        or(eq(responsibilityAssignments.status, "active"), eq(responsibilityAssignments.status, "delegated")),
        lte(responsibilityAssignments.validFrom, capturedAt),
        or(isNull(responsibilityAssignments.validTo), gt(responsibilityAssignments.validTo, capturedAt)),
      )).orderBy(desc(responsibilityAssignments.recordedAt)).limit(26);
      const responsibilitySnapshot = {
        subjectEntityId: responsibilitySubjectEntityId,
        assignments: assignmentRows.slice(0, 25).map((assignment) => ({
          id: assignment.id,
          responsibleUserId: assignment.responsibleUserId,
          responsibleEntityId: assignment.responsibleEntityId,
          responsibilityType: assignment.responsibilityType,
          status: assignment.status,
          validFrom: assignment.validFrom.toISOString(),
          validTo: assignment.validTo?.toISOString() ?? null,
          evidenceId: assignment.evidenceId,
        })),
        truncated: assignmentRows.length > 25,
      };
      const dueRuleState = linkedObligation
        ? classifyDueDate(linkedObligation.dueAt, linkedObligation.status, dueSoonDays, capturedAt)
        : "not_applicable";
      const evidenceFreshness = linkedEvidence
        ? isStaleAt(linkedEvidence.observedAt, staleAfterDays, capturedAt) ? "stale" : "current"
        : "not_applicable";
      const linkedObservations = linkedEvidence
        ? await tx.select({ id: observations.id, entityId: observations.entityId, attributeKey: observations.attributeKey, value: observations.value, supersedesObservationId: observations.supersedesObservationId, recordedAt: observations.recordedAt, validFrom: observations.validFrom, validTo: observations.validTo, sourceType: evidence.sourceType, sourceProvider: inboundEvents.provider, sourceConnectionId: inboundEvents.connectionId })
          .from(observations).innerJoin(evidence, and(eq(observations.evidenceId, evidence.id), eq(observations.workspaceId, evidence.workspaceId))).leftJoin(inboundEvents, and(eq(observations.sourceEventId, inboundEvents.id), eq(observations.workspaceId, inboundEvents.workspaceId))).where(and(eq(observations.workspaceId, input.workspaceId), eq(observations.evidenceId, linkedEvidence.id))).limit(31)
        : [];
      if (linkedObservations.length > 30) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No action proposal was created because linked evidence has more associated assertions than the current conflict evaluator can safely inspect. Complete, paginated conflict review is required." });
      const conflictTargets = uniqueConflictTargets(linkedObservations);
      const conflictBudgetPerTarget = 300;
      let evaluatedEvidenceConflict = false;
      if (conflictTargets.length > 0) {
        const targetFilter = or(...conflictTargets.map((target) => and(
          target.entityId === null ? isNull(observations.entityId) : eq(observations.entityId, target.entityId),
          sql`lower(trim(${observations.attributeKey})) = ${target.attributeKey}`,
        )));
        const maximumBatchRows = conflictTargets.length * conflictBudgetPerTarget;
        const comparableRows = await tx.select({ id: observations.id, entityId: observations.entityId, attributeKey: observations.attributeKey, value: observations.value, supersedesObservationId: observations.supersedesObservationId, recordedAt: observations.recordedAt, validFrom: observations.validFrom, validTo: observations.validTo, sourceType: evidence.sourceType, sourceProvider: inboundEvents.provider, sourceConnectionId: inboundEvents.connectionId })
          .from(observations).innerJoin(evidence, and(eq(observations.evidenceId, evidence.id), eq(observations.workspaceId, evidence.workspaceId))).leftJoin(inboundEvents, and(eq(observations.sourceEventId, inboundEvents.id), eq(observations.workspaceId, inboundEvents.workspaceId))).where(and(eq(observations.workspaceId, input.workspaceId), targetFilter)).limit(maximumBatchRows + 1);
        if (comparableRows.length > maximumBatchRows) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No action proposal was created because the relevant temporal conflict scan exceeded its safe row budget. Complete, paginated conflict review is required; the system will not label a partial scan as clear." });
        const rowsByTarget = groupConflictObservations(comparableRows);
        const conflictingTargets = new Set<string>();
        for (const target of conflictTargets) {
          const key = conflictObservationKey(target);
          const assessment = assessConflictWindow(rowsByTarget.get(key) ?? [], conflictBudgetPerTarget, capturedAt);
          if (assessment.status === "incomplete") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No action proposal was created because the relevant temporal conflict scan exceeded its safe row budget. Complete, paginated conflict review is required; the system will not label a partial scan as clear." });
          if (assessment.conflicts.some((group) => group.entityId === target.entityId && group.attributeKey.trim().toLowerCase() === target.attributeKey)) conflictingTargets.add(key);
        }
        evaluatedEvidenceConflict = conflictTargets.some((target) => conflictingTargets.has(conflictObservationKey(target)));
      }
      const evidenceConflictResult = linkedObservations.length === 0 ? "not_applicable" : evaluatedEvidenceConflict ? "conflicting" : "clear";
      const decisionProvenance: ActionDecisionProvenance = {
        version: 1,
        capturedAt: capturedAt.toISOString(),
        basis: "manual",
        target,
        objective,
        policySnapshot: { dueSoonDays, staleAfterDays },
        rules: [
          { id: "obligation_due_date", result: dueRuleState, reason: linkedObligation?.dueAt ? `Linked obligation due date classified as ${dueRuleState} under the ${dueSoonDays}-day UTC-calendar policy.` : "No open linked obligation with a due date; this manual proposal was not generated by a due-date rule." },
          { id: "evidence_freshness", result: evidenceFreshness, reason: linkedEvidence ? `Observed ${linkedEvidence.observedAt.toISOString()}; age threshold is ${staleAfterDays} days and computed freshness is ${evidenceFreshness}.` : "No supporting evidence was linked, so evidence freshness was not evaluated." },
          { id: "evidence_quality", result: linkedEvidence?.qualityState ?? "not_applicable", reason: linkedEvidence ? `Source quality was recorded as ${linkedEvidence.qualityState}; this does not independently verify the source.` : "No supporting evidence was linked, so source quality was not evaluated." },
          { id: "evidence_conflicts", result: evidenceConflictResult, reason: linkedObservations.length ? evaluatedEvidenceConflict ? "A current conflicting value exists for a linked evidence observation; no value was silently selected." : "No active conflict was found for the linked evidence observations at proposal time." : "The linked evidence has no associated observation for conflict evaluation." },
        ],
        evidence: linkedEvidence ? {
          id: linkedEvidence.id,
          sourceName: linkedEvidence.sourceName,
          sourceType: linkedEvidence.sourceType,
          sourceAuthority: linkedEvidence.sourceAuthority,
          epistemicState: linkedEvidence.epistemicState,
          qualityState: linkedEvidence.qualityState,
          confidence: linkedEvidence.confidence,
          observedAt: linkedEvidence.observedAt.toISOString(),
          recordedAt: linkedEvidence.recordedAt.toISOString(),
          validFrom: linkedEvidence.validFrom?.toISOString() ?? null,
          validTo: linkedEvidence.validTo?.toISOString() ?? null,
          ageDaysAtCapture: Math.max(0, Math.floor((capturedAt.getTime() - linkedEvidence.observedAt.getTime()) / (24 * 60 * 60 * 1000))),
        } : null,
        selectedAction: { type: "internal_follow_up", title: input.title, dueAt: input.dueAt?.toISOString() ?? null },
      };

      const result = await tx.insert(actions).values({
        workspaceId: input.workspaceId,
        actionType: "internal_follow_up",
        title: input.title,
        description: input.description || null,
        obligationId: input.obligationId ?? null,
        eventId: input.eventId ?? null,
        evidenceId: effectiveEvidenceId,
        objectiveId: objective?.id ?? null,
        decisionProvenance,
        dueAt: input.dueAt ?? null,
        status: "proposed",
        proposedBy: ctx.user.id,
      });
      const id = idOf(result);
      await tx.insert(actionEvaluations).values({
        workspaceId: input.workspaceId,
        actionId: id,
        actorId: ctx.user.id,
        actorRole: currentRole,
        scopeSnapshot: { workspaceId: input.workspaceId, target, obligationId: input.obligationId ?? null, eventId: input.eventId ?? null, evidenceId: effectiveEvidenceId, objectiveId: objective?.id ?? null, responsibility: responsibilitySnapshot },
        riskLevel: "low",
        requiredRole: "admin",
        approvalRequired: true,
        policySnapshot: { ...decisionProvenance.policySnapshot, objective: decisionProvenance.objective, rules: decisionProvenance.rules },
        rationale: "Manual internal follow-up proposal. It is not executed automatically; owner/admin authorization is required before a separate, in-workspace record is created.",
      });
      await tx.insert(actionEvents).values({ workspaceId: input.workspaceId, actionId: id, fromState: null, toState: "proposed", actorId: ctx.user.id, note: "Manual proposal for an internal follow-up; related policy and rule context was snapshotted. Nothing has been executed." });
      await tx.insert(auditLog).values({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        operation: "action.proposed",
        recordType: "action",
        recordId: id,
        details: JSON.stringify({ actionType: "internal_follow_up", proposalBasis: "manual", obligationId: input.obligationId ?? null, eventId: input.eventId ?? null, evidenceId: effectiveEvidenceId, objectiveId: objective?.id ?? null, decisionProvenance, dueAt: input.dueAt?.toISOString() ?? null }),
      });
      return { id };
    });
  }),

  authorize: protectedProcedure.input(workspaceActionInput).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    await access.db.transaction(async (tx) => {
      const rows = await tx.select().from(actions).where(and(eq(actions.id, input.actionId), eq(actions.workspaceId, input.workspaceId))).limit(1).for("update");
      const action = rows[0];
      if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Action not found in this workspace." });
      if (action.actionType !== "internal_follow_up") throw new TRPCError({ code: "FORBIDDEN", message: "External actions must use their provider-specific exact-payload approval and verification workflow." });
      if (!canTransitionAction(action.status as ActionState, "authorized")) throw new TRPCError({ code: "CONFLICT", message: "Only a proposed action can be authorized." });
      await tx.update(actions).set({ authorizedBy: ctx.user.id }).where(and(eq(actions.id, action.id), eq(actions.workspaceId, input.workspaceId)));
      await transition(tx, action, "authorized", ctx.user.id, "Authorization recorded; execution is still a separate step.");
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.authorized", recordType: "action", recordId: action.id, details: JSON.stringify({ proposedBy: action.proposedBy }) });
    });
    return { authorized: true };
  }),

  reject: protectedProcedure.input(z.object({ ...workspaceActionInput.shape, reason: z.string().trim().min(3).max(1000) })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    await access.db.transaction(async (tx) => {
      const rows = await tx.select().from(actions).where(and(eq(actions.id, input.actionId), eq(actions.workspaceId, input.workspaceId))).limit(1).for("update");
      const action = rows[0];
      if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Action not found in this workspace." });
      if (action.actionType !== "internal_follow_up") throw new TRPCError({ code: "FORBIDDEN", message: "External actions must use their provider-specific review workflow." });
      await transition(tx, action, "rejected", ctx.user.id, input.reason);
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.rejected", recordType: "action", recordId: action.id, details: JSON.stringify({ reason: input.reason }) });
    });
    return { rejected: true };
  }),

  execute: protectedProcedure.input(z.object({ ...workspaceActionInput.shape, dueAt: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    try {
      return await access.db.transaction(async (tx) => {
        const rows = await tx.select().from(actions).where(and(eq(actions.id, input.actionId), eq(actions.workspaceId, input.workspaceId))).limit(1).for("update");
        const action = rows[0];
        if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Action not found in this workspace." });
        if (action.actionType !== "internal_follow_up") throw new TRPCError({ code: "FORBIDDEN", message: "External actions cannot use internal follow-up execution." });
        const existingFollowUps = await tx.select().from(followUps).where(and(eq(followUps.workspaceId, input.workspaceId), eq(followUps.actionId, action.id))).limit(1);
        if (action.status === "confirmed" && existingFollowUps[0]) return { confirmed: true, followUpId: existingFollowUps[0].id, alreadyExecuted: true };
        if (action.status !== "authorized") throw new TRPCError({ code: "CONFLICT", message: "Only an authorized action can be executed. An unknown outcome must be reconciled, not retried." });

        await transition(tx, action, "submitted", ctx.user.id, "Authorized internal follow-up submitted to the workspace record store.");
        const submitted = { ...action, status: "submitted" as const };
        await transition(tx, submitted, "executing", ctx.user.id, "Creating the internal follow-up record.");
        const executing = { ...action, status: "executing" as const };
        const followUpId = existingFollowUps[0]?.id ?? idOf(await tx.insert(followUps).values({
          workspaceId: input.workspaceId,
          actionId: action.id,
          title: action.title,
          description: action.description,
          dueAt: input.dueAt ?? action.dueAt ?? null,
          status: "open",
          createdBy: ctx.user.id,
        }));
        const verified = await tx.select({ id: followUps.id }).from(followUps)
          .where(and(eq(followUps.id, followUpId), eq(followUps.actionId, action.id), eq(followUps.workspaceId, input.workspaceId))).limit(1);
        if (!verified[0]) throw new Error("Follow-up record was not found after creation.");

        await transition(tx, executing, "confirmed", ctx.user.id, `Verified persisted internal follow-up record ${followUpId}.`);
        await tx.update(actions).set({ outcome: `Internal follow-up record ${followUpId} was persisted and verified.` }).where(and(eq(actions.id, action.id), eq(actions.workspaceId, input.workspaceId)));
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.confirmed", recordType: "action", recordId: action.id, details: JSON.stringify({ followUpId, verified: true }) });
        return { confirmed: true, followUpId, alreadyExecuted: false };
      });
    } catch (error) {
      if (error instanceof TRPCError && (error.code === "CONFLICT" || error.code === "NOT_FOUND")) throw error;
      try {
        const currentRows = await access.db.select().from(actions).where(and(eq(actions.id, input.actionId), eq(actions.workspaceId, input.workspaceId))).limit(1);
        const current = currentRows[0];
        if (current?.status === "confirmed") {
          const persisted = await access.db.select({ id: followUps.id }).from(followUps).where(and(eq(followUps.workspaceId, input.workspaceId), eq(followUps.actionId, current.id))).limit(1);
          if (persisted[0]) return { confirmed: true, followUpId: persisted[0].id, alreadyExecuted: true };
        }
        if (current && canTransitionAction(current.status as ActionState, "unknown")) {
          await access.db.transaction(async (tx) => {
            const locked = await tx.select().from(actions).where(and(eq(actions.id, current.id), eq(actions.workspaceId, input.workspaceId))).limit(1).for("update");
            const latest = locked[0];
            if (latest && canTransitionAction(latest.status as ActionState, "unknown")) {
              await transition(tx, latest, "unknown", ctx.user.id, "The internal operation did not return a verifiable result. No success is claimed.");
              await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.outcome_unknown", recordType: "action", recordId: latest.id, details: "Follow-up persistence could not be verified; reconcile before retrying." });
            }
          });
        }
      } catch (recordingError) {
        console.error(JSON.stringify({ level: "error", component: "internal-action", operation: "record_unknown_outcome", actionId: input.actionId, errorClass: recordingError instanceof Error ? recordingError.name : "unknown" }));
      }
      console.error(JSON.stringify({ level: "error", component: "internal-action", operation: "execute_unconfirmed", actionId: input.actionId, errorClass: error instanceof Error ? error.name : "unknown" }));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The result could not be confirmed. Review the action state before taking another step." });
    }
  }),

  recordUnknown: protectedProcedure.input(z.object({ ...workspaceActionInput.shape, reason: z.string().trim().min(3).max(1000) })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    await access.db.transaction(async (tx) => {
      const rows = await tx.select().from(actions).where(and(eq(actions.id, input.actionId), eq(actions.workspaceId, input.workspaceId))).limit(1).for("update");
      const action = rows[0];
      if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Action not found in this workspace." });
      if (action.actionType !== "internal_follow_up") throw new TRPCError({ code: "FORBIDDEN", message: "Use the provider-specific reconciliation procedure for an external action." });
      await transition(tx, action, "unknown", ctx.user.id, input.reason);
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.outcome_unknown", recordType: "action", recordId: action.id, details: JSON.stringify({ reason: input.reason }) });
    });
    return { unknown: true };
  }),

  reconcileUnknown: protectedProcedure.input(workspaceActionInput).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    return access.db.transaction(async (tx) => {
      const rows = await tx.select().from(actions).where(and(eq(actions.id, input.actionId), eq(actions.workspaceId, input.workspaceId))).limit(1).for("update");
      const action = rows[0];
      if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Action not found in this workspace." });
      if (action.actionType !== "internal_follow_up") throw new TRPCError({ code: "FORBIDDEN", message: "Use the provider-specific reconciliation procedure for an external action." });
      if (action.status !== "unknown") return { resolved: action.status === "confirmed", status: action.status };
      const persisted = await tx.select().from(followUps).where(and(eq(followUps.actionId, action.id), eq(followUps.workspaceId, input.workspaceId))).limit(1);
      if (!persisted[0]) return { resolved: false, status: "unknown" as const, reason: "No persisted follow-up was found. The outcome remains unknown; no retry was made." };
      await transition(tx, action, "confirmed", ctx.user.id, `Reconciled against persisted follow-up record ${persisted[0].id}.`);
      await tx.update(actions).set({ outcome: `Reconciled: internal follow-up record ${persisted[0].id} exists.` }).where(and(eq(actions.id, action.id), eq(actions.workspaceId, input.workspaceId)));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.reconciled", recordType: "action", recordId: action.id, details: JSON.stringify({ followUpId: persisted[0].id }) });
      return { resolved: true, status: "confirmed" as const, followUpId: persisted[0].id };
    });
  }),

  completeFollowUp: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), followUpId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
    requireWritableWorkspace(access);
    return access.db.transaction(async (tx) => {
      const rows = await tx.select().from(followUps).where(and(eq(followUps.id, input.followUpId), eq(followUps.workspaceId, input.workspaceId))).limit(1).for("update");
      const followUp = rows[0];
      if (!followUp) throw new TRPCError({ code: "NOT_FOUND", message: "Follow-up not found in this workspace." });
      if (followUp.status === "completed") return { completed: true, alreadyComplete: true };
      const completedAt = new Date();
      await tx.update(followUps).set({ status: "completed", completedAt, completedBy: ctx.user.id }).where(and(eq(followUps.id, followUp.id), eq(followUps.workspaceId, input.workspaceId)));
      await tx.insert(operationalEvents).values({ workspaceId: input.workspaceId, eventType: "follow_up.completed", recordType: "follow_up", recordId: followUp.id, summary: `User marked internal follow-up complete: ${followUp.title}`, observedAt: completedAt, epistemicState: "observed", actorId: ctx.user.id });
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "follow_up.completed", recordType: "follow_up", recordId: followUp.id, details: "User marked the internal follow-up complete; this is a user-reported completion." });
      return { completed: true, alreadyComplete: false };
    });
  }),
});
