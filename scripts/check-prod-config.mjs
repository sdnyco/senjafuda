/**
 * Prebuild gate (plain Node; no tsx). Keep in sync with src/lib/env-guards.ts.
 * Fail Vercel production builds when required env is incomplete so a bad deploy
 * is never promoted. Refuse non-prod builds that point at the production
 * database when PRODUCTION_DATABASE_URL is set for comparison.
 */
const isProduction = process.env.VERCEL_ENV === "production";
const databaseUrl = process.env.DATABASE_URL;
const productionDatabaseUrl = process.env.PRODUCTION_DATABASE_URL;

const PRODUCTION_REQUIRED = [
  "DATABASE_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "IP_HASH_PEPPER",
  "SITE_ORIGIN",
];

if (isProduction) {
  const missing = PRODUCTION_REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Production requires ${PRODUCTION_REQUIRED.join(", ")}. Missing: ${missing.join(", ")}. ` +
        "A misconfigured deploy must not run.",
    );
    process.exit(1);
  }
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
