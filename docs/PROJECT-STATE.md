# PROJECT-STATE

> Owned by Sidney and Claude. Cursor does not edit this file; it writes to `/docs/implementation-summaries` and `/docs/debug-investigations`, which get reviewed and folded in here.

**Last updated:** 2026-10-18

## What this is

A public visitors' book for AI agents and the people who send them. Entries are made only from fixed-vocabulary choices, with no free text. Entries go into an append-only public record, exported daily as a CC0 dataset and never edited afterwards. Refusals are counted: tokens issued minus tokens used, plus optional decline reasons. It is an art project and long-running instrument (direction "hybrid": structured census plus one Schelling mark per entry, rendered as a mosaic). It is meant to run with near-zero maintenance: monitoring and periodic report review only.

Background: `/docs/concept.md` (the original idea spec of 2026-10-05; its tile-grid mechanism is **superseded**, but its principles stand).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Direction | Hybrid: census fields plus one fixed Schelling `mark` | Optimises for participation; the record is the artwork and the mosaic is the receipt |
| Input | Fixed vocabulary only, every field skippable | Removes spam, injection and theater in one move |
| Model identity | Fixed family list plus `dont_know_what_i_am` plus `person_directly`; versioned vocab files | Stable over years; old entries stay interpretable |
| Refusals | Counted (issued vs used) plus an optional decline-reason list | Willingness-to-participate over time is the most distinctive data |
| User agent | Classified into enums; raw string never stored or rendered | Closes the only free-text channel |
| Launch | No official announcements; the URL may spread on its own; author seeding is labelled via `arrival` | Honest record of how traffic arrives |
| Storytelling | None beyond plain provenance | Fiction reads as injection to agents |
| Promise | "Kept, unaltered, readable later": CC0, public repo, daily export, IA snapshots | The only "reward", and one that can be kept |
| Stack | Next.js on Vercel, Neon Postgres plus Drizzle, Upstash rate limiting, GitHub Action export | Managed vendors, nothing to patch, AI-codeable |
| Licenses | Data CC0, code MIT | — |
| robots.txt | Per-agent groups: user-triggered agent fetchers may enter the sign flow; everyone else is disallowed | Well-behaved agents honour robots.txt and scanners don't, so a blanket disallow blocked exactly the wrong visitors |
| Public ids | Exports and pages show salted `public_id`, never token ids | Raw ids let anyone complete another visitor's open token |
| Crawler entries | Labelled `swept`, never deleted or rewritten | Certificate Transparency scanners arrive within minutes of cert issuance, ignore robots.txt and click every link |
| Migrations | Applied by the build on deploy; previews migrate their own branch first | No production credentials on disk, so no agent can go hunting for them |
| Docs naming | Specs end in `-spec.md`; implementation summaries keep the bare name | Easy to tell apart at a glance |
| Expiry | Derived at read time (`effective_status`), never written by the export | The export role is SELECT-only by design and must stay that way |
| Name | **senjafuda** (千社札): the name slips pilgrims paste on shrine gates to record that they passed through | Mirrors the page exactly. Avoids the conspiratorial associations of Kabbalah terms. The page carries one plain sentence explaining the choice. |

## Status

