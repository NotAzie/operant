import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { correlationMiddleware, correlationIdFor } from "../observability/correlation";
import { csrfProtection } from "./csrf";
import { registerGitHubWebhookRoutes } from "../integrations/github/webhook";
import { registerScheduledWorkRoutes } from "../events/scheduled";
import { getDb } from "../db";
import { inboundEvents, workerSchedules } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(correlationMiddleware);
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => console.info(JSON.stringify({ level: "info", type: "http_request", correlationId: correlationIdFor(req), method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt })));
    next();
  });
  // The GitHub receiver must consume the unparsed signed bytes before any JSON parser.
  registerGitHubWebhookRoutes(app);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "64kb", extended: false }));
  app.get("/api/health", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ status: "ok" }); });
  app.get("/api/ready", async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const db = await getDb();
      if (!db) throw new Error("database_unavailable");
      const [queueRows, scheduleRows] = await Promise.all([
        db.select({ id: inboundEvents.id }).from(inboundEvents).limit(1),
        db.select({ id: workerSchedules.id }).from(workerSchedules).where(eq(workerSchedules.active, true)).limit(1),
      ]);
      res.status(200).json({ status: "ready", database: "ok", eventQueueSchema: Array.isArray(queueRows) ? "ok" : "unavailable", activeRetryScheduleRegistered: scheduleRows.length > 0, correlationId: correlationIdFor(_req) });
    } catch {
      res.status(503).json({ status: "not_ready", correlationId: correlationIdFor(_req) });
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  registerScheduledWorkRoutes(app);
  // tRPC API
  app.use("/api/trpc", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  app.use("/api/trpc", csrfProtection);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const err = error as { type?: string; status?: number };
    const status = err?.type === "entity.too.large" ? 413 : err?.status === 400 ? 400 : 500;
    console.error(JSON.stringify({ level: "error", type: "http_error", correlationId: correlationIdFor(req), path: req.path, status, errorClass: err?.type ?? "unhandled" }));
    res.setHeader("Cache-Control", "private, no-store");
    res.status(status).json({ error: status === 413 ? "request_too_large" : status === 400 ? "invalid_request" : "internal_error", correlationId: correlationIdFor(req) });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error(JSON.stringify({ level: "fatal", component: "http_server", errorClass: error.name })); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(JSON.stringify({ level: "fatal", component: "startup", errorClass: error instanceof Error ? error.name : "unknown" })); process.exit(1); });
