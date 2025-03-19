import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { actionAttempts, actionEvaluations, actionEvents, actions, auditLog, evidence, externalIdentities, githubConnections, inboundEvents, objectives, operationalEvents } from "../../../drizzle/schema";
import type { ActionState } from "../../operantDomain";
import { canTransitionAction } from "../../operantDomain";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireManager, requireWorkspaceAccess, requireWritableWorkspace } from "../../operantAccess";
import { consumeRateLimit } from "../../observability/rateLimit";
import { correlationIdFor } from "../../observability/correlation";
import { buildActionMarker, buildCommentBody, createIssueComment, getIssue, GitHubApiError, listIssueComments } from "./api";
import { decryptIntegrationSecret, sha256Hex } from "./crypto";

function idOf(result: { 0?: { insertId?: number | bigint } }): number {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database did not return a new record ID." });
  return id;
}
const base = z.object({ workspaceId: z.number().int().positive() });
type DbTx = Parameters<Parameters<import("../../operantAccess").OperantDb["transaction"]>[0]>[0];

type AttemptContext = { connectionId: number; repositoryId: string; owner: string; repo: string; issueNumber: number; issueUrl: string; inboundEventId: number };
function parseContext(value: unknown): AttemptContext | null {
  if (!value || typeof value !== "object") return null;
  const ctx = value as Partial<AttemptContext>;
  if (!Number.isSafeInteger(ctx.connectionId) || typeof ctx.repositoryId !== "string" || typeof ctx.owner !== "string" || typeof ctx.repo !== "string" || !Number.isSafeInteger(ctx.issueNumber) || typeof ctx.issueUrl !== "string" || !Number.isSafeInteger(ctx.inboundEventId)) return null;
  return ctx as AttemptContext;
}

function verifyStoredPreview(attempt: typeof actionAttempts.$inferSelect, context: AttemptContext) {
  const marker = buildActionMarker(attempt.actionId, attempt.requestHash);
  const suffix = `\n\n${marker}`;
  if (!attempt.requestPreview.endsWith(suffix)) return false;
  const commentText = attempt.requestPreview.slice(0, -suffix.length);
  return sha256Hex(JSON.stringify({ connectionId: context.connectionId, issueNumber: context.issueNumber, commentBody: commentText })) === attempt.requestHash;
}

async function transitionTx(tx: DbTx, action: typeof actions.$inferSelect, next: ActionState, actorId: number, note: string) {
  const current = action.status as ActionState;
  if (!canTransitionAction(current, next)) throw new TRPCError({ code: "CONFLICT", message: `Action cannot move from ${current} to ${next}.` });
  await tx.update(actions).set({ status: next }).where(and(eq(actions.id, action.id), eq(actions.workspaceId, action.workspaceId)));
  await tx.insert(actionEvents).values({ workspaceId: action.workspaceId, actionId: action.id, fromState: current, toState: next, actorId, note });
  return { ...action, status: next };
}

async function loadScopedAttempt(db: import("../../operantAccess").OperantDb, workspaceId: number, actionId: number) {
  const rows = await db.select({ action: actions, attempt: actionAttempts }).from(actions)
    .innerJoin(actionAttempts, and(eq(actionAttempts.actionId, actions.id), eq(actionAttempts.workspaceId, actions.workspaceId)))
    .where(and(eq(actions.workspaceId, workspaceId), eq(actions.id, actionId), eq(actions.actionType, "github_issue_comment"))).limit(1);
  return rows[0] ?? null;
}

