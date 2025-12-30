import { and, eq, sql } from "drizzle-orm";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { githubConnections, inboundEvents } from "../../../drizzle/schema";
import { getDb } from "../../db";
import type { OperantDb } from "../../operantAccess";
import { correlationIdFor } from "../../observability/correlation";
import { consumeRateLimit } from "../../observability/rateLimit";
import { drainEventQueue } from "../../events/processor";
import { normalizeGitHubIssuePayload } from "../../events/types";
import { verifyGitHubSignature, decryptIntegrationSecret, sha256Hex } from "./crypto";

const rawIssueSchema = z.object({
  action: z.string().min(1).max(100),
  repository: z.object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]), full_name: z.string().min(3).max(201) }).passthrough(),
  issue: z.object({
    id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]), number: z.number().int().positive(), title: z.string().max(500),
    body: z.string().max(100_000).nullable().optional(), state: z.enum(["open", "closed"]), html_url: z.string().url().max(500),
    updated_at: z.string().datetime().nullable().optional(),
  }).passthrough(),
  sender: z.object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]), login: z.string().max(100) }).passthrough(),
}).passthrough();

const acceptedActions = new Set(["opened", "edited", "closed", "reopened", "assigned", "unassigned", "labeled", "unlabeled", "milestoned", "demilestoned"]);

function jsonError(res: Response, status: number, error: string, correlationId: string, retryAfterSeconds?: number) {
  res.setHeader("Cache-Control", "private, no-store");
  if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(status).json({ error, correlationId });
}

