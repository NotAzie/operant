import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLog, eventAttempts, inboundEvents, workerSchedules } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireManager, requireWorkspaceAccess, requireWritableWorkspace } from "../operantAccess";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "../_core/heartbeat";
import { consumeRateLimit } from "../observability/rateLimit";
import { drainEventQueue } from "./processor";

const retryScheduleName = "operant-event-queue-recovery";
const retryScheduleCron = "0 * * * * *";
const retrySchedulePath = "/api/scheduled/events";
const retryScheduleDescription = "Operant durable inbox recovery; drains a bounded number of due workspace events.";
const workspaceInput = z.object({ workspaceId: z.number().int().positive() });

export const operantEventsRouter = router({
  list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const rows = await db.select({
      id: inboundEvents.id, provider: inboundEvents.provider, eventType: inboundEvents.eventType, eventAction: inboundEvents.eventAction,
      sourceExternalId: inboundEvents.sourceExternalId, correlationId: inboundEvents.correlationId, payloadHash: inboundEvents.payloadHash,
      payload: inboundEvents.payload, resultPayload: inboundEvents.resultPayload, status: inboundEvents.status, attemptCount: inboundEvents.attemptCount, maxAttempts: inboundEvents.maxAttempts,
      nextAttemptAt: inboundEvents.nextAttemptAt, processedAt: inboundEvents.processedAt, deadLetteredAt: inboundEvents.deadLetteredAt,
      lastErrorClass: inboundEvents.lastErrorClass, lastErrorMessage: inboundEvents.lastErrorMessage, createdAt: inboundEvents.createdAt,
    }).from(inboundEvents).where(eq(inboundEvents.workspaceId, input.workspaceId)).orderBy(desc(inboundEvents.createdAt)).limit(100);
    return rows.map((row) => {
      const payload = row.payload as Record<string, unknown>;
      const resultPayload = row.resultPayload as Record<string, unknown> | null;
      const conflictRefreshIncomplete = Array.isArray(resultPayload?.conflictRefreshIncomplete)
        ? resultPayload.conflictRefreshIncomplete.filter((value): value is string => typeof value === "string")
        : [];
      const issue = payload && typeof payload.issue === "object" && payload.issue !== null ? payload.issue as Record<string, unknown> : null;
      const claim = typeof payload?.claim === "string" ? payload.claim : null;
      return {
        ...row,
        payload: undefined,
        resultPayload: undefined,
        conflictRefreshIncomplete,
        summary: issue ? `GitHub issue #${String(issue.number ?? "?")}: ${String(issue.title ?? "(untitled)")}` : claim ?? "Manual observation event",
      };
    });
  }),
  attempts: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), eventId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const rows = await db.select().from(eventAttempts).where(and(eq(eventAttempts.workspaceId, input.workspaceId), eq(eventAttempts.eventId, input.eventId))).orderBy(desc(eventAttempts.attemptNumber)).limit(20);
    return rows;
  }),
  replay: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), eventId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    const event = await access.db.transaction(async (tx) => {
      const rows = await tx.select().from(inboundEvents).where(and(eq(inboundEvents.workspaceId, input.workspaceId), eq(inboundEvents.id, input.eventId))).limit(1).for("update");
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found in this workspace." });
      if (!(row.status === "dead_letter" || row.status === "retryable_failure")) throw new TRPCError({ code: "CONFLICT", message: "Only failed events can be replayed; queued or processing work is left alone." });
      const now = new Date();
      await tx.update(inboundEvents).set({ status: "queued", maxAttempts: row.attemptCount + 5, nextAttemptAt: now, leaseOwner: null, leaseExpiresAt: null, deadLetteredAt: null }).where(eq(inboundEvents.id, row.id));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "event.replay_requested", recordType: "inbound_event", recordId: row.id, details: JSON.stringify({ priorStatus: row.status, attemptCount: row.attemptCount }) });
      return row;
    });
    await drainEventQueue(access.db, `replay-${ctx.user.id}-${event.id}`, 1);
    const latest = await access.db.select({ status: inboundEvents.status }).from(inboundEvents).where(eq(inboundEvents.id, event.id)).limit(1);
    return { replayed: true, status: latest[0]?.status ?? "queued" };
  }),
  registerRetrySchedule: protectedProcedure.input(workspaceInput).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin");
    requireManager(access);
    requireWritableWorkspace(access);
    if (process.env.NODE_ENV !== "production") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Register the durable retry worker only after the application is published." });
    const limiter = await consumeRateLimit(access.db, `event-worker-register:${ctx.user.id}`, 3, 60 * 60);
    if (!limiter.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Retry worker registration is limited. Try again in ${limiter.retryAfterSeconds} seconds.` });

    try {
      const jobs = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
      let taskUid = jobs.jobs.find((job) => job.name === retryScheduleName)?.taskUid;
      let nextExecutionAt: string | null | undefined;
      if (taskUid) {
        const current = jobs.jobs.find((job) => job.taskUid === taskUid);
        if (current && (!current.isEnable || current.cronExpression !== retryScheduleCron || current.callbackPath !== retrySchedulePath || current.callbackMethod !== "POST" || current.callbackPayload !== "{}" || current.description !== retryScheduleDescription)) {
          const updated = await updateHeartbeatJob(taskUid, { cron: retryScheduleCron, path: retrySchedulePath, method: "POST", payload: {}, description: retryScheduleDescription, enable: true }, "");
          nextExecutionAt = updated.nextExecutionAt;
        } else {
          nextExecutionAt = current?.nextExecutionAt;
        }
      } else {
        const created = await createHeartbeatJob({ name: retryScheduleName, cron: retryScheduleCron, path: retrySchedulePath, method: "POST", payload: {}, description: retryScheduleDescription }, "");
        taskUid = created.taskUid;
        nextExecutionAt = created.nextExecutionAt;
      }
      const now = new Date();
      const existing = await access.db.select({ id: workerSchedules.id }).from(workerSchedules).where(eq(workerSchedules.name, retryScheduleName)).limit(1);
      await access.db.transaction(async (tx) => {
        let scheduleId: number;
        if (existing[0]) {
          scheduleId = existing[0].id;
          await tx.update(workerSchedules).set({ taskUid: taskUid!, cronExpression: retryScheduleCron, active: true, lastError: null }).where(eq(workerSchedules.id, scheduleId));
        } else {
          const inserted = await tx.insert(workerSchedules).values({ name: retryScheduleName, taskUid: taskUid!, cronExpression: retryScheduleCron, active: true, createdBy: ctx.user.id });
          scheduleId = Number(inserted[0]?.insertId ?? 0);
          if (!scheduleId) throw new Error("Worker registration row did not return an ID.");
        }
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "event.retry_worker_registered", recordType: "worker_schedule", recordId: scheduleId, details: JSON.stringify({ name: retryScheduleName, cronExpression: retryScheduleCron, callbackPath: retrySchedulePath, taskUid }) });
      });
      return { registered: true, cronExpression: retryScheduleCron, nextExecutionAt: nextExecutionAt ?? null };
    } catch (error) {
      console.error(JSON.stringify({ level: "error", component: "event-worker-registration", workspaceId: input.workspaceId, errorClass: error instanceof Error ? error.name : "unknown" }));
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The durable retry worker could not be registered or reconciled. Inbox records remain persisted; retry this operation after checking platform availability." });
    }
  }),
  health: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const [rows, schedules] = await Promise.all([
      db.select({ status: inboundEvents.status }).from(inboundEvents).where(and(eq(inboundEvents.workspaceId, input.workspaceId), inArray(inboundEvents.status, ["queued", "processing", "retryable_failure", "dead_letter"]))).limit(1000),
      db.select({ active: workerSchedules.active }).from(workerSchedules).where(eq(workerSchedules.name, retryScheduleName)).limit(1),
    ]);
    return {
      queued: rows.filter((row) => row.status === "queued").length,
      processing: rows.filter((row) => row.status === "processing").length,
      retryable: rows.filter((row) => row.status === "retryable_failure").length,
      deadLettered: rows.filter((row) => row.status === "dead_letter").length,
      retryScheduleRegistered: schedules[0]?.active ?? false,
      retryScheduleRegistrationAvailable: process.env.NODE_ENV === "production",
      checkedAt: new Date(),
    };
  }),
});