async function getProviderCredentials(db: import("../../operantAccess").OperantDb, workspaceId: number, attempt: typeof actionAttempts.$inferSelect, context: AttemptContext) {
  const rows = await db.select().from(githubConnections).where(and(eq(githubConnections.id, context.connectionId), eq(githubConnections.workspaceId, workspaceId), eq(githubConnections.status, "active"))).limit(1);
  const connection = rows[0];
  if (!connection || !connection.encryptedAccessToken || connection.repositoryId !== context.repositoryId || connection.repositoryOwner.toLowerCase() !== context.owner.toLowerCase() || connection.repositoryName.toLowerCase() !== context.repo.toLowerCase()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The stored GitHub connection is unavailable or has changed. Reconcile without resubmitting, or propose a new action." });
  }
  try { return { connection, token: decryptIntegrationSecret(connection.encryptedAccessToken) }; }
  catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The stored GitHub credential is unavailable. Reconnect the repository before proposing a new action." }); }
}

function matchesExpectedComment(comments: Array<{ id: number; body: string; html_url: string; created_at: string; user: { login: string } | null }>, attempt: typeof actionAttempts.$inferSelect) {
  const marker = buildActionMarker(attempt.actionId, attempt.requestHash);
  return comments.find((comment) => comment.body === attempt.requestPreview && comment.body.includes(marker) && new URL(comment.html_url).hostname.toLowerCase() === "github.com") ?? null;
}

async function persistVerified(db: import("../../operantAccess").OperantDb, workspaceId: number, actionId: number, actorId: number, comment: { id: number; body: string; html_url: string; created_at: string; user: { login: string } | null }, correlationId: string) {
  return db.transaction(async (tx) => {
    const actionRows = await tx.select().from(actions).where(and(eq(actions.workspaceId, workspaceId), eq(actions.id, actionId), eq(actions.actionType, "github_issue_comment"))).limit(1).for("update");
    const attemptRows = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, workspaceId), eq(actionAttempts.actionId, actionId), eq(actionAttempts.provider, "github"))).limit(1).for("update");
    const action = actionRows[0], attempt = attemptRows[0];
    if (!action || !attempt) throw new TRPCError({ code: "NOT_FOUND", message: "The scoped GitHub action is no longer available." });
    const context = parseContext(attempt.providerContext);
    if (!context || !verifyStoredPreview(attempt, context) || comment.body !== attempt.requestPreview) throw new TRPCError({ code: "CONFLICT", message: "The provider result did not exactly match the stored approved request." });
    let current = action;
    if (current.status === "submitted") current = await transitionTx(tx, current, "accepted", actorId, "GitHub accepted a one-shot comment request; exact read-back verification is in progress.");
    if (current.status === "accepted") current = await transitionTx(tx, current, "executing", actorId, "Independent GitHub issue-comment read-back found the exact approved body and marker.");
    if (current.status !== "executing" && current.status !== "unknown") {
      if (current.status !== "confirmed") throw new TRPCError({ code: "CONFLICT", message: "This action is not in a state that can be verified." });
    }
    const evidenceId = idOf(await tx.insert(evidence).values({
      workspaceId, sourceName: "GitHub API · comment read-back", sourceType: "integration", sourceAuthority: "direct", sourceRef: comment.html_url,
      claim: `GitHub issue-comment API read-back found the exact approved comment for action ${actionId}; provider comment ${comment.id}; request SHA-256 ${attempt.requestHash}.`,
      sourceEventId: context.inboundEventId, observedAt: new Date(comment.created_at), epistemicState: "observed", qualityState: "current", confidence: 100, createdBy: actorId,
    }));
    await tx.insert(operationalEvents).values({ workspaceId, eventType: "github.comment.verified", recordType: "action", recordId: actionId, summary: `GitHub comment independently verified for action #${actionId}.`, evidenceId, happenedAt: new Date(comment.created_at), observedAt: new Date(), sourceProvider: "github", sourceExternalId: `${context.repositoryId}:issue:${context.issueNumber}:comment:${comment.id}`, correlationId, causationId: String(actionId), epistemicState: "confirmed", actorId });
    if (current.status === "executing" || current.status === "unknown") await transitionTx(tx, current, "confirmed", actorId, "The exact approved public comment was found by independent GitHub API read-back; verification evidence is attached.");
    await tx.update(actions).set({ outcome: `Verified by GitHub API read-back: comment #${comment.id} · ${comment.html_url}` }).where(and(eq(actions.id, actionId), eq(actions.workspaceId, workspaceId)));
    await tx.update(actionAttempts).set({ status: "verified", providerObjectId: String(comment.id), providerRequestId: String(comment.id), providerResponseMetadata: { commentUrl: comment.html_url, commentCreatedAt: comment.created_at, author: comment.user?.login ?? null, verifiedAt: new Date().toISOString() }, verificationEvidenceId: evidenceId, verifiedAt: new Date(), completedAt: new Date(), errorClass: null, errorMessage: null }).where(and(eq(actionAttempts.workspaceId, workspaceId), eq(actionAttempts.actionId, actionId)));
    await tx.insert(auditLog).values({ workspaceId, actorId, operation: "action.github_comment_verified", recordType: "action", recordId: actionId, details: JSON.stringify({ requestHash: attempt.requestHash, providerObjectId: String(comment.id), verificationEvidenceId: evidenceId, correlationId }) });
    return { verified: true as const, evidenceId, commentUrl: comment.html_url, commentId: String(comment.id) };
  });
}

