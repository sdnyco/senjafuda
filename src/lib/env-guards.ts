/**
 * Production / preview env safety.
 * - Production must never run without required config (DB, Upstash, pepper, origin).
 * - Non-production must never share the production DATABASE_URL when we can tell.
 *
 * Keep behaviour aligned with scripts/check-prod-config.mjs (prebuild gate).
 */

const PRODUCTION_REQUIRED = [
  "DATABASE_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "IP_HASH_PEPPER",
  "SITE_ORIGIN",
  "LINK_SIGNING_SECRET",
  "EXPORT_ID_SALT",
] as const;

export function isProductionEnv(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function upstashConfigComplete(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && token);
}

function missingProductionEnv(): string[] {
  return PRODUCTION_REQUIRED.filter((key) => !process.env[key]);
}

/**
 * Throw when production is missing any required env var.
 * Defense in depth if env is changed after a successful build.
 */
export function assertProductionConfig(): void {
  if (!isProductionEnv()) return;
  const missing = missingProductionEnv();
  if (missing.length === 0) return;
  throw new Error(
    `Production requires ${PRODUCTION_REQUIRED.join(", ")}. Missing: ${missing.join(", ")}. ` +
      "A misconfigured deploy must not run.",
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
