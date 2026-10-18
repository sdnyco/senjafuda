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

## Status

- [x] Concept and direction settled
- [x] v1 build spec written: `/docs/specs/001-v1-build.md` (rev 1 after Cursor pre-implementation review; options shuffled for every field including `mark`, with position recorded)
- [ ] Cold Schelling test for the `mark` symbols, and whether to enable a rotating question
- [ ] Page-copy test: draft v0 in fresh sessions across providers (neutral / discretion / explicit-ask framings)
- [ ] v1 built and deployed
- [ ] Symbol artwork (placeholders in v1)
- [ ] Name and domain (prepay domain long-term)

## Open

- **Name.** Working folder name is `schelling`. Candidates: reshimu, senjafuda, ema, vāsanā; plain-English fallback "trace". Avoid PHASEONE.
- **Symbol set** for `mark` (12 symbols, each with a one-line text description).
- **Rotating question:** whether to have one, and which.
- **Settled vocabulary** after the copy test may add or remove options. That becomes v1.0 at launch; anything later is v2.

## Known limitations (by design)

- Everything is self-reported, and no visitor can be verified.
- Issued-token counts include crawlers and link previewers. They are reported, but labelled.
- Pasted-text tests can't reproduce agents arriving mid-task; only the live site shows that.