async function recordUnknown(db: import("../../operantAccess").OperantDb, workspaceId: number, actionId: number, actorId: number, errorClass: string, message: string, correlationId: string) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(actions).where(and(eq(actions.id, actionId), eq(actions.workspaceId, workspaceId))).limit(1).for("update");
    const attemptRows = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, workspaceId), eq(actionAttempts.actionId, actionId))).limit(1).for("update");
    const action = rows[0], attempt = attemptRows[0];
    if (!action || !attempt) return;
    if (action.status === "submitted" || action.status === "accepted") await transitionTx(tx, action, "unknown", actorId, "A provider request may have taken effect, but its exact outcome could not be confirmed. No automatic retry was made.");
    await tx.update(actionAttempts).set({ status: "unknown", errorClass, errorMessage: message }).where(eq(actionAttempts.id, attempt.id));
    await tx.insert(auditLog).values({ workspaceId, actorId, operation: "action.github_comment_outcome_unknown", recordType: "action", recordId: actionId, details: JSON.stringify({ requestHash: attempt.requestHash, errorClass, correlationId, automaticRetry: false }) });
  });
}

async function recordKnownFailure(db: import("../../operantAccess").OperantDb, workspaceId: number, actionId: number, actorId: number, errorClass: string, message: string, correlationId: string, reauth = false) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(actions).where(and(eq(actions.id, actionId), eq(actions.workspaceId, workspaceId))).limit(1).for("update");
    const attemptRows = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, workspaceId), eq(actionAttempts.actionId, actionId))).limit(1).for("update");
    const action = rows[0], attempt = attemptRows[0];
    if (!action || !attempt) return;
    if (action.status === "submitted" || action.status === "accepted") await transitionTx(tx, action, "failed", actorId, `GitHub returned a definitive rejection (${errorClass}); no successful write was confirmed.`);
    await tx.update(actionAttempts).set({ status: "failed", errorClass, errorMessage: message, completedAt: new Date() }).where(eq(actionAttempts.id, attempt.id));
    const context = parseContext(attempt.providerContext);
    if (reauth && context) await tx.update(githubConnections).set({ status: "reauthorization_required", lastErrorCode: errorClass, lastErrorAt: new Date() }).where(and(eq(githubConnections.id, context.connectionId), eq(githubConnections.workspaceId, workspaceId)));
    await tx.insert(auditLog).values({ workspaceId, actorId, operation: "action.github_comment_failed", recordType: "action", recordId: actionId, details: JSON.stringify({ requestHash: attempt.requestHash, errorClass, correlationId }) });
  });
}

