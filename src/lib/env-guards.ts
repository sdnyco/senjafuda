/**
 * Production / preview env safety.
 * - Production must never run without Upstash (rate limits + fast-sweep).
 * - Non-production must never share the production DATABASE_URL when we can tell.
 *
 * Keep behaviour aligned with scripts/check-prod-config.mjs (prebuild gate).
 */

export function isProductionEnv(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function upstashConfigComplete(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && token);
}

/** Throw when production is missing either Upstash credential. */
export function assertUpstashForProduction(): void {
  if (!isProductionEnv()) return;
  if (upstashConfigComplete()) return;
  throw new Error(
    "Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. " +
      "A misconfigured deploy must not run without rate limiting.",
  );
}

/**
 * Cheap guard: if PRODUCTION_DATABASE_URL is set (e.g. on Preview) and equals
 * DATABASE_URL while not in production, refuse — fail-open previews must not
 * write to the permanent record.
 */
export function assertNonProdDbNotProduction(): void {
  if (isProductionEnv()) return;
  const db = process.env.DATABASE_URL;
  const prod = process.env.PRODUCTION_DATABASE_URL;
  if (db && prod && db === prod) {
    throw new Error(
      "DATABASE_URL matches PRODUCTION_DATABASE_URL outside production. " +
        "Preview/local must use a separate Neon branch or dedicated dev database.",
    );
  }
}
