import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookies } from "cookie";
import type { RequestHandler } from "express";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

const CSRF_COOKIE = "operant_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function signature(nonce: string) {
  if (!ENV.cookieSecret) throw new Error("Session signing is not configured.");
  return createHmac("sha256", ENV.cookieSecret).update(`operant-csrf:v1:${nonce}`).digest("hex");
}

function isValidToken(value: string | undefined): value is string {
  if (!value) return false;
  const match = value.match(/^v1\.([a-f0-9]{64})\.([a-f0-9]{64})$/);
  if (!match) return false;
  const expected = Buffer.from(signature(match[1]), "hex");
  const supplied = Buffer.from(match[2], "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const csrfProtection: RequestHandler = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie ?? "");
  let token = cookies[CSRF_COOKIE];
  if (!isValidToken(token)) {
    const nonce = randomBytes(32).toString("hex");
    token = `v1.${nonce}.${signature(nonce)}`;
    res.cookie(CSRF_COOKIE, token, { ...getSessionCookieOptions(req), httpOnly: false, maxAge: 60 * 60 * 1000 });
  }
  if (!SAFE_METHODS.has(req.method.toUpperCase())) {
    const supplied = req.header("x-operant-csrf");
    const bearerFallback = /^Bearer\s+\S{20,}$/.test(req.header("authorization") ?? "");
    if (!bearerFallback && (!isValidToken(supplied) || supplied.length !== token.length || supplied !== token)) {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(403).json({ error: "csrf_validation_failed", message: "Reload this page and retry the action." });
      return;
    }
  }
  next();
};
