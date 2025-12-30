import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header("x-correlation-id")?.trim();
  const correlationId = supplied && /^[A-Za-z0-9._:-]{8,64}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader("X-Correlation-ID", correlationId);
  Object.defineProperty(req, "correlationId", { value: correlationId, enumerable: false, configurable: false });
  next();
}

export function correlationIdFor(req: Request): string {
  const candidate = (req as Request & { correlationId?: string }).correlationId;
  return candidate && /^[A-Za-z0-9._:-]{8,64}$/.test(candidate) ? candidate : randomUUID();
}
