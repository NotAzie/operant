import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  actionEvents,
  actions,
  auditLog,
  entities,
  evidence,
  objectives,
  observations,
  operationalEvents,
  obligations,
  workspacePolicies,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { requireManager, requireWorkspaceAccess, requireWritableWorkspace } from "./operantAccess";
import { findActiveConflicts, isStaleAt } from "./operantDomain";
import { classifyDueDate } from "../shared/dateRules";

const workspaceInput = z.object({ workspaceId: z.number().int().positive() });

type AttentionItem = {
  id: string;
  kind: "obligation" | "evidence" | "conflict" | "action";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  recordId: number;
};

export const operantInsightRouter = router({
  summary: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const [policyRows, obligationRows, evidenceRows, observationRows, actionRows, eventRows, actionEventRows] = await Promise.all([
      db.select().from(workspacePolicies).where(eq(workspacePolicies.workspaceId, input.workspaceId)),
      db.select().from(obligations).where(eq(obligations.workspaceId, input.workspaceId)).orderBy(asc(obligations.dueAt)).limit(300),
      db.select().from(evidence).where(eq(evidence.workspaceId, input.workspaceId)).orderBy(desc(evidence.recordedAt)).limit(300),
      db.select().from(observations).where(eq(observations.workspaceId, input.workspaceId)).orderBy(desc(observations.recordedAt)).limit(600),
      db.select().from(actions).where(eq(actions.workspaceId, input.workspaceId)).orderBy(desc(actions.createdAt)).limit(200),
      db.select().from(operationalEvents).where(eq(operationalEvents.workspaceId, input.workspaceId)).orderBy(desc(operationalEvents.recordedAt)).limit(12),
      db.select().from(actionEvents).where(eq(actionEvents.workspaceId, input.workspaceId)).orderBy(desc(actionEvents.createdAt)).limit(12),
    ]);
    const dueSoonDays = policyRows.find((row) => row.key === "due_soon_days")?.value ?? 7;
    const staleAfterDays = policyRows.find((row) => row.key === "stale_after_days")?.value ?? 30;
    const now = new Date();
    const attention: AttentionItem[] = [];

    for (const obligation of obligationRows) {
      const dueState = classifyDueDate(obligation.dueAt, obligation.status, dueSoonDays, now);
      if (dueState === "overdue") {
        attention.push({ id: `obligation-${obligation.id}`, kind: "obligation", severity: "high", title: `Overdue: ${obligation.title}`, detail: `Due ${obligation.dueAt!.toLocaleDateString(undefined, { timeZone: "UTC" })}; rule: open obligation's UTC due date has passed.`, recordId: obligation.id });
      } else if (dueState === "due_soon") {
        attention.push({ id: `obligation-${obligation.id}`, kind: "obligation", severity: "medium", title: `Due soon: ${obligation.title}`, detail: `Due ${obligation.dueAt!.toLocaleDateString(undefined, { timeZone: "UTC" })}; rule: open obligation falls on one of the next ${dueSoonDays} UTC calendar dates, counting today as day one.`, recordId: obligation.id });
      }
    }

    const conflicts = findActiveConflicts(observationRows.map((row) => ({
      id: row.id,
      entityId: row.entityId,
      attributeKey: row.attributeKey,
      value: row.value,
      supersedesObservationId: row.supersedesObservationId,
    })));
    for (const conflict of conflicts) {
      const latest = conflict.observations[0];
      if (!latest) continue;
      const values = [...new Set(conflict.observations.map((item) => item.value))].slice(0, 3);
      attention.push({
        id: `conflict-${latest.id}`,
        kind: "conflict",
        severity: "high",
        title: `Conflicting values: ${conflict.attributeKey}`,
        detail: `These active observations disagree: ${values.join(" / ")}. Evidence remains available; no value was silently selected.`,
        recordId: latest.id,
      });
    }

    for (const item of evidenceRows) {
      const stale = item.qualityState === "stale" || isStaleAt(item.observedAt, staleAfterDays, now);
      if (stale) {
        attention.push({
          id: `stale-${item.id}`,
          kind: "evidence",
          severity: "medium",
          title: `Possibly outdated: ${item.sourceName}`,
          detail: `Observed ${item.observedAt.toLocaleDateString()}; rule: information older than ${staleAfterDays} days may be stale.`,
          recordId: item.id,
        });
      } else if (["unknown", "uncertain", "incomplete", "unavailable", "unresolved"].includes(item.qualityState)) {
        attention.push({
          id: `quality-${item.id}`,
          kind: "evidence",
          severity: item.qualityState === "unresolved" || item.qualityState === "unavailable" ? "high" : "low",
          title: `${item.qualityState[0]?.toUpperCase()}${item.qualityState.slice(1)} evidence: ${item.sourceName}`,
          detail: item.claim,
          recordId: item.id,
        });
      }
    }

    for (const action of actionRows) {
      if (action.status === "proposed") {
        attention.push({ id: `action-${action.id}`, kind: "action", severity: "medium", title: `Approval needed: ${action.title}`, detail: "This is a proposal only; no action has been executed.", recordId: action.id });
      } else if (action.status === "unknown") {
        attention.push({ id: `action-${action.id}`, kind: "action", severity: "high", title: `Outcome unknown: ${action.title}`, detail: action.outcome || "The outcome has not been independently verified. Reconcile before retrying.", recordId: action.id });
      }
    }

    const openObligations = obligationRows.filter((row) => row.status === "open").length;
    const unreviewedActions = actionRows.filter((row) => row.status === "proposed").length;
    const staleEvidence = evidenceRows.filter((row) => row.qualityState === "stale" || isStaleAt(row.observedAt, staleAfterDays, now)).length;
    const unresolvedConflicts = conflicts.length;
    const severityRank = { high: 0, medium: 1, low: 2 };
    attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
    const actionById = new Map(actionRows.map((action) => [action.id, action]));
    const recentEvents = [
      ...eventRows.map((event) => ({ id: `event-${event.id}`, summary: event.summary, eventType: event.eventType, recordedAt: event.recordedAt, epistemicState: event.epistemicState })),
      ...actionEventRows.map((event) => ({ id: `action-${event.id}`, summary: `${actionById.get(event.actionId)?.title ?? `Action #${event.actionId}`} · ${event.toState}`, eventType: `action.${event.toState}`, recordedAt: event.createdAt, epistemicState: event.toState })),
    ].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 12);

    return {
      policies: { dueSoonDays, staleAfterDays },
      counts: {
        entities: (await db.select({ id: entities.id }).from(entities).where(eq(entities.workspaceId, input.workspaceId))).length,
        openObligations,
        evidence: evidenceRows.length,
        staleEvidence,
        unresolvedConflicts,
        unreviewedActions,
        unknownActions: actionRows.filter((row) => row.status === "unknown").length,
      },
      attention,
      recentEvents,
      generatedAt: now,
    };
  }),

  settings: router({
    get: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
      const [policies, workspaceObjectives] = await Promise.all([
        access.db.select().from(workspacePolicies).where(eq(workspacePolicies.workspaceId, input.workspaceId)).orderBy(asc(workspacePolicies.key)),
        access.db.select().from(objectives).where(eq(objectives.workspaceId, input.workspaceId)).orderBy(desc(objectives.createdAt)),
      ]);
      return { role: access.role, isIllustrative: access.isIllustrative, policies, objectives: workspaceObjectives };
    }),
    setPolicy: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      key: z.enum(["due_soon_days", "stale_after_days"]),
      value: z.number().int().min(1).max(3650),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
      requireManager(access);
      requireWritableWorkspace(access);
      if (input.key === "due_soon_days" && input.value > 90) throw new TRPCError({ code: "BAD_REQUEST", message: "Due-soon threshold must be 90 days or fewer." });
      const existing = await access.db.select({ id: workspacePolicies.id }).from(workspacePolicies)
        .where(and(eq(workspacePolicies.workspaceId, input.workspaceId), eq(workspacePolicies.key, input.key))).limit(1);
      if (existing[0]) {
        await access.db.update(workspacePolicies).set({ value: input.value, updatedBy: ctx.user.id }).where(eq(workspacePolicies.id, existing[0].id));
      } else {
        await access.db.insert(workspacePolicies).values({ workspaceId: input.workspaceId, key: input.key, value: input.value, updatedBy: ctx.user.id });
      }
      await access.db.insert(auditLog).values({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        operation: "policy.updated",
        recordType: "workspace_policy",
        recordId: existing[0]?.id ?? null,
        details: JSON.stringify({ key: input.key, value: input.value }),
      });
      return { saved: true };
    }),
    addObjective: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(),
      title: z.string().trim().min(1).max(180),
      description: z.string().max(2000).optional(),
      priority: z.enum(["required", "preference"]).default("preference"),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
      requireManager(access);
      requireWritableWorkspace(access);
      const result = await access.db.insert(objectives).values({ workspaceId: input.workspaceId, title: input.title, description: input.description || null, priority: input.priority, createdBy: ctx.user.id });
      const objectiveId = Number(result[0]?.insertId ?? 0);
      return { id: objectiveId };
    }),
    removeObjective: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), objectiveId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
      requireManager(access);
      requireWritableWorkspace(access);
      await access.db.update(objectives).set({ active: false }).where(and(eq(objectives.id, input.objectiveId), eq(objectives.workspaceId, input.workspaceId)));
      return { archived: true };
    }),
  }),
});
