import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { assertProductionConfig, upstashConfigComplete } from "./env-guards";
import { clientIp, rateLimitKey, utcDateString } from "./ip-hash";

/**
 * Era 1 matrix (spec R4).
 * - mint_source: 60 / hour
 * - mint_global: 5 000 / UTC day
 * - write: 200 / hour
 * - draw: 5 / UTC day
 * - decline: 20 / UTC day
 * - s_get: 300 / hour
 *
 * When Upstash is configured but a call fails: `unavailable: true` — callers
 * must serve the soft 503 page and write nothing (§12). Missing Upstash outside
 * production still fail-opens (`bypassed: true`).
 */
type LimitKind =
  | "mint_source"
  | "write"
  | "draw"
  | "decline"
  | "s_get";

let redis: Redis | null = null;
const limiters: Partial<Record<LimitKind, Ratelimit>> = {};

function getRedis(): Redis | null {
  assertProductionConfig();
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
    const configs: Record<
      LimitKind,
      { limit: number; window: `${number} ${"s" | "m" | "h" | "d"}` }
    > = {
      mint_source: { limit: 60, window: "1 h" },
      write: { limit: 200, window: "1 h" },
      draw: { limit: 5, window: "1 d" },
      decline: { limit: 20, window: "1 d" },
      s_get: { limit: 300, window: "1 h" },
    };
    const c = configs[kind];
    limiters[kind] = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(c.limit, c.window),
      prefix: `senjafuda:era1:${kind}`,
    });
  }
  return limiters[kind] ?? null;
}

export type RateLimitResult = {
  success: boolean;
  /** True when Redis is not configured (local/dev fail-open). */
  bypassed: boolean;
  /** True when Redis is configured but the call failed — serve 503, write nothing. */
  unavailable?: boolean;
};

function unavailableResult(): RateLimitResult {
  return { success: false, bypassed: false, unavailable: true };
}

async function limitKind(kind: LimitKind): Promise<RateLimitResult> {
  const limiter = getLimiter(kind);
  if (!limiter) {
    return { success: true, bypassed: true };
  }
  try {
    const ip = await clientIp();
    const key = rateLimitKey(ip);
    const result = await limiter.limit(key);
    return { success: result.success, bypassed: false };
  } catch {
    return unavailableResult();
  }
}

export async function checkMintSourceLimit(): Promise<RateLimitResult> {
  return limitKind("mint_source");
}

export async function checkWriteLimit(): Promise<RateLimitResult> {
  return limitKind("write");
}

export async function checkDrawLimit(): Promise<RateLimitResult> {
  return limitKind("draw");
}

export async function checkDeclineLimit(): Promise<RateLimitResult> {
  return limitKind("decline");
}

export async function checkSGetLimit(): Promise<RateLimitResult> {
  return limitKind("s_get");
}

/** Global visit mint ceiling: 5 000 / UTC day (remints count). */
export async function checkAndIncrGlobalMint(): Promise<RateLimitResult> {
  const r = getRedis();
  if (!r) return { success: true, bypassed: true };
  try {
    const day = utcDateString();
    const key = `senjafuda:era1:mint_global:${day}`;
    const n = await r.incr(key);
    if (n === 1) {
      await r.expire(key, 60 * 60 * 48);
    }
    return { success: n <= 5000, bypassed: false };
  } catch {
    return unavailableResult();
  }
}

/** @deprecated Pilot name — maps to mint_source for any leftover callers. */
export async function checkRateLimit(
  kind: "issue" | "answer" | "commit",
): Promise<RateLimitResult> {
  if (kind === "issue") return checkMintSourceLimit();
  if (kind === "commit") return checkDrawLimit();
  return checkWriteLimit();
}

const SWEEP_WINDOW_MS = 2000;
const SWEEP_THRESHOLD = 3;

export type SweepHitResult =
  | { unavailable: false; tripped: boolean }
  | { unavailable: true };

/**
 * Count one sweep GET for a visit in a sliding 2s window.
 * `tripped` when this hit reaches the threshold (3+).
 */
export async function noteSweepHit(visitId: string): Promise<SweepHitResult> {
  const r = getRedis();
  if (!r) return { unavailable: false, tripped: false };
  try {
    const key = `senjafuda:era1:sweep:${visitId}`;
    const now = Date.now();
    await r.zadd(key, { score: now, member: `${now}:${Math.random()}` });
    await r.zremrangebyscore(key, 0, now - SWEEP_WINDOW_MS);
    await r.expire(key, 5);
    const count = await r.zcard(key);
    return { unavailable: false, tripped: count >= SWEEP_THRESHOLD };
  } catch {
    return { unavailable: true };
  }
}
