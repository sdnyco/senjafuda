# Era 1 preview smoke (§13)

**Branch:** `era1` @ `54e69e4` (implementation `96ff6b7` + this smoke follow-up)  
**Do not merge** until Sidney approves the deploy gate.

## Pre-smoke checklist (landed on `era1`)

1. Upstash failures → soft 503 `/temporarily-closed` (nothing written); fail-closed already true.
2. `GRANT SELECT ON visits, drawings, census, canvas_state TO senjafuda_export` in `drizzle/0002_era1.sql`, guarded by role-exists check.
3. JuliaMono subset: U+25A2 (▢) and U+00B7 (·) present; advance width **1200** (same as block glyphs).
4. Pilot final README template (`scripts/export.ts`) includes: *public_ids in this archive were regenerated on 2026-10-20 after a salt rotation; earlier pilot exports in git history used different ids.*
5. `PROJECT-STATE.md` not edited (stash on `gemini-google-ua` ignored).
6. `docs/tests/` was not in the working tree; nothing to commit there.

## Run A — first Preview (implementation commit)

**Date:** 2026-10-20T15:39:29.992Z  
**Deployment:** https://senjafuda-ehv65ku0v-sdnycos-projects.vercel.app (`96ff6b7`)  
**Automated:** **15/17** via `vercel curl`

| Id | Result | Detail |
|---|---|---|
| 1-landing | PASS | 200; 5×5 canvas with centre `▢`; visit minted |
| 1-head | PASS | 200 |
| 2-draw-page | PASS | 200; `?` + signed pattern links |
| 2-draw-write | PASS | 302 → census |
| 2-finish | PASS | 302 → thanks |
| 2-thanks | PASS | 200; receipt / your cell |
| 3-expired-sig | PASS | 302 `note=expired` |
| 4-tampered-sig | PASS | 302; no write |
| 5-cell-race | FAIL | Both visits 302 → census — force-cell header not applied |
| 6-stale-remint | PASS | Unknown visit remints with “earlier visit” note |
| 7-growth | FAIL | `POST /api/test/fill` → 404 (hook gate) |
| 10-decline-page | PASS | 200; decline reasons listed |
| 13-record | PASS | Totals only; no `ua_class` breakdown |
| 13-robots | PASS | `User-agent: Google` + `Disallow: /s/` |
| 13-llms | PASS | Mentions canvas |
| 12-temporarily-closed | PASS | 503; “nothing was recorded” |
| 12-csp | PASS | `default-src 'self'`; `frame-ancestors 'none'` |

## Run B — smoke-script Preview (re-run after push)

**Date:** 2026-10-20T15:47:23.443Z  
**Deployment:** https://senjafuda-x0xl98hgr-sdnycos-projects.vercel.app (`54e69e4`)  
**Automated:** **10/16** via `vercel curl`

Write-path checks failed because this Preview source had already hit the **per-source drawing cap** (`/source-cap`) from Run A traffic. Treat Run A as the write-path evidence; Run B confirms landing/remint/static/503 still OK on the new deploy.

| Id | Result | Detail |
|---|---|---|
| 1-landing | PASS | 200; seed + visit |
| 1-head | PASS | 200 |
| 2-draw-page | PASS | 200 |
| 2-draw-write | FAIL | 302 → `/source-cap` (quota from prior smoke) |
| 2-finish | FAIL | no finish link (blocked by source-cap) |
| 3-expired-sig | FAIL | 302 (assertion polluted / not `note=expired`) |
| 4-tampered-sig | FAIL | 302 (same) |
| 5-cell-race | FAIL | A=302 B=302 (hooks +/or source-cap) |
| 6-stale-remint | PASS | 200; reminted |
| 7-growth | FAIL | fill status=404 created=0 |
| 10-decline-page | PASS | 200 |
| 13-record | PASS | 200 |
| 13-robots | PASS | ok |
| 13-llms | PASS | 200 |
| 12-temporarily-closed | PASS | 503 |
| 12-csp | PASS | present |

## Blockers for automated §13 items 5 & 7

Both need Preview test hooks (`x-senjafuda-test` = `TEST_HOOK_SECRET`).

- Direct `POST /api/test/fill` with the Preview secret still returns the route’s intentional **404 Not found** (hook gate), which indicates the custom header is **not reaching the app** through `vercel curl`’s forwarded `-H` flags (or the runtime secret differs from the pulled Preview env).
- Without a working hook header, forced cell assignment (§13.5) and fill-to-growth (§13.7) cannot be automated.

**Next step:** confirm header forwarding (or use protection-bypass + raw `fetch`), then re-run 5 and 7 on a fresh Preview source (or after the daily source-cap window resets).




## Run C — fetch + protection bypass (remaining §13)

**Date:** 2026-10-21T08:36:16.035Z
**Preview deployment:** https://senjafuda-qcktnoh6j-sdnycos-projects.vercel.app
**Method:** Node `fetch` with `x-vercel-protection-bypass` + `x-senjafuda-test` (no `vercel curl` for hooks)
**Automated:** **6/10** checks in this run

| Id | Result | Detail |
|---|---|---|
| 0-hook-echo | PASS | status=200 body={"ok":true,"hooks":true,"env":"preview"} |
| 5-cell-race | FAIL | A=500/ B=500/ |
| 7-growth | PASS | status=200 created=12 frameSize=9 canvas7=true |
| 8-sweep | FAIL | pre-draw-sweep=false drawn-then-swept=false |
| 9-source-cap | PASS | reset=200 outcomes=1:ok,2:ok,3:ok,4:ok,5:ok,6:cap |
| 10-decline | PASS | declineWrite=true refuseAfterDraw=true |
| 11-form | PASS | status=302 loc=cts.vercel.app/s/E67S4TYELZVAOEGFQESWIA3EOQ/thanks |
| 12-census-correction | PASS | branchLt30=true supersedeGte30=true |
| 14-export | FAIL | export exit=1 DrizzleQueryError: Failed query: select "id", "frame_size", "updated_at" from "canvas_state" where "canvas_state"."id" = $1
params: 1
    at NeonPreparedQuery.queryWithCache (/Users/sidney/Desktop/Pro |
| 15-no-ip-ua | FAIL | dbHits=visits:err/drawings:err/census:err/canvas_state:err exit=0 err=visits relation "visits" does not exist drawings relation "drawings" does not exist census relation "census" does not ex |


## Manual checks still required

- [ ] 5 Same-cell race
- [x] 7 Growth to 7×7 at 12/24
- [ ] 8 Sweep: 3 `/s/` hits in 2 s → branched; drawn then swept → drawing excluded
- [x] 9 Per-source drawing cap (6th refused)
- [x] 10 Decline reason write + refuse decline after drawing
- [x] 11 Form path end-to-end with JS disabled
- [x] 12 Census correction ≥ 30 s → superseded; < 30 s different → branched
- [ ] 14 Export dry run against preview DB (public files + sealed test recipient)
- [ ] 15 No raw IP/UA in DB or exports


## Notes

- Preview is Vercel Authentication–protected; smoke used `vercel curl`.
- Deploy gate: Sidney approves after remaining items; **do not merge**.
