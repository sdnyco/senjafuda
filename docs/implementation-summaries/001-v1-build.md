# Implementation summary — 001 v1 build

**Date:** 2026-10-18  
**Spec:** `/docs/specs/001-v1-build.md` (including Revision 1; name rev 2)

## Rename (rev 2)

Project name is **senjafuda** (was working names *schelling* / *guestbook* / `[Name]`). Code-level identifiers, package name, metadata, landing copy, `llms.txt` header, `/data/README.md`, deploy docs, and Redis key prefixes were updated accordingly. Spec and `PROJECT-STATE.md` were updated by the author separately. Repo folder / GitHub remote rename left to the operator.

## What shipped

Deployable Next.js (App Router) **senjafuda** site with:

- Content-driven landing copy (`/content/page.md`) and vocabulary (`/content/vocab/v1.json`)
- Placeholder marks `m01`–`m12` under `/content/marks/`
- Token issuance on every dynamic `GET /` (never in layout; `Cache-Control: no-store`; HEAD short-circuited in middleware so previewers do not mint)
- Link flow `/s/{token}/{field}` → `/s/{token}/{field}/{optionId}`, skip via `_skipped`, finish, decline
- No-JS form at `/sign?t=` → `POST /sign/submit`
- Branch detection (conflicting answers + Upstash 2s fast-sweep), transactional `SELECT … FOR UPDATE`
- Rate limits (Upstash): issue 60/h, answer 200/h, commit 20/day; over-limit writes rejected (429); `rate_limited` flag set when a token is present
- UA classification only (`/lib/ua-rules.ts`, version 1); raw UA/IP never stored
- `/record` aggregates + mosaic (`<defs>` + `<use>`), branched excluded from distributions/mosaic
- Generated `/llms.txt`, `/robots.txt`, `/data` redirect
- Drizzle schema + `drizzle/0000_init.sql`, seed (`ALLOW_SEED=1`) and nightly export Action
- Licenses: MIT (code), CC0 (`/data`)

## Defaults chosen where Rev 1 was silent

| Topic | Choice |
|---|---|
| Skip URL | `/s/{token}/{field}/_skipped` (same answer route; excluded from fast-sweep) |
| Finish URL | `/s/{token}/finish` |
| Decline storage | `answers.field = decline_reason` |
| Form blanks | No row (absent), not `_skipped` |
| `/data` target | `GITHUB_DATA_URL` env |
| Rate-limit fail-open | If Upstash env missing (local/preview), limits/sweep disabled; production fails closed (see follow-up below) |

## Dependencies added

| Package | Why |
|---|---|
| `drizzle-orm`, `drizzle-kit` | Postgres schema + queries |
| `@neondatabase/serverless`, `ws` | Neon driver with transactions / `FOR UPDATE` |
| `@upstash/redis`, `@upstash/ratelimit` | Rate limits + fast-sweep |
| `dotenv`, `tsx` | Scripts (migrate, seed, export) |

## Not done in this change (needs live services)

- Neon migrate + Upstash + Vercel env (`docs/deploy.md`)
- First successful nightly export commit against a real DB
- Curl/e2e verification against a running instance with seed data
- Final mark artwork, cold coordination test for symbols / copy tests (out of scope for v1 build; name is settled: senjafuda)

## Notes for operators

- Prefer plain `<a>` on sign links (no `next/link`) — already done.
- Next.js 16 warns that `middleware` is deprecated in favour of `proxy`; behaviour is correct today; migrate when stable.
- Set `GITHUB_DATA_URL` and Actions secrets `DATABASE_URL_READONLY`, `SITE_ORIGIN` before relying on `/data` and IA saves.

## Follow-up (2026-10-18): pnpm + fail-closed production rate limits

### 1. Switch from npm to pnpm

- Generated `pnpm-lock.yaml` via `pnpm import` from the existing `package-lock.json`, then removed `package-lock.json`.
- Pinned `"packageManager": "pnpm@10.34.7"` (current stable 10.x at implement time).
- Set `pnpm.onlyBuiltDependencies` to `esbuild`, `sharp`, `unrs-resolver` so pnpm 10 does not ignore required postinstall scripts; `pnpm install` completes with no ignored-build warnings.
- Replaced `npm` / `npx` with `pnpm` / `pnpm exec` in README, `docs/deploy.md`, script usage comments, and `.github/workflows/export.yml` (`pnpm/action-setup@v4` + `actions/setup-node` with `cache: pnpm`, `pnpm install --frozen-lockfile`).
- Verified: `pnpm build` succeeds (prebuild + Next); `pnpm db:seed` / `pnpm data:export` start under pnpm/`tsx` (fail only when DB env is unset, as expected without local secrets).

### 2. Fail closed on missing Upstash in production

Previously, missing Upstash env vars silently disabled rate limits and fast-sweep everywhere (local fail-open). That remains for local and Preview (`VERCEL_ENV` unset or `preview`). When `VERCEL_ENV === "production"`, missing **either** `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` must not ship or run unrated:

- **Build gate (C):** `scripts/check-prod-config.mjs` runs as `prebuild` / `check:prod-config`. Production builds exit non-zero if Upstash is incomplete, so Vercel does not promote the deployment.
- **Runtime (A):** `src/lib/env-guards.ts` + `getRedis()` throw on the same condition (defense in depth if env is changed after a good build). No `instrumentation.ts`.
- Logic for the build script is duplicated in the plain `.mjs` (no tsx) and kept in sync with `env-guards.ts`.

### 3. Preview must not write the production database

Rate limits stay fail-open on Preview, so a Preview deploy pointed at production Postgres would pollute the permanent record. Documented in `docs/deploy.md`: use Neon preview branching (Vercel–Neon) or a Preview-scoped `DATABASE_URL`. Optional cheap guard: if `PRODUCTION_DATABASE_URL` is set and equals `DATABASE_URL` while not in production, prebuild and `getDb()` / migrate refuse.

### 4. Canonical origin

`SITE_ORIGIN=https://senjafuda.org` in `.env.example` (with a note that the same value is required as a GitHub Actions secret for export / Internet Archive saves) and in `docs/deploy.md`.

## Follow-up (2026-10-18): seed must never touch production

### Cursor rule

Added always-on `.cursor/rules/no-prod-seed.mdc`: never run seed / write-delete scripts against production; never set `ALLOW_SEED` when `DATABASE_URL` may be production; stop and ask if unsure; production migrations only when the user explicitly asks in that message.

### `scripts/seed.ts` guards (all before any write)

- Refuse if `VERCEL_ENV === "production"`.
- Every seeded token id is prefixed with `seed_` (e.g. `seed_signed_001`). Before insert, abort if any existing `tokens.id` does **not** start with `seed_` ("database contains real entries — refusing to seed").
- Print the `DATABASE_URL` host (no credentials) and require `SEED_CONFIRM_HOST` to equal it exactly.
- Still requires `ALLOW_SEED=1`. Loads `.env.local` then `.env`.

### Docs

`docs/deploy.md` / README / `.env.example`: local `.env.local` must point at a Neon **dev** branch; seed examples include `SEED_CONFIRM_HOST`.

## Follow-up (2026-10-18): broader production env fail-closed

Extended `scripts/check-prod-config.mjs` and `src/lib/env-guards.ts` (`assertProductionConfig`): when `VERCEL_ENV === "production"`, missing **any** of `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `IP_HASH_PEPPER`, or `SITE_ORIGIN` fails the build and throws at runtime (`getDb` / `getRedis`). Same pattern as the original Upstash-only gate. Documented in `docs/deploy.md`.
