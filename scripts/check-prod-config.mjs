/**
 * Prebuild gate (plain Node; no tsx). Keep in sync with src/lib/env-guards.ts.
 * Fail Vercel production builds when Upstash is incomplete so a bad deploy is
 * never promoted. Refuse non-prod builds that point at the production database
 * when PRODUCTION_DATABASE_URL is set for comparison.
 */
const isProduction = process.env.VERCEL_ENV === "production";
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const productionDatabaseUrl = process.env.PRODUCTION_DATABASE_URL;

if (isProduction && (!upstashUrl || !upstashToken)) {
  console.error(
    "Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. " +
      "A misconfigured deploy must not run without rate limiting.",
  );
  process.exit(1);
}

if (
  !isProduction &&
  databaseUrl &&
  productionDatabaseUrl &&
  databaseUrl === productionDatabaseUrl
) {
  console.error(
    "DATABASE_URL matches PRODUCTION_DATABASE_URL outside production. " +
      "Preview/local must use a separate Neon branch or dedicated dev database.",
  );
  process.exit(1);
}

console.log("check-prod-config: ok");
