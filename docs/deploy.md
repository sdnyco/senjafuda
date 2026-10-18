# Deploy

## Services

1. **Vercel** — import this repo, framework Next.js. Enable Corepack / use the repo `packageManager` field so builds run with **pnpm**.
2. **Neon** — create a project (Vercel Marketplace is fine). Schema is applied by the Vercel build (below), not from a laptop.
3. **Upstash Redis** — new Redis database; copy REST URL + token. **Required in Production** (build fails closed without them).

## Environment variables (Vercel)

| Name | Purpose |
|---|---|
| `DATABASE_URL` | App read/write connection string (**required** in production) |
| `DATABASE_URL_READONLY` | Optional in Vercel; required as a **GitHub Actions** secret for export |
| `UPSTASH_REDIS_REST_URL` | Rate limiting + fast-sweep (**required** when `VERCEL_ENV=production`) |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting + fast-sweep (**required** when `VERCEL_ENV=production`) |
| `IP_HASH_PEPPER` | Long random secret; used only to hash IPs for daily rate-limit keys (**required** in production) |
| `GITHUB_DATA_URL` | Full URL to this repo’s `/data` folder on GitHub (used by `GET /data`) |
| `SITE_ORIGIN` | Canonical public origin: `https://senjafuda.org` (**required** in production; also a GitHub Actions secret for export / IA) |
| `PRODUCTION_DATABASE_URL` | Optional on Preview: set to the production `DATABASE_URL` so a mis-pointed preview fails the build / runtime instead of writing to the permanent record |

### Preview must not use the production database

Rate limits fail-open on Preview (`VERCEL_ENV=preview`) and local. That is intentional — but a fail-open preview against **production** Postgres would pollute the append-only record.

Configure one of:

1. **Preferred:** Vercel–Neon integration with **preview branching** so each Preview deployment gets its own `DATABASE_URL` (never the production branch), or
2. A dedicated dev Neon database / branch, with `DATABASE_URL` scoped to the **Preview** environment only in the Vercel project settings.

Optionally set `PRODUCTION_DATABASE_URL` on Preview to the production connection string. If `DATABASE_URL` equals that value outside production, prebuild and runtime refuse to run.

Production builds (`VERCEL_ENV=production`) exit non-zero when any of `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `IP_HASH_PEPPER`, or `SITE_ORIGIN` is missing, so Vercel does not promote a misconfigured deploy. Runtime throws under the same condition.

## Migrations

`vercel.json` sets the build command to `pnpm run build`. That runs, in order:

1. `scripts/check-prod-config.mjs` (`prebuild`)
2. `scripts/migrate-on-build.mjs`
3. `next build`

The migration step connects with `DATABASE_URL_UNPOOLED`, or `DATABASE_URL` if the unpooled URL is unset. Production migrates the main branch. Each Preview deployment migrates that preview’s own Neon branch. When neither URL is set (a local `pnpm build`), the step logs a skip and exits 0. Any migration error exits non-zero and fails the build, so the deployment is not promoted.

Migrations are **additive only**: new tables, or new columns with defaults. Do not `DROP`, and do not rewrite or delete existing rows. Every file in `/drizzle` is applied again on each build, so each file must be safe to re-run (`IF NOT EXISTS`).

Production database credentials are not available on local machines. Do not apply production migrations from a shell. `pnpm db:migrate` is for a local or dev branch whose URL is already in the environment.

## Read-only role (Neon)

In the Neon SQL editor (production branch):

```sql
CREATE ROLE senjafuda_export WITH LOGIN PASSWORD '...strong...';
GRANT CONNECT ON DATABASE neondb TO senjafuda_export;  -- use your DB name
GRANT USAGE ON SCHEMA public TO senjafuda_export;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO senjafuda_export;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO senjafuda_export;
```

Build a connection string for that role and store it as the GitHub Actions secret `DATABASE_URL_READONLY`.

## GitHub Actions secrets

| Secret | Purpose |
|---|---|
| `DATABASE_URL_READONLY` | Nightly export |
| `SITE_ORIGIN` | Public origin for Internet Archive saves: `https://senjafuda.org` |

The export workflow needs `contents: write` to commit under `/data`.

## Local development

Point local `.env.local` at a **Neon dev branch** (or a dedicated non-production database)—never at the production branch. Production is append-only; seed data must not land there.

```bash
cp .env.example .env.local
# fill DATABASE_URL (dev branch), IP_HASH_PEPPER; Upstash optional (rate limits fail-open)
pnpm db:migrate
# Seed only against the confirmed host (prints the target host if SEED_CONFIRM_HOST is wrong):
SEED_CONFIRM_HOST=<exact-host-from-DATABASE_URL> ALLOW_SEED=1 pnpm db:seed
pnpm dev
```

`scripts/seed.ts` also refuses when `VERCEL_ENV=production`, when any existing token id does not start with `seed_`, or when `SEED_CONFIRM_HOST` does not match the `DATABASE_URL` host exactly.

Without Upstash, rate limits and fast-sweep are skipped (fail-open) when not in production. Without `DATABASE_URL`, the landing page still renders but cannot mint tokens.