async function acceptWebhook(req: Request, res: Response): Promise<void> {
  const correlationId = correlationIdFor(req);
  const contentType = (req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") { jsonError(res, 415, "json_required", correlationId); return; }
  const connectionId = Number(req.params.connectionId);
  if (!Number.isSafeInteger(connectionId) || connectionId < 1) { jsonError(res, 404, "connection_not_found", correlationId); return; }
  const db = await getDb();
  if (!db) { jsonError(res, 503, "webhook_unavailable", correlationId); return; }
  const connections = await db.select().from(githubConnections).where(and(eq(githubConnections.id, connectionId), eq(githubConnections.status, "active"))).limit(1);
  const connection = connections[0];
  if (!connection?.encryptedWebhookSecret) { jsonError(res, 404, "connection_not_found", correlationId); return; }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  if (!rawBody || rawBody.length === 0) { jsonError(res, 400, "invalid_webhook_body", correlationId); return; }
  let secret: string;
  try { secret = decryptIntegrationSecret(connection.encryptedWebhookSecret); }
  catch { jsonError(res, 503, "webhook_secret_unavailable", correlationId); return; }
  if (!verifyGitHubSignature(rawBody, req.header("x-hub-signature-256"), secret)) { jsonError(res, 401, "invalid_signature", correlationId); return; }
  const limit = await consumeRateLimit(db as OperantDb, `github-webhook:${connectionId}`, 120, 60);
  if (!limit.allowed) { jsonError(res, 429, "webhook_rate_limited", correlationId, limit.retryAfterSeconds); return; }
  const eventName = req.header("x-github-event");
  if (eventName !== "issues") { res.setHeader("Cache-Control", "no-store"); res.status(202).json({ accepted: true, ignored: true, correlationId }); return; }
  const deliveryId = req.header("x-github-delivery")?.trim();
  if (!deliveryId || deliveryId.length > 120 || !/^[A-Za-z0-9-]+$/.test(deliveryId)) { jsonError(res, 400, "invalid_delivery_id", correlationId); return; }
  let raw: unknown;
  try { raw = JSON.parse(rawBody.toString("utf8")); } catch { jsonError(res, 400, "invalid_json", correlationId); return; }
  const parsed = rawIssueSchema.safeParse(raw);
  if (!parsed.success) { jsonError(res, 400, "invalid_issue_event", correlationId); return; }
  const source = parsed.data;
  if (!acceptedActions.has(source.action)) { res.setHeader("Cache-Control", "no-store"); res.status(202).json({ accepted: true, ignored: true, correlationId }); return; }
  const repositoryId = String(source.repository.id);
  const fullName = source.repository.full_name;
  if (repositoryId !== connection.repositoryId || fullName.toLowerCase() !== `${connection.repositoryOwner}/${connection.repositoryName}`.toLowerCase()) {
    res.setHeader("Cache-Control", "no-store"); res.status(202).json({ accepted: true, ignored: true, correlationId }); return;
  }
  const normalized = normalizeGitHubIssuePayload(source);
  if (!normalized.success) { jsonError(res, 400, "invalid_issue_event", correlationId); return; }
  const payloadHash = sha256Hex(rawBody);
  const idempotencyKey = `github:${connectionId}:${payloadHash}`;
  const now = new Date();
  const inserted = await db.insert(inboundEvents).values({
    workspaceId: connection.workspaceId, connectionId, provider: "github", deliveryId, idempotencyKey,
    eventType: "issues", eventAction: source.action, sourceExternalId: `${repositoryId}:issue:${String(source.issue.id)}`,
    correlationId, payloadHash, payload: normalized.data as unknown as Record<string, unknown>, actorId: null,
    happenedAt: source.issue.updated_at ? new Date(source.issue.updated_at) : now, observedAt: now, status: "queued", nextAttemptAt: now,
  }).onDuplicateKeyUpdate({ set: { status: sql`${inboundEvents.status}` } });
  const affectedRows = Number(inserted[0]?.affectedRows ?? 0);
  const idRows = await db.select({ id: inboundEvents.id, status: inboundEvents.status, payloadHash: inboundEvents.payloadHash, deliveryId: inboundEvents.deliveryId })
    .from(inboundEvents).where(and(eq(inboundEvents.connectionId, connectionId), eq(inboundEvents.idempotencyKey, idempotencyKey))).limit(1);
  let existing = idRows[0];
  if (!existing) {
    const deliveryRows = await db.select({ id: inboundEvents.id, payloadHash: inboundEvents.payloadHash, deliveryId: inboundEvents.deliveryId })
      .from(inboundEvents).where(and(eq(inboundEvents.connectionId, connectionId), eq(inboundEvents.deliveryId, deliveryId))).limit(1);
    if (deliveryRows[0] && deliveryRows[0].payloadHash !== payloadHash) { jsonError(res, 409, "delivery_payload_conflict", correlationId); return; }
    if (!deliveryRows[0]) { jsonError(res, 500, "event_persistence_failed", correlationId); return; }
    existing = { ...deliveryRows[0], status: "queued" };
  }
  if (existing.payloadHash !== payloadHash) { jsonError(res, 409, "idempotency_payload_conflict", correlationId); return; }
  const duplicate = affectedRows === 0;
  await db.update(githubConnections).set({ lastWebhookAt: now, lastErrorAt: null, lastErrorCode: null }).where(eq(githubConnections.id, connectionId));
  if (!duplicate) {
    try { await drainEventQueue(db as OperantDb, `webhook-${connectionId}`, 1); }
    catch { console.error(JSON.stringify({ level: "error", component: "github-webhook", eventId: existing.id, correlationId, errorClass: "queue_drain_unavailable" })); }
  }
  const latest = await db.select({ status: inboundEvents.status }).from(inboundEvents).where(eq(inboundEvents.id, existing.id)).limit(1);
  res.setHeader("Cache-Control", "private, no-store");
  res.status(202).json({ accepted: true, duplicate, eventId: existing.id, status: latest[0]?.status ?? "queued", correlationId });
}

export function registerGitHubWebhookRoutes(app: Express) {
  app.post("/api/webhooks/github/:connectionId", express.raw({ type: "application/json", limit: "256kb" }), (req: Request, res: Response) => {
    void acceptWebhook(req, res).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", component: "github-webhook", correlationId: correlationIdFor(req), errorClass: error instanceof Error ? error.name : "unknown" }));
      if (!res.headersSent) jsonError(res, 503, "webhook_unavailable", correlationIdFor(req));
    });
  });
}
