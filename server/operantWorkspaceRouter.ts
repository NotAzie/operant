import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  actionEvents,
  actions,
  auditLog,
  entities,
  evidence,
  observations,
  operationalEvents,
  obligations,
  relationships,
  users,
  workspaceMembers,
  workspacePolicies,
  workspaces,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { requireManager, requireWorkspaceAccess } from "./operantAccess";

function idOf(result: { 0?: { insertId?: number | bigint } }): number {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database did not return a new record ID." });
  return id;
}

export const operantWorkspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Operational storage is unavailable." });
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        kind: workspaces.kind,
        isIllustrative: workspaces.isIllustrative,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, ctx.user.id))
      .orderBy(asc(workspaces.createdAt));
    return rows;
  }),

  initialize: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Operational storage is unavailable." });
    const workspaceId = await db.transaction(async (tx) => {
      const lockedUser = await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update");
      if (!lockedUser[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Authenticated workspace owner was not found." });
      const existing = await tx.select({ id: workspaces.id }).from(workspaces)
        .where(and(eq(workspaces.createdBy, ctx.user.id), eq(workspaces.kind, "personal"), eq(workspaces.isIllustrative, false))).limit(1);
      if (existing[0]) return existing[0].id;
      const created = await tx.insert(workspaces).values({
        name: `${(ctx.user.name || "My").trim().split(/\s+/)[0]} workspace`,
        kind: "personal",
        isIllustrative: false,
        createdBy: ctx.user.id,
      });
      const newWorkspaceId = idOf(created);
      await tx.insert(workspaceMembers).values({ workspaceId: newWorkspaceId, userId: ctx.user.id, role: "owner" });
      await tx.insert(workspacePolicies).values([
        { workspaceId: newWorkspaceId, key: "due_soon_days", value: 7, updatedBy: ctx.user.id },
        { workspaceId: newWorkspaceId, key: "stale_after_days", value: 30, updatedBy: ctx.user.id },
      ]);
      await tx.insert(auditLog).values({
        workspaceId: newWorkspaceId,
        actorId: ctx.user.id,
        operation: "workspace.created",
        recordType: "workspace",
        recordId: newWorkspaceId,
        details: "Created the owner's personal workspace.",
      });
      return newWorkspaceId;
    });
    return { workspaceId };
  }),

  createOrganization: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(160) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Operational storage is unavailable." });
      const workspaceId = await db.transaction(async (tx) => {
        const result = await tx.insert(workspaces).values({
          name: input.name,
          kind: "organization",
          isIllustrative: false,
          createdBy: ctx.user.id,
        });
        const newWorkspaceId = idOf(result);
        await tx.insert(workspaceMembers).values({ workspaceId: newWorkspaceId, userId: ctx.user.id, role: "owner" });
        await tx.insert(workspacePolicies).values([
          { workspaceId: newWorkspaceId, key: "due_soon_days", value: 7, updatedBy: ctx.user.id },
          { workspaceId: newWorkspaceId, key: "stale_after_days", value: 30, updatedBy: ctx.user.id },
        ]);
        await tx.insert(auditLog).values({ workspaceId: newWorkspaceId, actorId: ctx.user.id, operation: "workspace.created", recordType: "workspace", recordId: newWorkspaceId, details: "Created an organization workspace." });
        return newWorkspaceId;
      });
      return { workspaceId };
    }),

  createIllustrative: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Operational storage is unavailable." });
    const result = await db.transaction(async (tx) => {
      const lockedUser = await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update");
      if (!lockedUser[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Authenticated workspace owner was not found." });
      const existing = await tx.select({ id: workspaces.id }).from(workspaces)
        .where(and(eq(workspaces.createdBy, ctx.user.id), eq(workspaces.isIllustrative, true))).limit(1);
      if (existing[0]) return { workspaceId: existing[0].id, created: false };
      const created = await tx.insert(workspaces).values({
        name: "Illustrative sample workspace",
        kind: "organization",
        isIllustrative: true,
        createdBy: ctx.user.id,
      });
      const newWorkspaceId = idOf(created);
      await tx.insert(workspaceMembers).values({ workspaceId: newWorkspaceId, userId: ctx.user.id, role: "owner" });
      await tx.insert(workspacePolicies).values([
        { workspaceId: newWorkspaceId, key: "due_soon_days", value: 7, updatedBy: ctx.user.id },
        { workspaceId: newWorkspaceId, key: "stale_after_days", value: 30, updatedBy: ctx.user.id },
      ]);

      const organizationResult = await tx.insert(entities).values({ workspaceId: newWorkspaceId, entityType: "organization", displayName: "Sample · Northline Studio", description: "Illustrative organization; not a real customer.", createdBy: ctx.user.id });
      const accountResult = await tx.insert(entities).values({ workspaceId: newWorkspaceId, entityType: "account", displayName: "Sample · Hosting account", description: "Illustrative account; not connected to a provider.", createdBy: ctx.user.id });
      const siteResult = await tx.insert(entities).values({ workspaceId: newWorkspaceId, entityType: "location", displayName: "Sample · Riverside office", description: "Illustrative location.", createdBy: ctx.user.id });
      const organizationId = idOf(organizationResult);
      const accountId = idOf(accountResult);
      const siteId = idOf(siteResult);
      const observedAt = new Date();
      const renewalEvidenceResult = await tx.insert(evidence).values({
          workspaceId: newWorkspaceId,
          sourceName: "Illustrative sample only",
          sourceType: "sample",
          claim: "An example annual hosting renewal is approaching. No real account is connected.",
          observedAt,
          epistemicState: "observed",
          qualityState: "current",
          confidence: 100,
          createdBy: ctx.user.id,
        });
      const ownerEvidenceResult = await tx.insert(evidence).values({
          workspaceId: newWorkspaceId,
          sourceName: "Illustrative sample only",
          sourceType: "sample",
          claim: "This is an example ownership relationship, provided only to demonstrate the interface.",
          observedAt,
          epistemicState: "observed",
          qualityState: "current",
          confidence: 100,
          createdBy: ctx.user.id,
        });
      const renewalEvidenceId = idOf(renewalEvidenceResult);
      const ownerEvidenceId = idOf(ownerEvidenceResult);
      await tx.insert(observations).values({
        workspaceId: newWorkspaceId,
        entityId: accountId,
        evidenceId: renewalEvidenceId,
        attributeKey: "renewal_note",
        value: "Illustrative renewal approaching; not live data",
        epistemicState: "observed",
        confidence: 100,
        observedAt,
        createdBy: ctx.user.id,
      });
      await tx.insert(relationships).values({
        workspaceId: newWorkspaceId,
        subjectEntityId: organizationId,
        predicate: "operates",
        objectEntityId: siteId,
        evidenceId: ownerEvidenceId,
        epistemicState: "observed",
        confidence: 100,
        validFrom: observedAt,
        createdBy: ctx.user.id,
      });
      const obligationResult = await tx.insert(obligations).values({
        workspaceId: newWorkspaceId,
        title: "Sample · Review annual hosting renewal",
        description: "Illustrative commitment only. No payment or provider operation is available.",
        ownerEntityId: organizationId,
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        amount: "184.00",
        currency: "USD",
        status: "open",
        evidenceId: renewalEvidenceId,
        createdBy: ctx.user.id,
      });
      const obligationId = idOf(obligationResult);
      const actionResult = await tx.insert(actions).values({
        workspaceId: newWorkspaceId,
        actionType: "internal_follow_up",
        title: "Sample · Review renewal details",
        description: "Illustrative proposal; not an executed or external action.",
        obligationId,
        evidenceId: renewalEvidenceId,
        decisionProvenance: {
          version: 1,
          capturedAt: observedAt.toISOString(),
          basis: "illustrative",
          target: { kind: "obligation", id: obligationId, label: "Sample · Review annual hosting renewal" },
          objective: null,
          policySnapshot: { dueSoonDays: 7, staleAfterDays: 30 },
          rules: [
            { id: "obligation_due_date", result: "due_soon", reason: "Illustrative sample due date is inside the example seven-day calendar window." },
            { id: "evidence_freshness", result: "current", reason: "Illustrative sample evidence is marked current only within this isolated example." },
          ],
          evidence: {
            id: renewalEvidenceId,
            sourceName: "Illustrative sample only",
            sourceType: "sample",
            sourceAuthority: "unknown",
            epistemicState: "observed",
            qualityState: "current",
            confidence: 100,
            observedAt: observedAt.toISOString(),
            recordedAt: observedAt.toISOString(),
            validFrom: null,
            validTo: null,
            ageDaysAtCapture: 0,
          },
          selectedAction: { type: "internal_follow_up", title: "Sample · Review renewal details", dueAt: null },
        },
        status: "proposed",
        proposedBy: ctx.user.id,
      });
      const actionId = idOf(actionResult);
      await tx.insert(actionEvents).values({
        workspaceId: newWorkspaceId,
        actionId,
        fromState: null,
        toState: "proposed",
        actorId: ctx.user.id,
        note: "Illustrative sample state; no action was executed.",
      });
      await tx.insert(operationalEvents).values([
        {
          workspaceId: newWorkspaceId,
          eventType: "sample.workspace.created",
          recordType: "workspace",
          recordId: newWorkspaceId,
          summary: "Illustrative sample workspace created at the user's request.",
          evidenceId: renewalEvidenceId,
          happenedAt: observedAt,
          observedAt,
          epistemicState: "observed",
          actorId: ctx.user.id,
        },
      ]);
      await tx.insert(auditLog).values({
        workspaceId: newWorkspaceId,
        actorId: ctx.user.id,
        operation: "workspace.sample_created",
        recordType: "workspace",
        recordId: newWorkspaceId,
        details: "All records in this separate workspace are illustrative sample data.",
      });
      return { workspaceId: newWorkspaceId, created: true };
    });
    return result;
  }),

  removeIllustrative: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "owner");
      if (!access.isIllustrative || access.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only your isolated illustrative workspace can be removed here." });
      }
      await access.db.transaction(async (tx) => {
        const lockedUser = await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update");
        if (!lockedUser[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Authenticated workspace owner was not found." });
        const sample = await tx.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.createdBy, ctx.user.id), eq(workspaces.isIllustrative, true))).limit(1);
        if (sample[0]) await tx.delete(workspaces).where(eq(workspaces.id, input.workspaceId));
      });
      return { removed: true };
    }),

  members: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
      return db
        .select({ id: workspaceMembers.id, userId: users.id, name: users.name, email: users.email, role: workspaceMembers.role, createdAt: workspaceMembers.createdAt })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, input.workspaceId))
        .orderBy(asc(workspaceMembers.createdAt));
    }),

  addMemberByEmail: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive(), email: z.string().email().max(320), role: z.enum(["admin", "editor", "viewer"]).default("editor") }))
    .mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
      requireManager(access);
      if (input.role === "admin" && access.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the workspace owner can grant admin access." });
      const matchedUsers = await access.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      const target = matchedUsers[0];
      if (!target) return { added: false };
      const existing = await access.db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, target.id)))
        .limit(1);
      if (existing[0]) return { added: true, alreadyMember: true };
      await access.db.insert(workspaceMembers).values({ workspaceId: input.workspaceId, userId: target.id, role: input.role });
      await access.db.insert(auditLog).values({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        operation: "workspace.member_added",
        recordType: "workspace_member",
        recordId: target.id,
        details: JSON.stringify({ role: input.role }),
      });
      return { added: true, alreadyMember: false };
    }),

  setMemberRole: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive(), memberId: z.number().int().positive(), role: z.enum(["admin", "editor", "viewer"]) }))
    .mutation(async ({ ctx, input }) => {
      const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
      requireManager(access);
      const rows = await access.db
        .select({ id: workspaceMembers.id, userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId)))
        .limit(1);
      const target = rows[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace member not found." });
      if (target.role === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "The workspace owner role cannot be reassigned here." });
      if (input.role === "admin" && access.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can grant admin access." });
      await access.db.update(workspaceMembers).set({ role: input.role }).where(eq(workspaceMembers.id, input.memberId));
      await access.db.insert(auditLog).values({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        operation: "workspace.member_role_changed",
        recordType: "workspace_member",
        recordId: target.userId,
        details: JSON.stringify({ from: target.role, to: input.role }),
      });
      return { updated: true };
    }),
});
