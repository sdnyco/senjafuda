# Remint loop fix — preview verification (spec 004)

**Date:** 2026-11-05T13:17:00.000Z  
**Commits:** `b0ec654` (R2) on `remint-loop-fix`  
**Preview deployment:** https://senjafuda-9c9dv0mmb-sdnycos-projects.vercel.app  
**Method:** Node `fetch` + protection bypass + test hooks (`scripts/era1-smoke.mjs`)

## Spec 004 checklist

- [x] 1 Stale draw → one signed `/fresh`, zero pattern links, no remint
- [x] 2 Stale write → redirect to draw stale page, no remint
- [x] 3 Fresh within TTL → new visit, 16 pattern links
- [x] 4 Fresh expired → HTML dead end, no signed links, no `/`
- [x] 5 Late crawler: follow all stale-page links after TTL → zero new visits
- [x] 6 Normal flow + expired sig on own visit → re-render, no remint
- [x] 7 Fast crawler depth-3 → ≤ 3 visits (one per generation); gen1 size = 1
- [x] 8 Duplicate fresh → one child; later responses are child stale
- [x] 9 Concurrent fresh → exactly one child (`created+stale`)
- [x] `/llms.txt` new line; production `/api/test/*` → 404

## Automated results

**20/20** checks passed (spec 004 remint **9/9**).

| Id | Result | Detail |
|---|---|---|
| 0-hook-echo | PASS | hooks=true env=preview |
| 5-cell-race | PASS | |
| 7-growth | PASS | at 11 → 5; at 12 → 7 |
| 8-sweep | PASS | branched → stale page; swept reclaimable |
| 9-source-cap | PASS | 5 ok, 6th cap |
| 004-1-stale-draw | PASS | |
| 004-2-stale-write | PASS | |
| 004-3-fresh-ok | PASS | 16 patterns |
| 004-4-fresh-expired | PASS | |
| 004-5-crawler | PASS | minted=0 |
| 004-6-normal | PASS | |
| 004-7-fast-crawler | PASS | minted=3 gen1=1 chain=true |
| 004-8-duplicate-fresh | PASS | created then stale+stale; 1 child |
| 004-9-concurrent-fresh | PASS | created+stale; 1 child |
| 10-decline | PASS | |
| 11-form | PASS | |
| 12-census-correction | PASS | |
| 14-export | PASS | |
| 15-no-ip-ua | PASS | |
| prod-test-routes-404 | PASS | |

## Notes

- Migration `0003_inherited_from_unique` applied on Preview build (dedupe then unique partial index).
- R2 turns fast-crawler fan-out into a chain (≤1 child per parent).
