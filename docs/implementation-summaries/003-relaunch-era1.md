# Implementation summary — 003 relaunch era 1

**Date:** 2026-10-20  
**Spec:** `/docs/specs/003-relaunch-era1-spec.md` (including Revision 1)  
**Branch:** `era1`

## What shipped (code complete; preview smoke pending)

Era 1 replaces the pilot visitors’-book flow with the shared canvas. Pilot tables (`tokens` / `answers`) are untouched; the app stops writing to them.

### Data

- Additive migration `drizzle/0002_era1.sql`: `visits`, `drawings` (partial unique on valid `x,y`), `census` (`id bigserial`), `canvas_state`, seed row + `frame_size=5`, `updated_at` triggers.
- Vocab: `/content/vocab/era1.json`.

### Font

**JuliaMono** (OFL), subset `public/fonts/JuliaMono-Canvas.woff2` (~15KB).

- Covers U+2580–U+259F, U+00B7 (·), U+25A2 (▢), digits, `?`.
- Re-checked 2026-10-20: U+25A2 and U+00B7 are present and share advance width **1200** with the block glyphs (U+2580, U+2588, U+2596, U+259A, …).
- Chosen over JetBrains/Fira because block/quadrant coverage + single width are required for the canvas; full Regular is huge, so a subset is self-hosted via `next/font/local`.

### Flow

- Signed links (R6 HMAC), 5 min link / 15 min form TTL.
- Remint scope R1/R2; decline in `census` as `decline_reason`; rate-limit matrix R4.
- Canvas render R12; growth + unique-violation cell race R7/R10.
- Pages: `/`, draw/census/finish/decline/thanks/fresh, `/sign`, `/record` (totals only), `/llms.txt`.
- Security: `x-real-ip` preference, IPv6 /64, CSP headers, `LINK_SIGNING_SECRET` + `EXPORT_ID_SALT` in prod gate, custom error pages.
- Export: era1 public files + optional `age` sealed deltas + `chain.txt`; `PILOT_FINAL=1` for archive; no `DATABASE_URL` fallback.
- Preview hooks: R16 headers + `POST /api/test/fill`; smoke scaffold `scripts/era1-smoke.mjs`.

## Operator steps before merge

1. Set Preview + Production env: `LINK_SIGNING_SECRET`, `EXPORT_ID_SALT` (Production = Actions salt), optional `TEST_HOOK_SECRET` on Preview only.
2. Deploy Preview (Neon branch migrates `0002_era1.sql`).
3. Grant `senjafuda_export` SELECT on new tables (see `docs/deploy.md`).
4. Run §13 smoke; document in `docs/debug-investigations/003-era1-preview-smoke.md`.
5. After Production deploy: workflow_dispatch with `pilot_final=true`; place `/seal/age-recipient.txt` when ready for sealed encrypt.

## Deviations / notes

- Form census preserve-on-cell-taken uses query params (R11).
- Upstash hard failures are not yet mapped everywhere to a dedicated 503 page (most paths fail open locally / throw in production via existing guards).
- Pilot `scripts/seed.ts` still targets pilot tables (unused by the live app).
- Full §13 checklist not executed in this change (needs Preview).

## Dependencies

None added (JuliaMono is a vendored font file, not an npm package).
