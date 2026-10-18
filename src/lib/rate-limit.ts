import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { assertUpstashForProduction, upstashConfigComplete } from "./env-guards";
import { clientIp, rateLimitKey } from "./ip-hash";

type LimitKind = "issue" | "answer" | "commit";

let redis: Redis | null = null;
const limiters: Partial<Record<LimitKind, Ratelimit>> = {};

function getRedis(): Redis | null {
  // Defense in depth: production must never proceed without Upstash, even if
  // env vars were removed after a successful build.
  assertUpstashForProduction();
  if (!upstashConfigComplete()) return null;
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

function getLimiter(kind: LimitKind): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!limiters[kind]) {
    const configs: Record<LimitKind, { limit: number; window: `${number} ${"s" | "m" | "h" | "d"}` }> = {
      issue: { limit: 60, window: "1 h" },
      answer: { limit: 200, window: "1 h" },
      commit: { limit: 20, window: "1 d" },
    };
    const c = configs[kind];
    limiters[kind] = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(c.limit, c.window),
      prefix: `senjafuda:${kind}`,
    });
  }
  return limiters[kind] ?? null;
}

export type RateLimitResult = {
  success: boolean;
  /** True when Redis is not configured (local/dev/preview fail-open). */
  bypassed: boolean;
};

export async function checkRateLimit(kind: LimitKind): Promise<RateLimitResult> {
  const limiter = getLimiter(kind);
  if (!limiter) {
    return { success: true, bypassed: true };
  }
  const ip = await clientIp();
  const key = rateLimitKey(ip);
  const result = await limiter.limit(key);
  return { success: result.success, bypassed: false };
}

/** Fast-sweep: count option-answer hits in a 2s window. Returns true if branched. */
export async function noteOptionHit(tokenId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  const key = `senjafuda:sweep:${tokenId}`;
  const now = Date.now();
  const windowMs = 2000;
  await r.zadd(key, { score: now, member: `${now}:${Math.random()}` });
  await r.zremrangebyscore(key, 0, now - windowMs);
  await r.expire(key, 5);
  const count = await r.zcard(key);
  return count >= 3;
}
