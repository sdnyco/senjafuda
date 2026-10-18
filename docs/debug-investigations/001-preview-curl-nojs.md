# Debug investigation — Preview curl / no-JS smoke

**Date:** 2026-10-18  
**Target:** Vercel Preview for git branch `preview-test`  
**URL used:** `https://senjafuda-git-preview-test-sdnycos-projects.vercel.app` (redeploy after env fix)  
**DB:** Neon branch `preview/preview-test` (data+schema copy of `main`; not empty)  
**Auth:** `x-vercel-protection-bypass` on every request (automation bypass secret from `vercel project protection`)  
**Seed:** not run

## Blocker found and fixed before tests

Initial Preview deployment returned **500** on `GET /` with runtime log:

`Error: IP_HASH_PEPPER is not set`

Upstash is configured on Preview, so rate-limit code hashes the client IP and requires `IP_HASH_PEPPER`. That var was Production-only.

**Fix applied:** added Preview secrets via CLI (new Preview-only pepper; also `SITE_ORIGIN` and `GITHUB_DATA_URL` for parity), then redeployed the Preview deployment so the running revision picked them up.

## Method

- HTTP: `curl`/`fetch` with bypass header; redirect-manual for answer/finish/decline/form.
- SQL: `neonctl connection-string` for `preview/preview-test` under Neon org `Vercel: sdnyco's projects` / project `neon-orange-book` (Vercel API cannot decrypt Sensitive env values).

## Results (28/28 pass)

| # | Check | Result |
|---|---|---|
| 1a | `GET /` → 200 | PASS |
| 1b | `Cache-Control` includes `no-store` | PASS (`private, no-cache, no-store, max-age=0, must-revalidate`) |
| 1c | Two GETs → two different tokens | PASS |
| 1d | Token rows created | PASS (`issued`) |
| 1e | `HEAD /` → no new token row | PASS (count unchanged) |
| 2a | Link flow finish → `signed` | PASS |
| 2b | Skip writes `_skipped` row | PASS (`decider`) |
| 2c | `position` stored matches shuffle | PASS |
| 2d | Replay answer → already recorded | PASS |
| 2e | Replay adds no rows | PASS |
| 3a | Decline → `declined` | PASS |
| 3b | Earlier answer kept | PASS |
| 3c | `decline_reason` stored | PASS |
| 4a | Form → `signed` | PASS |
| 4b | Blanks write no row; `path=form` | PASS (only `mark`, `arrival`) |
| 5a | Two options same step → `branched` | PASS |
| 5b | 3 option hits within ~2s → `branched` | PASS |
| 6a | Two tokens, different `mark` orders | PASS (12 options) |
| 6b | Meta options last (`arrival`) | PASS (`dont_know`, `prefer_not`) |
| 6c | HTML order matches deterministic seed | PASS |
| 7a | `/record` HTML totals (no-JS content) | PASS |
| 7b | Statuses including branched in totals | PASS |
| 7c | Copy notes branched excluded from distributions/mosaic | PASS |
| 7d | `/robots.txt` disallows `/s/` and `/sign` | PASS |
| 7e | `/llms.txt` renders | PASS |
| 8a | Schema has no raw IP/UA columns | PASS (only `ua_class` / `ua_family` enums) |
| 8b | Sampled UA fields are enums, not raw strings | PASS |

Rate-limit exhaustion was skipped (as requested).

## Cleanup (this session)

- Deleted git branch `preview-test` (local + `origin`).
- Removed three Vercel Preview deployments (`9ishlc83z`, `of44v7hf8`, `kk8r102m2`); only Production deployments remain.
- Neon: after ~30s, `preview/preview-test` was **gone**. Remaining branches: `main`, `dev`. Integration cleaned up without manual delete.

## Follow-ups for operators

1. Keep `IP_HASH_PEPPER` on **Preview** (and Development) whenever Upstash is present — otherwise Preview 500s on mint.
2. Prefer git-branch Preview aliases (`*-git-preview-test-*`) so Neon preview branching stays bound to the deployment under test.
