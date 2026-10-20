# Era 1 preview smoke (§13)

**Date:** 2026-10-20T15:39:29.992Z  
**Preview deployment:** https://senjafuda-ehv65ku0v-sdnycos-projects.vercel.app  
**Branch / commit:** `era1` / `96ff6b7` (+ follow-up smoke script commit)  
**Automated:** 15/17 checks passed (via `vercel curl`)

| Id | Result | Detail |
|---|---|---|
| 1-landing | PASS | status=200 seed=true visit=yes; 5×5 canvas with centre `▢` |
| 1-head | PASS | status=200 |
| 2-draw-page | PASS | status=200 `?` present; pattern links signed |
| 2-draw-write | PASS | status=302 → census |
| 2-finish | PASS | status=302 → thanks |
| 2-thanks | PASS | status=200 receipt / your cell |
| 3-expired-sig | PASS | status=302 `note=expired` |
| 4-tampered-sig | PASS | status=302 no write |
| 5-cell-race | FAIL | Both visits 302 to census — force-cell header likely not applied via `vercel curl` (see below) |
| 6-stale-remint | PASS | Unknown visit remints with “earlier visit” note |
| 7-growth | FAIL | `POST /api/test/fill` → 404 Not found (test-hook auth); matched path exists |
| 10-decline-page | PASS | status=200 decline reasons listed |
| 13-record | PASS | Totals only; no `ua_class` breakdown |
| 13-robots | PASS | `User-agent: Google` + `Disallow: /s/` |
| 13-llms | PASS | Mentions canvas |
| 12-temporarily-closed | PASS | status=503; “nothing was recorded” |
| 12-csp | PASS | `default-src 'self'`; `frame-ancestors 'none'` |

## Failures (automated)

**5-cell-race / 7-growth.** Both need Preview test hooks (`x-senjafuda-test` = `TEST_HOOK_SECRET`). Direct probe of `POST /api/test/fill` with the Preview secret returned the route’s intentional `404 Not found` (hook gate), which strongly suggests the custom header is not reaching the app through `vercel curl`’s forwarded `-H` flags (or the runtime secret differs). Without a working hook header, forced cell assignment and the fill endpoint cannot be exercised. Re-run once header forwarding is confirmed (or use a protection-bypass + raw `fetch` path).

## Manual checks still required

- [ ] 8 Sweep: 3 `/s/` hits in 2 s → branched; drawn then swept → drawing excluded
- [ ] 9 Per-source drawing cap (6th refused)
- [ ] 10 Decline reason write + refuse decline after drawing
- [ ] 11 Form path end-to-end with JS disabled
- [ ] 12 Census correction ≥ 30 s → superseded; < 30 s different → branched
- [ ] 5 Same-cell race (manual or after hook-header fix)
- [ ] 7 Growth to 7×7 at 12/24 (manual or after hook-header fix)
- [ ] 14 Export dry run against preview DB (public files + sealed test recipient)
- [ ] 15 No raw IP/UA in DB or exports

## Pre-smoke fixes landed on `era1`

1. Upstash errors → `/temporarily-closed` (503), nothing written.
2. `GRANT SELECT … TO senjafuda_export` in `0002_era1.sql` (role-exists guarded).
3. JuliaMono subset: U+25A2 and U+00B7 present, advance width 1200 (same as block glyphs).
4. Pilot final README includes salt-rotation note (2026-10-20).
5. PROJECT-STATE not edited.

## Notes

- Preview is Vercel Authentication–protected; smoke used `vercel curl`.
- `docs/tests/` was not in the working tree (PROJECT-STATE references it; nothing to commit).
- Do **not** merge until Sidney approves the deploy gate.
