import { jwtVerify } from "jose";
import { parse as parseCookies } from "cookie";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { workerSchedules } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { drainEventQueue } from "./processor";
import type { OperantDb } from "../operantAccess";
import { correlationIdFor } from "../observability/correlation";

function platformCookie(req: Request): string | null {
  const value = parseCookies(req.headers.cookie ?? "").app_session_id;
  return typeof value === "string" && value.length > 20 && value.length <= 16_384 ? value : null;
}

async function resolveScheduleIdentity(token: string) {
  if (!ENV.oAuthServerUrl || !ENV.appId) throw new Error("platform_identity_unavailable");
  const response = await fetch(`${ENV.oAuthServerUrl.replace(/\/$/, "")}/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jwt_token: token, project_id: ENV.appId }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* response already settled */ }
    throw new Error("platform_identity_unavailable");
  }
  const data = await response.json() as { openId?: unknown; projectId?: unknown; taskUid?: unknown };
  if (data.projectId !== ENV.appId || typeof data.openId !== "string" || !data.openId.startsWith("cron_") || typeof data.taskUid !== "string" || data.taskUid.length < 1 || data.taskUid.length > 120) {
    throw new Error("invalid_schedule_identity");
  }
  return { openId: data.openId, taskUid: data.taskUid };
}

export function registerScheduledWorkRoutes(app: Express) {
  app.post("/api/scheduled/events", async (req: Request, res: Response) => {
    const correlationId = correlationIdFor(req);
    const token = platformCookie(req);
    if (!token || !ENV.cookieSecret || !ENV.appId) {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(401).json({ error: "scheduled_authentication_required", correlationId });
      return;
    }
    try {
      const verified = await jwtVerify(token, new TextEncoder().encode(ENV.cookieSecret), { algorithms: ["HS256"] });
      if (verified.payload.appId !== ENV.appId || typeof verified.payload.openId !== "string" || !verified.payload.openId.startsWith("cron_") || typeof verified.payload.exp !== "number") {
        res.status(401).json({ error: "scheduled_authentication_required", correlationId });
        return;
      }
      const identity = await resolveScheduleIdentity(token);
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "queue_unavailable", correlationId });
        return;
      }
      const schedules = await db.select({ id: workerSchedules.id, active: workerSchedules.active }).from(workerSchedules).where(eq(workerSchedules.taskUid, identity.taskUid)).limit(1);
      const schedule = schedules[0];
      if (!schedule || !schedule.active) {
        res.status(403).json({ error: "schedule_not_registered", correlationId });
        return;
      }
      const result = await drainEventQueue(db as OperantDb, `heartbeat-${schedule.id}`, 10);
      const now = new Date();
      await db.update(workerSchedules).set({ lastRunAt: now, lastError: null }).where(eq(workerSchedules.id, schedule.id));
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json({ accepted: true, correlationId, ...result });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      console.error(JSON.stringify({ level: "error", component: "scheduled-event-worker", correlationId, errorClass: reason === "invalid_schedule_identity" ? "identity" : "authorization_or_dependency" }));
      res.setHeader("Cache-Control", "private, no-store");
      res.status(reason === "invalid_schedule_identity" ? 401 : 503).json({ error: reason === "invalid_schedule_identity" ? "scheduled_authentication_required" : "scheduled_worker_unavailable", correlationId });
    }
  });
}
