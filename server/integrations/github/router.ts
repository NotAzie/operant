import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLog, githubConnections } from "../../../drizzle/schema";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireManager, requireWorkspaceAccess, requireWritableWorkspace } from "../../operantAccess";
import { consumeRateLimit } from "../../observability/rateLimit";
import { operantGitHubActionRouter } from "./actions";
import { GitHubApiError, validateRepository } from "./api";
import { createWebhookSecret, encryptIntegrationSecret, parseGitHubRepositoryUrl } from "./crypto";

function idOf(result: { 0?: { insertId?: number | bigint } }): number {
  const id = Number(result[0]?.insertId ?? 0);
  if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The database did not return a new record ID." });
  return id;
}
const workspaceInput = z.object({ workspaceId: z.number().int().positive() });

export const operantGitHubRouter = router({
  connections: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const { db } = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "viewer");
    return db.select({ id: githubConnections.id, provider: githubConnections.provider, repositoryId: githubConnections.repositoryId, repositoryOwner: githubConnections.repositoryOwner, repositoryName: githubConnections.repositoryName, repositoryUrl: githubConnections.repositoryUrl, status: githubConnections.status, lastValidatedAt: githubConnections.lastValidatedAt, lastWebhookAt: githubConnections.lastWebhookAt, lastErrorCode: githubConnections.lastErrorCode, lastErrorAt: githubConnections.lastErrorAt, createdAt: githubConnections.createdAt, updatedAt: githubConnections.updatedAt })
      .from(githubConnections).where(eq(githubConnections.workspaceId, input.workspaceId)).orderBy(desc(githubConnections.createdAt)).limit(50);
  }),

  connect: protectedProcedure.input(z.object({ ...workspaceInput.shape, repositoryUrl: z.string().url().max(500), accessToken: z.string().trim().min(20).max(512) })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin"); requireManager(access);
    requireWritableWorkspace(access);
    const limiter = await consumeRateLimit(access.db, `github-connect:${input.workspaceId}:${ctx.user.id}`, 5, 60 * 60);
    if (!limiter.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Repository connection limit reached. Try again in ${limiter.retryAfterSeconds} seconds.` });
    const address = parseGitHubRepositoryUrl(input.repositoryUrl);
    if (!address) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a GitHub repository URL such as https://github.com/owner/repository." });
    let repository;
    try { repository = await validateRepository(input.accessToken, address.owner, address.repo); }
    catch (error) {
      const message = error instanceof GitHubApiError ? error.message : "GitHub could not be reached.";
      throw new TRPCError({ code: error instanceof GitHubApiError && error.errorClass === "network" ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST", message: `Could not validate this connection: ${message}` });
    }
    if (`${address.owner}/${address.repo}`.toLowerCase() !== repository.full_name.toLowerCase()) throw new TRPCError({ code: "BAD_REQUEST", message: "The repository returned by GitHub does not match the supplied URL." });
    const webhookSecret = createWebhookSecret();
    let encryptedToken: string, encryptedWebhook: string;
    try { encryptedToken = encryptIntegrationSecret(input.accessToken); encryptedWebhook = encryptIntegrationSecret(webhookSecret); }
    catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Secure credential storage is unavailable; no GitHub token was stored." }); }
    const now = new Date();
    const connectionId = await access.db.transaction(async (tx) => {
      const existing = await tx.select({ id: githubConnections.id }).from(githubConnections).where(and(eq(githubConnections.workspaceId, input.workspaceId), eq(githubConnections.repositoryId, String(repository.id)))).limit(1).for("update");
      let id: number;
      if (existing[0]) {
        id = existing[0].id;
        await tx.update(githubConnections).set({ repositoryOwner: repository.owner.login, repositoryName: repository.name, repositoryUrl: repository.html_url, encryptedAccessToken: encryptedToken, encryptedWebhookSecret: encryptedWebhook, status: "active", lastValidatedAt: now, lastErrorCode: null, lastErrorAt: null }).where(and(eq(githubConnections.id, id), eq(githubConnections.workspaceId, input.workspaceId)));
      } else {
        id = idOf(await tx.insert(githubConnections).values({ workspaceId: input.workspaceId, repositoryId: String(repository.id), repositoryOwner: repository.owner.login, repositoryName: repository.name, repositoryUrl: repository.html_url, encryptedAccessToken: encryptedToken, encryptedWebhookSecret: encryptedWebhook, status: "active", lastValidatedAt: now, createdBy: ctx.user.id }));
      }
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: existing[0] ? "integration.github.reconnected" : "integration.github.connected", recordType: "github_connection", recordId: id, details: JSON.stringify({ repositoryId: String(repository.id), repository: repository.full_name, repositoryMetadataValidated: true, issueReadValidated: true, issueWriteProbed: false }) });
      return id;
    });
    return {
      connection: { id: connectionId, repositoryUrl: repository.html_url, repositoryId: String(repository.id), status: "active" as const, lastValidatedAt: now },
      webhookSecret,
      webhookPath: `/api/webhooks/github/${connectionId}`,
      webhookEvents: ["issues"],
      note: "Copy this signing secret now; it is stored encrypted and will not be shown again. Repository metadata and issue-read access were validated. Operant did not send a test comment: GitHub comment execution requires Issues: write and remains separately hash-approved. Configure a GitHub repository webhook with Content type application/json, event Issues, and the published website URL plus this path.",
    };
  }),

  rotateWebhookSecret: protectedProcedure.input(z.object({ ...workspaceInput.shape, connectionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin"); requireManager(access);
    requireWritableWorkspace(access);
    const connection = await access.db.select({ id: githubConnections.id }).from(githubConnections).where(and(eq(githubConnections.workspaceId, input.workspaceId), eq(githubConnections.id, input.connectionId), eq(githubConnections.status, "active"))).limit(1);
    if (!connection[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Active GitHub connection not found in this workspace." });
    const secret = createWebhookSecret();
    await access.db.transaction(async (tx) => {
      await tx.update(githubConnections).set({ encryptedWebhookSecret: encryptIntegrationSecret(secret) }).where(and(eq(githubConnections.id, input.connectionId), eq(githubConnections.workspaceId, input.workspaceId)));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "integration.github.webhook_secret_rotated", recordType: "github_connection", recordId: input.connectionId, details: "Generated a replacement signing secret; update the GitHub webhook configuration." });
    });
    return { webhookSecret: secret, webhookPath: `/api/webhooks/github/${input.connectionId}`, note: "The new signing secret replaces the previous value; update the GitHub webhook configuration now." };
  }),

  disconnect: protectedProcedure.input(z.object({ ...workspaceInput.shape, connectionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const access = await requireWorkspaceAccess(ctx.user.id, input.workspaceId, "admin"); requireManager(access);
    requireWritableWorkspace(access);
    const exists = await access.db.select({ id: githubConnections.id }).from(githubConnections).where(and(eq(githubConnections.workspaceId, input.workspaceId), eq(githubConnections.id, input.connectionId))).limit(1);
    if (!exists[0]) throw new TRPCError({ code: "NOT_FOUND", message: "GitHub connection not found in this workspace." });
    await access.db.transaction(async (tx) => {
      await tx.update(githubConnections).set({ status: "disconnected", encryptedAccessToken: null, encryptedWebhookSecret: null, lastErrorCode: null, lastErrorAt: null }).where(and(eq(githubConnections.workspaceId, input.workspaceId), eq(githubConnections.id, input.connectionId)));
      await tx.insert(auditLog).values({ workspaceId: input.workspaceId, actorId: ctx.user.id, operation: "integration.github.disconnected", recordType: "github_connection", recordId: input.connectionId, details: "Application-side credentials were removed. Revocation in GitHub remains a separate owner-managed step." });
    });
    return { disconnected: true, externalTokenRevoked: false };
  }),

  actions: operantGitHubActionRouter,
});