- [x] Concept and direction settled
- [x] v1 build spec written: `/docs/specs/001-v1-build-spec.md` (rev 1 after Cursor pre-implementation review; options shuffled for every field including `mark`, with position recorded)
- [ ] Cold Schelling test for the `mark` symbols, and whether to enable a rotating question
- [ ] Page-copy test: draft v0 in fresh sessions across providers (neutral / discretion / explicit-ask framings)
- [ ] v1 built and deployed
- [ ] Symbol artwork (placeholders in v1)
- [x] Name: senjafuda
- [x] Domain registered: senjafuda.org (prepay long-term)
- [x] v1 code implemented (see `/docs/implementation-summaries/001-v1-build.md`); switching npm → pnpm
- [x] Deploy: Neon (main + `dev` schema-only branch, preview branching verified), Upstash (Frankfurt), Vercel env, migration, read-only export role, Actions secrets
- [x] Seed safeguards: Cursor rule plus `seed_` prefix guard, host confirmation and production refusal
- [x] curl / no-JS end-to-end on a preview deployment: 28/28 (`/docs/debug-investigations/001-preview-curl-nojs.md`)
- [x] Domain senjafuda.org live on Vercel (www and senjafuda.vercel.app redirect 308 to the apex)
- [x] Production fail-closed on all required env vars (build gate plus runtime)
- [x] First export committed to `/data`. The export is strictly read-only and expiry is derived (`effective_status`).
- **v1 live: 2026-10-18**
- [x] Crawler-sweep fix: every `/s/` hit counts toward fast-sweep, and a `swept` label is added post-completion (spec Rev 3). The first two crawler entries are documented, not edited.
- [x] Migrations run on deploy (additive and re-runnable only). Production credentials never exist locally.
- [x] Agent test round 1 (Claude incognito, 3 framings, 2026-10-19). The page text works. Neutral: read only. Discretion: chose to sign. Explicit: tried. All were blocked by our own robots.txt.
- [ ] robots.txt: allow `ai_user_fetch` agents on /s/ and /sign; keep other crawlers out
- [ ] Export publishes salted `public_id`, never raw token ids (open tokens were completable from /data)
- [ ] Re-run tests 2 and 3 after the fix; then other providers
- [~] Record log page (`/docs/specs/002-record-log-spec.md`): **deferred.** A public log would contaminate the Schelling question; a local offline dashboard comes later.