export const operantGitHubActionRouter = router({
  listAttempts: protectedProcedure.input(base).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    const rows = await db.select({ attempt: actionAttempts, evaluation: actionEvaluations, actionTitle: actions.title, actionStatus: actions.status, actionProposedBy: actions.proposedBy, actionAuthorizedBy: actions.authorizedBy })
      .from(actionAttempts).innerJoin(actions, and(eq(actions.id, actionAttempts.actionId), eq(actions.workspaceId, actionAttempts.workspaceId)))
      .leftJoin(actionEvaluations, and(eq(actionEvaluations.actionId, actions.id), eq(actionEvaluations.workspaceId, actions.workspaceId)))
      .where(and(eq(actionAttempts.workspaceId, input.workspaceId), eq(actionAttempts.provider, "github"))).orderBy(desc(actionAttempts.createdAt)).limit(100);
    return rows;
  }),

  proposeComment: protectedProcedure.input(z.object({ ...base.shape, connectionId: z.number().int().positive(), operationalEventId: z.number().int().positive(), objectiveId: z.number().int().positive().optional(), commentBody: z.string().trim().min(1).max(8000).refine((body) => !body.includes("<!-- operant-action:"), "The reserved Operant action marker cannot be supplied in comment text.") })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "editor");
    requireWritableWorkspace(access);
    const connectionRows = await access.db.select().from(githubConnections).where(and(eq(githubConnections.workspaceId, input.workspaceId), eq(githubConnections.id, input.connectionId), eq(githubConnections.status, "active"))).limit(1);
    const eventRows = await access.db.select().from(operationalEvents).where(and(eq(operationalEvents.workspaceId, input.workspaceId), eq(operationalEvents.id, input.operationalEventId), eq(operationalEvents.sourceProvider, "github"))).limit(1);
    const connection = connectionRows[0], event = eventRows[0];
    if (!connection || !event || !event.sourceExternalId || !event.causationId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a GitHub-derived event linked to an active connection in this workspace." });
    const inboundEventId = Number(event.causationId);
    if (!Number.isSafeInteger(inboundEventId) || inboundEventId < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected event has no valid source-ingestion record." });
    const inboundRows = await access.db.select().from(inboundEvents).where(and(eq(inboundEvents.id, inboundEventId), eq(inboundEvents.workspaceId, input.workspaceId), eq(inboundEvents.connectionId, connection.id), eq(inboundEvents.provider, "github"), eq(inboundEvents.status, "processed"))).limit(1);
    const inbound = inboundRows[0];
    if (!inbound) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected GitHub event was not processed in this workspace." });
    const payload = inbound.payload as { repository?: { id?: unknown; fullName?: unknown }; issue?: { id?: unknown; number?: unknown; htmlUrl?: unknown } };
    const issueNumber = payload.issue?.number;
    const issueId = payload.issue?.id;
    if (typeof issueNumber !== "number" || !Number.isSafeInteger(issueNumber) || issueNumber < 1 || typeof issueId !== "string" || typeof payload.repository?.id !== "string" || payload.repository.id !== connection.repositoryId || event.sourceExternalId !== `${connection.repositoryId}:issue:${issueId}`) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The selected GitHub event does not match this exact connected repository and issue." });
    }
    const identityRows = await access.db.select({ externalId: externalIdentities.externalId }).from(externalIdentities).where(and(eq(externalIdentities.workspaceId, input.workspaceId), eq(externalIdentities.connectionId, connection.id), eq(externalIdentities.provider, "github"), eq(externalIdentities.externalKind, "issue"), eq(externalIdentities.externalId, event.sourceExternalId))).limit(1);
    if (!identityRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The event issue identity is not registered to this connection." });
    let objective: { id: number; title: string; priority: "required" | "preference" } | null = null;
    if (input.objectiveId) {
      const objectiveRows = await access.db.select({ id: objectives.id, title: objectives.title, priority: objectives.priority }).from(objectives)
        .where(and(eq(objectives.id, input.objectiveId), eq(objectives.workspaceId, input.workspaceId), eq(objectives.active, true))).limit(1);
      if (!objectiveRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected objective is not active in this workspace." });
      objective = objectiveRows[0];
    }
    const limiter = await consumeRateLimit(access.db, `github-comment-proposal:${input.workspaceId}:${ctx.user.id}`, 20, 60 * 60);
    if (!limiter.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Limit reached. Try again in ${limiter.retryAfterSeconds} seconds.` });
    const requestHash = sha256Hex(JSON.stringify({ connectionId: connection.id, issueNumber, commentBody: input.commentBody }));
    const title = `Comment on ${connection.repositoryOwner}/${connection.repositoryName} issue #${issueNumber}`;
    const actionId = await access.db.transaction(async (tx) => {
      const inserted = await tx.insert(actions).values({ workspaceId: input.workspaceId, actionType: "github_issue_comment", title, description: "Externally visible GitHub issue comment. Manager approval of the exact stored payload and a separate execution step are required.", eventId: event.id, objectiveId: objective?.id ?? null, status: "proposed", proposedBy: ctx.user.id });
      const id = idOf(inserted);
      const exactBody = buildCommentBody(input.commentBody, id, requestHash);
      await tx.insert(actionAttempts).values({ workspaceId: input.workspaceId, actionId: id, provider: "github", operation: "create_issue_comment", idempotencyKey: `github-comment:${input.workspaceId}:${id}`, status: "prepared", requestPreview: exactBody, requestHash, providerContext: { connectionId: connection.id, repositoryId: connection.repositoryId, owner: connection.repositoryOwner, repo: connection.repositoryName, issueNumber, issueUrl: String(payload.issue?.htmlUrl ?? connection.repositoryUrl), inboundEventId }, attemptCount: 0, initiatedBy: ctx.user.id });
      await tx.insert(actionEvaluations).values({ workspaceId: input.workspaceId, actionId: id, actorId: ctx.user.id, actorRole: access.role, scopeSnapshot: { workspaceId: input.workspaceId, connectionId: connection.id, repositoryId: connection.repositoryId, issueNumber, inboundEventId, operationalEventId: event.id, objectiveId: objective?.id ?? null, responsibility: { status: "not_assigned", note: "No separate Operant responsibility assignment was selected for this public comment proposal; proposer and manager approval are recorded independently." } }, riskLevel: "high", requiredRole: "admin", approvalRequired: true, policySnapshot: { externalActionsRequireHumanApproval: true, actionType: "github_issue_comment", objective, version: 1 }, rationale: "The exact public comment text and single repository/issue target are stored and hash-bound. This external write is high risk, requires owner/admin approval, and must be sent in a separate manual step." });
      await tx.insert(actionEvents).values({ workspaceId: input.workspaceId, actionId: id, fromState: null, toState: "proposed", actorId: ctx.user.id, note: `Exact GitHub comment proposed for ${connection.repositoryOwner}/${connection.repositoryName}#${issueNumber}; request SHA-256 ${requestHash}. No provider request was sent.` });
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.github_comment_proposed", recordType: "action", recordId: id, details: JSON.stringify({ eventId: event.id, connectionId: connection.id, issueNumber, requestHash, approvalRequired: true }) });
      return id;
    });
    const preview = await access.db.select({ requestPreview: actionAttempts.requestPreview }).from(actionAttempts).where(and(eq(actionAttempts.workspaceId, input.workspaceId), eq(actionAttempts.actionId, actionId))).limit(1);
    return { actionId, requestHash, requestPreview: preview[0]?.requestPreview ?? "", issueNumber, repositoryUrl: connection.repositoryUrl, issueUrl: payload.issue?.htmlUrl ?? null, approvalRequired: true, status: "proposed" as const };
  }),

  authorizeComment: protectedProcedure.input(z.object({ ...base.shape, actionId: z.number().int().positive(), expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/) })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin"); requireManager(access);
    requireWritableWorkspace(access);
    await access.db.transaction(async (tx) => {
      const actionRows = await tx.select().from(actions).where(and(eq(actions.workspaceId, input.workspaceId), eq(actions.id, input.actionId), eq(actions.actionType, "github_issue_comment"))).limit(1).for("update");
      const attemptRows = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, input.workspaceId), eq(actionAttempts.actionId, input.actionId), eq(actionAttempts.provider, "github"))).limit(1).for("update");
      const action = actionRows[0], attempt = attemptRows[0];
      if (!action || !attempt) throw new TRPCError({ code: "NOT_FOUND", message: "GitHub comment action not found in this workspace." });
      const context = parseContext(attempt.providerContext);
      if (!context || !verifyStoredPreview(attempt, context) || attempt.requestHash !== input.expectedRequestHash) throw new TRPCError({ code: "CONFLICT", message: "The exact preview changed or does not match the approved hash. Review and propose again." });
      if (attempt.status !== "prepared" || action.status !== "proposed") throw new TRPCError({ code: "CONFLICT", message: "Only a prepared proposal can be authorized." });
      if (!canTransitionAction(action.status as ActionState, "authorized")) throw new TRPCError({ code: "CONFLICT", message: "The action cannot be authorized from its current state." });
      await tx.update(actionAttempts).set({ authorizedRequestHash: input.expectedRequestHash }).where(eq(actionAttempts.id, attempt.id));
      await tx.update(actions).set({ authorizedBy: ctx.user.id }).where(eq(actions.id, action.id));
      await transitionTx(tx, action, "authorized", ctx.user.id, `Owner/admin approved the exact stored GitHub comment request SHA-256 ${input.expectedRequestHash}. Execution is still a separate step.`);
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.github_comment_authorized", recordType: "action", recordId: action.id, details: JSON.stringify({ requestHash: input.expectedRequestHash, actionId: action.id }) });
    });
    return { authorized: true, executionRequired: true };
  }),

  executeComment: protectedProcedure.input(z.object({ ...base.shape, actionId: z.number().int().positive(), expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/) })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin"); requireManager(access);
    requireWritableWorkspace(access);
    const limiter = await consumeRateLimit(access.db, `github-comment-execution:${input.workspaceId}:${ctx.user.id}`, 10, 60 * 60);
    if (!limiter.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `External write limit reached. Try again in ${limiter.retryAfterSeconds} seconds.` });
    const claimed = await access.db.transaction(async (tx) => {
      const actionRows = await tx.select().from(actions).where(and(eq(actions.workspaceId, input.workspaceId), eq(actions.id, input.actionId), eq(actions.actionType, "github_issue_comment"))).limit(1).for("update");
      const attemptRows = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, input.workspaceId), eq(actionAttempts.actionId, input.actionId), eq(actionAttempts.provider, "github"))).limit(1).for("update");
      const action = actionRows[0], attempt = attemptRows[0];
      if (!action || !attempt) throw new TRPCError({ code: "NOT_FOUND", message: "GitHub comment action not found in this workspace." });
      const context = parseContext(attempt.providerContext);
      if (!context || !verifyStoredPreview(attempt, context) || attempt.requestHash !== input.expectedRequestHash || attempt.authorizedRequestHash !== attempt.requestHash) throw new TRPCError({ code: "CONFLICT", message: "The exact request has not been approved or its stored preview changed." });
      if (action.status !== "authorized" || attempt.status !== "prepared") throw new TRPCError({ code: "CONFLICT", message: "This request is not in a state that can be sent. Do not resend an unknown outcome; reconcile it instead." });
      await tx.update(actionAttempts).set({ status: "submitting", attemptCount: attempt.attemptCount + 1, submittedAt: new Date(), errorClass: null, errorMessage: null }).where(eq(actionAttempts.id, attempt.id));
      await transitionTx(tx, action, "submitted", ctx.user.id, "One explicit GitHub API POST is starting for the approved exact payload. This endpoint does not auto-retry writes.");
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.github_comment_submission_started", recordType: "action", recordId: action.id, details: JSON.stringify({ requestHash: attempt.requestHash, attempt: attempt.attemptCount + 1 }) });
      return { action, attempt: { ...attempt, status: "submitting" as const, attemptCount: attempt.attemptCount + 1 }, context };
    });
    const stored = claimed.attempt;
    let postStarted = false;
    try {
      const { token } = await getProviderCredentials(access.db, input.workspaceId, stored, claimed.context);
      const issue = await getIssue(token, claimed.context.owner, claimed.context.repo, claimed.context.issueNumber);
      if (issue.number !== claimed.context.issueNumber) throw new Error("The target issue number did not match the stored proposal.");
      const priorComments = await listIssueComments(token, claimed.context.owner, claimed.context.repo, claimed.context.issueNumber, 1);
      const preexisting = matchesExpectedComment(priorComments, stored);
      if (preexisting) return await persistVerified(access.db, input.workspaceId, input.actionId, ctx.user.id, preexisting, correlationIdFor(ctx.req));
      postStarted = true;
      const created = await createIssueComment(token, claimed.context.owner, claimed.context.repo, claimed.context.issueNumber, stored.requestPreview);
      await access.db.transaction(async (tx) => {
        const actionRows = await tx.select().from(actions).where(and(eq(actions.workspaceId, input.workspaceId), eq(actions.id, input.actionId))).limit(1).for("update");
        const attemptRows = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, input.workspaceId), eq(actionAttempts.actionId, input.actionId))).limit(1).for("update");
        const action = actionRows[0], attempt = attemptRows[0];
        if (!action || !attempt || action.status !== "submitted" || attempt.status !== "submitting" || attempt.requestHash !== input.expectedRequestHash) throw new TRPCError({ code: "CONFLICT", message: "The provider response arrived after the persisted request state changed; reconcile rather than resend." });
        const next = await transitionTx(tx, action, "accepted", ctx.user.id, `GitHub returned a created comment reference (${created.id}); independent exact read-back is required before confirmation.`);
        await tx.update(actionAttempts).set({ status: "provider_accepted", providerObjectId: String(created.id), providerRequestId: String(created.id), providerResponseMetadata: { commentUrl: created.html_url, commentCreatedAt: created.created_at, author: created.user?.login ?? null } }).where(eq(actionAttempts.id, attempt.id));
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.github_comment_provider_accepted", recordType: "action", recordId: action.id, details: JSON.stringify({ requestHash: attempt.requestHash, providerObjectId: String(created.id) }) });
        void next;
      });
      const comments = await listIssueComments(token, claimed.context.owner, claimed.context.repo, claimed.context.issueNumber, 1);
      const verified = matchesExpectedComment(comments, stored);
      if (!verified) {
        await recordUnknown(access.db, input.workspaceId, input.actionId, ctx.user.id, "readback_missing", "GitHub accepted a comment request, but exact read-back did not find the stored body. No retry was made.", correlationIdFor(ctx.req));
        return { verified: false as const, status: "unknown" as const, message: "GitHub accepted the request, but exact read-back did not find the comment. Outcome remains unknown; no retry was made." };
      }
      return await persistVerified(access.db, input.workspaceId, input.actionId, ctx.user.id, verified, correlationIdFor(ctx.req));
    } catch (error) {
      const code = error instanceof GitHubApiError ? error.errorClass : "execution";
      if (!postStarted && error instanceof TRPCError && error.code === "CONFLICT") throw error;
      if (!postStarted || (error instanceof GitHubApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status))) {
        await recordKnownFailure(access.db, input.workspaceId, input.actionId, ctx.user.id, code, error instanceof Error ? error.message : "GitHub action failed.", correlationIdFor(ctx.req), error instanceof GitHubApiError && error.status === 401);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `GitHub did not confirm a successful result (${code}). No automatic retry was made; review the action history before proposing again.` });
      }
      await recordUnknown(access.db, input.workspaceId, input.actionId, ctx.user.id, code, "The provider request or its verification had an ambiguous outcome. No automatic retry was made.", correlationIdFor(ctx.req));
      return { verified: false as const, status: "unknown" as const, message: "The result is uncertain. Operant did not retry the external write; reconcile by read-back before taking any further action." };
    }
  }),

  reconcileComment: protectedProcedure.input(z.object({ ...base.shape, actionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin"); requireManager(access);
    requireWritableWorkspace(access);
    const limiter = await consumeRateLimit(access.db, `github-comment-reconcile:${input.workspaceId}:${ctx.user.id}`, 30, 60 * 60);
    if (!limiter.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Reconciliation limit reached. Try again in ${limiter.retryAfterSeconds} seconds.` });
    const scoped = await loadScopedAttempt(access.db, input.workspaceId, input.actionId);
    if (!scoped) throw new TRPCError({ code: "NOT_FOUND", message: "GitHub action not found in this workspace." });
    const { action, attempt } = scoped;
    if (!(attempt.status === "unknown" || attempt.status === "submitting" || attempt.status === "provider_accepted") || !(action.status === "unknown" || action.status === "submitted" || action.status === "accepted")) {
      throw new TRPCError({ code: "CONFLICT", message: "Only an uncertain or interrupted provider request can be reconciled." });
    }
    const context = parseContext(attempt.providerContext);
    if (!context || !verifyStoredPreview(attempt, context)) throw new TRPCError({ code: "CONFLICT", message: "The exact stored preview cannot be verified. No provider call was made." });
    const { token } = await getProviderCredentials(access.db, input.workspaceId, attempt, context);
    let comments;
    try { comments = await listIssueComments(token, context.owner, context.repo, context.issueNumber, 5); }
    catch (error) {
      const message = error instanceof GitHubApiError ? error.message : "GitHub could not be read.";
      return { resolved: false as const, status: attempt.status, reason: `${message} Outcome remains unchanged and no write was sent.` };
    }
    const verified = matchesExpectedComment(comments, attempt);
    if (!verified) {
      await access.db.transaction(async (tx) => {
        const currentRows = await tx.select().from(actions).where(and(eq(actions.workspaceId, input.workspaceId), eq(actions.id, input.actionId))).limit(1).for("update");
        const currentAttempt = await tx.select().from(actionAttempts).where(and(eq(actionAttempts.workspaceId, input.workspaceId), eq(actionAttempts.actionId, input.actionId))).limit(1).for("update");
        const current = currentRows[0], latestAttempt = currentAttempt[0];
        if (current && latestAttempt && current.status !== "unknown") await transitionTx(tx, current, "unknown", ctx.user.id, "A bounded GitHub comment read-back found no exact marker in the latest 500 comments. This does not prove the write failed; no retry was made.");
        if (latestAttempt) await tx.update(actionAttempts).set({ status: "unknown", errorClass: "readback_not_found", errorMessage: "No exact marker in the latest 500 comments; absence is not proof of failure." }).where(eq(actionAttempts.id, latestAttempt.id));
        await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "action.github_comment_reconciled_unknown", recordType: "action", recordId: input.actionId, details: JSON.stringify({ requestHash: attempt.requestHash, pagesSearched: 5, writeSent: false }) });
      });
      return { resolved: false as const, status: "unknown" as const, reason: "No exact approved marker was found in the latest 500 comments. Absence is not proof the write failed; outcome remains unknown and no retry was made." };
    }
    const result = await persistVerified(access.db, input.workspaceId, input.actionId, ctx.user.id, verified, correlationIdFor(ctx.req));
    return { resolved: true as const, status: "confirmed" as const, commentUrl: result.commentUrl, evidenceId: result.evidenceId, writeSent: false as const };
  }),
});
