# Era 1 preview smoke (§13)

**Branch:** `era1` @ `819718d`  
**Do not merge** until Sidney approves the deploy gate.

## Pre-smoke checklist (landed on `era1`)

1. Upstash failures → soft 503 `/temporarily-closed` (nothing written); fail-closed already true.
2. `GRANT SELECT ON visits, drawings, census, canvas_state TO senjafuda_export` in `drizzle/0002_era1.sql`, guarded by role-exists check.
3. JuliaMono subset: U+25A2 (▢) and U+00B7 (·) present; advance width **1200** (same as block glyphs).
4. Pilot final README template (`scripts/export.ts`) includes: *public_ids in this archive were regenerated on 2026-10-20 after a salt rotation; earlier pilot exports in git history used different ids.*
5. `PROJECT-STATE.md` not edited by the agent (stash on `gemini-google-ua` ignored).
6. `docs/tests/` canvas perception notes committed on `era1`.

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

## Run C — fetch + protection bypass (remaining §13)

**Date:** 2026-10-21T08:50:18.021Z  
**Preview deployment:** https://senjafuda-fdj5vebrs-sdnycos-projects.vercel.app (`819718d`)  
**Method:** Node `fetch` with `x-vercel-protection-bypass` (from `.env.local`) + `x-senjafuda-test` — **not** `vercel curl` for hooks  
**Automated:** **10/10** remaining items

| Id | Result | Detail |
|---|---|---|
| 0-hook-echo | PASS | status=200 `{"ok":true,"hooks":true,"env":"preview"}` |
| 5-cell-race | PASS | cell=0,3; A→census; B→`note=taken` |
| 7-growth | PASS | fill created=12; frameSize=15 (≥7) |
| 8-sweep | PASS | parallel `/s/` hits → remint “earlier visit”; drawn cell reclaimable after sweep-exclude |
| 9-source-cap | PASS | with `x-senjafuda-test-cap: enforce`: 5 ok, 6th → `/source-cap` |
| 10-decline | PASS | decline write → thanks; decline after drawing refused |
| 11-form | PASS | `POST /sign/submit` → thanks (no JS) |
| 12-census-correction | PASS | &lt;30s different → branch; ≥30s → supersede path |
| 14-export | PASS | publicClean; throwaway age key encrypt/decrypt; sha256 matches chain line; private key deleted |
| 15-no-ip-ua | PASS | era-1 tables scanned; no IP/raw-UA-like strings |

### Run C mechanics

- Valid Preview test hooks **skip** per-source draw/decline/write caps unless `x-senjafuda-test-cap: enforce` (§13.9).
- `POST /api/test/reset-source-caps` clears this source’s Upstash counters between heavy sections.
- §14: Preview `POST /api/test/export-dry-run` builds public + sealed plaintext; smoke encrypts with local `.tools/age` + throwaway keypair (FiloSottile CLI v1.2.1, not an npm package), verifies decrypt hash, deletes the private key.
- §15: Preview `GET /api/test/scan-ip-ua` queries `visits` / `drawings` / `census` / `canvas_state`.

## Checklist (deploy gate)

- [x] 5 Same-cell race
- [x] 7 Growth to 7×7 at 12/24
- [x] 8 Sweep: 3 `/s/` hits in 2 s → branched; drawn then swept → drawing excluded
- [x] 9 Per-source drawing cap (6th refused)
- [x] 10 Decline reason write + refuse decline after drawing
- [x] 11 Form path end-to-end with JS disabled
- [x] 12 Census correction ≥ 30 s → superseded; &lt; 30 s different → branched
- [x] 14 Export dry run against preview DB (public files + sealed test recipient)
- [x] 15 No raw IP/UA in DB or exports

Run A still covers landing, signatures, remint, record/robots/llms, soft 503, CSP.

## Notes

- Preview is Vercel Authentication–protected; Run C uses Protection Bypass for Automation.
- Vercel Preview secrets cannot be pulled into this agent environment (`[SENSITIVE]`); `TEST_HOOK_SECRET` was rotated on Preview and mirrored into local `.env.local` (not committed).
- Deploy gate: Sidney approves; **do not merge**.