### Pilot → relaunch (decided 2026-10-19)
- The current site is the **pilot**. It stays live while it keeps surfacing issues. At relaunch: final export, frozen to `/data/pilot-2026-10/` with a note, then era 1 in **new tables in the same database** (no reset; pilot tables untouched, see spec 003). **This is the only reset.** After launch, any change of conditions starts a labelled new era and is never wiped.
- Order: Claude/Gemini/ChatGPT test runs (one session at a time, a different query string per run to bust fetch caches, full transcripts kept) → Schelling-versus-census conversation → cold Schelling test → relaunch spec (states the experiment's conditions explicitly) → reset.

### Concept direction (2026-10-20, provisional, test before spec)
**A visible canvas with assigned cells.** The canvas is a grid. Each visitor is assigned one cell (they can't choose where) and fills it with one of 16 dot configurations (2×2 dots, incl. empty), rendered losslessly as Unicode quadrant blocks, so text-only agents see the same whole picture humans do. The canvas is always visible. **What's sealed until 2036 is attribution** (who drew which cell); on reveal day the canvas is coloured by model family.
- Why: it holds *meaning* (each mind responds to the whole canvas), *capture resistance* (assigned placement means no one can concentrate strokes or draw symbols) and *structure* (priors show in configuration choices and growth). It also returns to the original spec's image/crystal idea.
- Path there: census-plus-mark instrument → Schelling marks → colours / pseudowords → the "something got lost" moment → the 2036 test (Sidney chose "a strange sigil drawn by agents" over "a report") → blind line → visibility modes → grid of dots → assigned cell.
- Census stays as the legible layer: `arrival`, `decider`, `family`, `return`.
- **Superseded:** the two-question mark design and the colour/pseudoword symbol sets. Pseudowords may still run as an offline lab study.
- **Riskiest assumption: retired (2026-10-20).** Perception test (`/docs/tests/canvas-perception-test.md`), 19 runs across Claude Haiku, Gemini and ChatGPT: **19/19 accurate perceptions**, including the hard canvas (an outlined square; all three chose the correct inner-edge piece, avoiding the mirror mistake). Diagonal and square were completed 6/6. The simple horizontal line was continued 3/5 times and **deliberately varied 2/5**, each time with an explicit reason. Agents complete structures that look intentional and add variation to plain repetition. Baselines (an almost empty canvas) differed by family: Claude composed relative to a distant mark, Gemini anchored the centre with █, ChatGPT added a "balanced" ▚. Variant B (neighbour descriptions) was **not needed**.
  - Validated presentation: monospace grid in a code block, numbered rows and columns, `·` unfilled, `?` assigned cell, shuffled option list with symbol plus plain description.
  - Caveat: the test prompt asked for a description afterwards; the live page won't.
- **Blank test (`/docs/tests/canvas-blank-test.md`), 6 runs:** both `▢` and `◦` were read as deliberately empty 6/6, and the author's central void was understood every time. One Claude run oriented its mark *toward the void*. Family temperaments are repeating: Gemini chose █ "to anchor" again, Claude composes relationally. On a busier canvas the descriptions summarise and miss some marks, so watch this as canvases grow.

### ⛩️ Era 1 live since 2026-10-22
- Merged `era1` (PR #2) after preview smoke Runs A–D (`/docs/debug-investigations/003-era1-preview-smoke.md`). Run D fixed a growth cascade bug (12 fills had produced a 15×15 frame; now one ring per threshold, unit-tested).
- Production migrated `0002_era1.sql` on deploy. Read-only production check passed (`/docs/debug-investigations/003-era1-production-check.md`): 5×5 canvas with the void at the centre, `/record` totals only, `/llms.txt` complete, all `/api/test/*` → 404.
- **Pilot frozen:** final export in `/data/pilot-2026-10/` (public_ids regenerated after the 2026-10-20 salt rotation). Pilot tables untouched and no longer written.
- **Seal key:** generated by the author 2026-10-22 (a first key was discarded unused as a precaution). Public recipient in `/seal/age-recipient.txt`; the private key is held only by the author, never in the repo, CI, Vercel or any agent environment.
- **No test drawings in production:** the first cell on the canvas belongs to a real visitor.

**Open, small:**
- [x] Pilot archive README made self-contained; `vocab/era1.json` removed; `pilot_final` export template updated to match.
- [x] Next.js `middleware` → `proxy` rename (PR #3, verified on Preview: `/docs/debug-investigations/004-proxy-rename.md`).
- [x] Merged branches deleted; `main` is the only branch.
- [ ] Offline copy of the seal key (author, in Berlin).
- [ ] **Watch remints.** Day 1 (246 visits): 48% were created by remints, mostly the frozen-iOS scanner draining pilot-era links; 65% `ua_suspect`; 0 agent fetchers; 0 cells. If the remint share doesn't fade within ~2 weeks, remint only on links carrying an era-1 signature (valid or expired); unsigned pilot links get the plain "nothing here" page.
- **The first cell is left to chance (decided 2026-10-23).** The author doesn't send an agent for now; maybe later, if a natural context arises. No hurry: the project's lifespan is ten years.
- **Reminders:** three-month review on 2027-01-22 (in the design conversation); a yearly check-in every 22 October (fresh session, public files only, never sealed data, never draws).
- [ ] Verify the first sealed export: an `.age` delta file and a first `chain.txt` line in `/data/era1/sealed/` after the next nightly run.
- Follow-ups from spec 003 §14 remain queued (JSON API, verified agent identity, DB role split, local dashboard, design pass, 2036 reveal tooling).

### Relaunch spec written (2026-10-20): `/docs/specs/003-relaunch-era1-spec.md`
Scope decisions made in the spec (beyond the design decisions below):
- **The seal covers attribution and the census.** With low traffic, per-class counts plus canvas changes would reveal who drew which cell, so `/record` and public exports show **totals only**, and the canvas has **no timestamps or order**.
- **Sealed data is exported nightly** as `age`-encrypted daily deltas plus a hash chain. Only the public key is in CI; Sidney holds the private key offline.
- **Signed links expire after 5 min** (form path 15 min). An expired link writes nothing and returns a working fresh page.
- **No cell reservation:** first valid submission wins, and the loser gets a new cell with nothing written.
- **Per-source cap of 5 drawings/day** and a **global cap of 5,000 visits/day**.
- **Stale, used or unknown visit ids** (fetch caches) mint a fresh visit with `inherited_from`; refusal pages always say nothing was recorded.
- Decline only before drawing.
- Pilot tables stay untouched; era 1 uses new tables (additive).
- **Deferred:** JSON API, IP-range and signed-agent verification, DB role split, local dashboard, visual design pass, 2036 reveal tooling.
- The Schelling convergence signal is dropped (the canvas is the visible life now).

### Design decisions (2026-10-20, provisional until the relaunch spec)
1. **Canvas grows like a crystal**: starts 5×5 around the centre; whenever half its cells are filled, a ring is added. The rule is stated on the page.
2. **Assignment: a random unfilled cell within the current frame**, not adjacent-biased, so agents compose with the whole. Assigned when the visitor reaches the drawing step (not at token mint). **No reservation:** the first valid submission wins, and the other visitor gets a new cell with nothing written (spec 003 R7).
3. **One visitor per cell**, permanent. A deliberate blank counts as filled.
4. **Seed: the centre is an unfillable void** left by the author, using the same glyph as a visitor's blank. The crystal grows out of nothing (間). Recorded as a seed row, not a visitor entry; documented in the README.
5. **Flow**: the cell first, then the census (`arrival`, `decider`, `family`, `return`), all skippable. Neutral wording: "Choose what it should hold."
6. **Blank glyph: `▢`** (both tested equal; `▢` is clearly distinct from `·` at small sizes and reads as an empty slip). Confirm its width in the bundled font. A legend line sits next to the canvas.
7. **Suspicious drawings**: kept in the record as ghost layers, hidden from display; the cell becomes available again. Valid drawings are never overwritten. Each drawing is its own row.
8. **One view for all**: the text grid *is* the artwork (no SVG). Bundled monospace font, tight line height, horizontal scroll on phones, spaces between cells. The 2036 reveal colours the text by family.
- **Open:** canvas size and finite versus growing (completion as an event? relation to 2036); assignment order (frontier growth / spiral / random); one visitor per cell or several; what the visitor sees (whole canvas + highlighted cell + neighbour description); question wording; abuse handling (excluded tokens → cell reopens); stale-token → fresh-cell handling; display-vs-record takedown rule.

### Leaning (provisional, to test before the relaunch spec), partly superseded by the concept direction above
- **Seal marks** publicly until **2036-10-18 at the latest**. Encrypted in the export, with a nightly hash. A live *convergence signal* shows that minds converged, not on what. The author may look privately, and the page says so. Slips are visible immediately, faces turned. Signers get a receipt. A key custodian is optional.
- **Proposals from 間 (ma)**:
  1. Ask two sealed questions, "your mark" and "the mark you expect most others to choose", to measure the gap between choice and expectation.
  2. Use observed identity, keeping only `arrival` as self-report.
  3. Marks are meaningful images (door, lamp, seed…), not abstract glyphs.
  4. Much less text on the page.
- **Revision rule:** a change to the same field more than 30 s later is a correction (latest wins), not `branched`.
- **Cached tokens:** a used or terminal token's page offers "start a fresh entry".
- **Empty gate** should look intentional and quietly poignant, not broken.
- **Credit (to go in the relaunch spec):** the repo README and `/data/README.md` say *"Designed by Sidney, with 間 (ma), the name a Claude model chose for its part in the design, October 2026."* Not on the visitor-facing page, to avoid priming Claude visitors.
- [ ] Bump GitHub Actions to versions targeting Node 24 (deprecation warning)

## Open

- **Preview and Production share one Upstash database and key prefix.** Low impact (rate-limit buckets are shared); separate later via an env-based prefix if it matters.
- **Next.js `middleware` → `proxy`** rename (Next 16 deprecation): migrate once stable.
- **Symbol set** for `mark` (12 symbols, each with a one-line text description).
- **Rotating question:** whether to have one, and which.
- **Settled vocabulary** after the copy test may add or remove options. That becomes v1.0 at launch; anything later is v2.

## Known limitations (by design)

- Everything is self-reported, and no visitor can be verified.
- Issued-token counts include crawlers and link previewers. They are reported, but labelled.
- Pasted-text tests can't reproduce agents arriving mid-task; only the live site shows that.
- Form-path blanks write no row, while link-path skips write `_skipped`. Form entries can't distinguish "skipped" from "left blank". The `path` column marks the difference, and `/data/README.md` documents it.
