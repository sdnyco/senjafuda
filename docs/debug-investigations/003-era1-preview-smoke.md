# Era 1 preview smoke (§13)

**Branch:** `era1` @ `e26285d` (+ Run D report commit)  
**Do not merge** until Sidney approves the deploy gate.

## Pre-smoke checklist (landed on `era1`)

1. Upstash failures → soft 503 `/temporarily-closed` (nothing written); fail-closed already true.
2. `GRANT SELECT ON visits, drawings, census, canvas_state TO senjafuda_export` in `drizzle/0002_era1.sql`, guarded by role-exists check.
3. JuliaMono subset: U+25A2 (▢) and U+00B7 (·) present; advance width **1200** (same as block glyphs).
4. Pilot final README template (`scripts/export.ts`) includes: *public_ids in this archive were regenerated on 2026-10-20 after a salt rotation; earlier pilot exports in git history used different ids.*
5. `PROJECT-STATE.md` not edited by the agent (stash on `gemini-google-ua` ignored).
6. `docs/tests/` canvas perception notes committed on `era1`.
7. `.tools/` is gitignored (FiloSottile `age` / `age-keygen` local only; not tracked).

## Run A — first Preview (implementation commit)

**Date:** 2026-10-20T15:39:29.992Z  
**Deployment:** https://senjafuda-ehv65ku0v-sdnycos-projects.vercel.app (`96ff6b7`)  
**Automated:** **15/17** via `vercel curl`

Core write path, signatures, remint, record/robots/llms, soft 503, CSP passed. Cell-race and growth failed because hooks did not reach the app via `vercel curl`.

## Run B — smoke-script Preview (re-run after push)

**Date:** 2026-10-20T15:47:23.443Z  
**Deployment:** https://senjafuda-x0xl98hgr-sdnycos-projects.vercel.app (`54e69e4`)  
Write-path checks hit `/source-cap` from Run A traffic. Landing/remint/static/503 still OK.

## Run C — fetch + protection bypass (remaining §13)

**Date:** 2026-10-21T08:50:18.021Z  
**Preview:** https://senjafuda-fdj5vebrs-sdnycos-projects.vercel.app  
**Automated:** **10/10** remaining items via `fetch` + bypass + hooks.

Growth asserted `frameSize ≥ 7` only — that hid a cascade bug (12 fills → frameSize **15**).

## Run D — growth fix, prod test-route 404s, superseded query

**Date:** 2026-10-21T09:07:20.196Z  
**Preview:** https://senjafuda-jfrep4jpc-sdnycos-projects.vercel.app (`e26285d`)  
**Automated:** **11/11**

| Id | Result | Detail |
|---|---|---|
| 0-hook-echo | PASS | hooks reach Preview |
| 5-cell-race | PASS | forced cell; B → `note=taken` |
| 7-growth | PASS | fixture reset; at 11 → frameSize **5**; at 12 → frameSize **7** exactly |
| 8-sweep | PASS | parallel hits → remint; drawn cell reclaimable after exclude |
| 9-source-cap | PASS | enforce: 5 ok, 6th → `/source-cap` |
| 10-decline | PASS | write + refuse after drawing |
| 11-form | PASS | `POST /sign/submit` → thanks |
| 12-census-correction | PASS | branch &lt;30s; ≥30s supersede with **supersededRows=1** (queried) |
| 14-export | PASS | publicClean; age encrypt/decrypt; hash matches chain |
| 15-no-ip-ua | PASS | no IP/raw-UA-like strings in era-1 tables |
| prod-test-routes-404 | PASS | all `/api/test/*` → **404** on https://senjafuda.org |

### Growth bug (fixed)

`applyGrowthRule` used `while (count >= growthThreshold(s)) s += 2`, so a large visitor count cascaded through every ring in one call. Now `nextFrameSizeAfterDrawing` grows **at most one +2** per drawing when the **current** frame threshold is met. Unit tests: `pnpm test` (`src/lib/canvas-growth.test.ts`) cover 5→7→9→11 at exact thresholds and no growth one below, plus the cascade regression.

### Production test routes

Every `/api/test/*` handler calls `refuseProductionTestRoute()` first (`VERCEL_ENV === 'production'` → 404) before reading headers or other env. Smoke hits production and asserts 404.

## Checklist (deploy gate)

- [x] 5 Same-cell race
- [x] 7 Growth to 7×7 at 12/24 (`frameSize === 7`)
- [x] 8 Sweep
- [x] 9 Per-source drawing cap
- [x] 10 Decline write + refuse after drawing
- [x] 11 Form path (POST, no JS)
- [x] 12 Census correction (+ superseded row queried)
- [x] 14 Export dry run + age
- [x] 15 No raw IP/UA
- [x] Production `/api/test/*` → 404

## Notes

- Preview uses Protection Bypass for Automation + `TEST_HOOK_SECRET` in local `.env.local` (not committed).
- Deploy gate: Sidney approves; **do not merge**.
