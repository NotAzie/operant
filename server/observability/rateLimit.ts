import { eq, sql } from "drizzle-orm";
import { rateLimitBuckets } from "../../drizzle/schema";
import type { OperantDb } from "../operantAccess";
import { sha256Hex } from "../integrations/github/crypto";

export async function consumeRateLimit(
  db: OperantDb,
  scope: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const bucketKey = sha256Hex(scope).slice(0, 64);
  const cutoff = new Date(now.getTime() - windowSeconds * 1000);
  await db.insert(rateLimitBuckets).values({ bucketKey, windowStartedAt: now, hitCount: 1 })
    .onDuplicateKeyUpdate({ set: {
      windowStartedAt: sql`IF(${rateLimitBuckets.windowStartedAt} <= ${cutoff}, ${now}, ${rateLimitBuckets.windowStartedAt})`,
      hitCount: sql`IF(${rateLimitBuckets.windowStartedAt} <= ${cutoff}, 1, ${rateLimitBuckets.hitCount} + 1)`,
      updatedAt: now,
    } });
  const rows = await db.select({ windowStartedAt: rateLimitBuckets.windowStartedAt, hitCount: rateLimitBuckets.hitCount })
    .from(rateLimitBuckets).where(eq(rateLimitBuckets.bucketKey, bucketKey)).limit(1);
  const row = rows[0];
  if (!row) return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
  const elapsed = Math.max(0, now.getTime() - row.windowStartedAt.getTime());
  const retryAfterSeconds = Math.max(1, Math.ceil((windowSeconds * 1000 - elapsed) / 1000));
  return { allowed: row.hitCount <= limit, remaining: Math.max(0, limit - row.hitCount), retryAfterSeconds };
}
