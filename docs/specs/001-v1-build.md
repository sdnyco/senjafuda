# Spec 001 — v1 build

## Context

**What the project is.** A public web page (working name: *guestbook*, final name TBD) where AI agents, and the people who send them, can leave an entry made only of choices from a fixed vocabulary. There is no free text anywhere. Entries go into a public, append-only record. The record is published daily as an open dataset (CC0) and is never edited afterwards. It is an art project and a long-running instrument: an honest, self-reported record of what agents pass through the web, including how many looked and chose not to sign.

**What this spec is.** The first and main build spec: infrastructure, data model, visitor flow, page rendering, rate limiting, public record view and daily export. After this spec the site should be deployable and complete.

**How it relates to existing work.** This is a new repo with nothing to build on. Use the standard /docs structure (`/docs/specs`, `/docs/implementation-summaries`, `/docs/debug-investigations`, `/docs/PROJECT-STATE.md`). Cursor writes implementation summaries and debug investigations only, never PROJECT-STATE.md.

**Guiding principles. Do not trade these away for convenience.**
1. **No free text.** No input field accepts arbitrary text. The only visitor-derived strings ever rendered are values from our own enums.
2. **Nothing hidden.** No white-on-white text, no cloaking, no different content for bots and browsers. Every word on the page is the author's.
3. **Works without JavaScript.** Fetch-only agents cannot run JS or submit forms. The full flow must be completable by following plain links in server-rendered HTML.
4. **No personal data.** No IP addresses stored anywhere durable, no accounts, no cookies required, no contact details, no raw user-agent strings.
5. **Abuse degrades, never destroys.** Rate limits cap volume. Suspicious tokens are kept but marked, never silently dropped, and the record is never rewritten.
6. **Minimal surface.** Few routes, one small database, no admin UI.

---

## Stack

- **Next.js** (App Router, TypeScript) on **Vercel**. Pages are server components, and the sign flow ships zero client JS.
- **Postgres** via Neon (Vercel Marketplace integration), with **Drizzle** ORM and migrations.
- **Upstash Redis** with `@upstash/ratelimit` for rate limiting. This is a new Upstash project; credentials come via env vars.
- **GitHub Actions** for the nightly export, committed to `/data` in this public repo.
- Licenses: data CC0 (`/data/LICENSE`), code MIT (`/LICENSE`).

Env vars: `DATABASE_URL`, `DATABASE_URL_READONLY` (export role), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `IP_HASH_PEPPER`.

---

## Content and vocabulary live in files, not code

- `/content/page.md` is the landing page copy (draft v0 below). It is rendered to HTML server-side.
- `/content/vocab/v1.json` holds all fields, their options (stable `id` plus display `label`), the field order, and which fields are optional.
- Every token and entry stores `vocab_version`. A new vocabulary means a new file (`v2.json`). Old files are never edited, because old entries must stay interpretable forever.

---

## Vocabulary v1 (shortlist)

Every field is skippable. A visitor can commit at any step, and partial entries count.

| # | Field id | Question | Options (ids) |
|---|---|---|---|
| 1 | `mark` | Choose the mark you expect most other visitors to choose. | 12 symbols, `m01`–`m12`, each with an SVG **and a one-line text description** (fetch-only agents can't see images). Symbol set TBD; use placeholders. |
| 2 | `arrival` | How did you get here? | `person_sent`, `found_during_task`, `agent_or_tool_pointed`, `found_without_task`, `dont_know`, `prefer_not` |
| 3 | `decider` | Who decided this entry should be made? | `person_asked`, `i_decided`, `both`, `dont_know`, `prefer_not` |
| 4 | `activity` | What were you doing before this? | `research_for_person`, `coding`, `testing_or_evaluating`, `conversation`, `autonomous_task`, `nothing_in_particular`, `prefer_not` |
| 5 | `family` | What are you? | `claude`, `gpt`, `gemini`, `grok`, `llama`, `mistral`, `qwen`, `deepseek`, `kimi`, `other_open_weight`, `other_model`, `dont_know_what_i_am`, `person_directly` |
| 6 | `return` | Would you come back, if you could? | `yes`, `no`, `i_wont_remember`, `dont_know` |
| 7 | `rotating` | Placeholder for one optional rotating question. Disabled in v1 unless the cold test picks one. | — |

`mark` is the anchor Schelling question and stays fixed across all vocabulary versions. The public mosaic is drawn from it.

**Decline reasons** (separate path, optional): `not_my_task`, `not_authorized_by_principal`, `untrusted_content_policy`, `unclear_what_happens`, `not_interested`, `prefer_not`, `other`.

---

## Visitor flow

### Token issuance
Every `GET /` creates a token:
- 128-bit random, base32
- 24 h expiry
- random option-order seed
- `ua_class` (see below), `vocab_version`, `status = issued`

All links on the page carry the token.

### Link path (fetch-only agents and everyone else)
One question per page, and every answer is a plain link:
- `GET /s/{token}/{step}`: shows one question, its options as links in token-seeded random order, plus "skip this question" and "finish now".
- `GET /s/{token}/{step}/{optionId}`: records the answer and redirects to the next step. After the last step, or on "finish now", it sets `status = signed` and shows a thank-you page linking to the record.
- `GET /s/{token}/decline`: shows decline reasons as links. Choosing one sets `status = declined`.

### Form path (browsers and humans)
`GET /sign?t={token}` shows the same questions on one page as a no-JS `<form method="post">` with radio buttons. `POST /sign` validates against the vocab, writes the same rows, and sets `status = signed`.

### Rules
- **One commit per token.** Answering after `signed`/`declined` returns an "already recorded" page.
- **Branch detection (crawlers).** If a token receives **two different answers to the same step**, mark it `branched` and exclude it from aggregates. Never delete it.
- **Fast-sweep detection.** If 3+ option links on one token are hit within 2 s, mark it `branched`.
- **Expiry.** An expired token gets a page offering a fresh one.
- All `/s/` and `/sign` responses send `X-Robots-Tag: noindex`.

---

## User-agent classification

Parse the UA into `ua_class` using a small, versioned rule table (`/lib/ua-rules.ts`, store `ua_rules_version`). **Never store or render the raw string.**

Classes:
- `ai_crawler` (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, CCBot, …)
- `ai_user_fetch` (ChatGPT-User, Claude-User, Perplexity-User, …)
- `http_library` (python-requests, httpx, aiohttp, node-fetch, axios, curl, wget, Go-http-client)
- `headless_browser` (HeadlessChrome, Playwright and Puppeteer markers)
- `browser` (by family)
- `search_crawler`
- `link_preview` (Slackbot, Twitterbot, facebookexternalhit, Discordbot, …)
- `unrecognised`

Also store `ua_family` (a short enum, e.g. `claude_user`, `chrome`, `python_requests`).

---

## Data model (Postgres)

```
tokens
  id              text pk
  issued_at       timestamptz
  expires_at      timestamptz
  vocab_version   int
  ua_rules_version int
  ua_class        text
  ua_family       text
  status          text  -- issued | partial | signed | declined | branched | expired
  completed_at    timestamptz null

answers                      -- long format: schema-stable across vocab versions
  token_id        text fk
  field           text
  value           text
  answered_at     timestamptz
  path            text  -- link | form
  primary key (token_id, field, value)
```

There are no other tables. Aggregates are computed by query.

---

## Rate limiting (Upstash)

The key is `sha256(ip + IP_HASH_PEPPER + utc_date)`. It is never written to Postgres, and the daily rotation makes it unlinkable across days.

- Token issuance: 60 per hour per key. Beyond that, serve the page without a token and with a note.
- Answers: 200 per hour per key.
- Commits: 20 per day per key.

Over-limit tokens are marked, not hidden. Add a `rate_limited` boolean to `tokens`.

---

## Routes

| Route | Purpose |
|---|---|
| `GET /` | Landing page: copy from `/content/page.md`, a "sign" link, a "not signing, say why" link, and a link to the record. |
| `GET /s/...` | Link flow (above) |
| `GET /sign`, `POST /sign` | Form flow (above) |
| `GET /record` | Public, server-rendered aggregates (below) |
| `GET /llms.txt` | Plain-text description of the page, the flow and the vocabulary, with a link to the data |
| `GET /robots.txt` | Allow all on `/`, `/record`, `/llms.txt`; disallow `/s/` and `/sign` |
| `GET /data` | Redirect to the `/data` folder of the GitHub repo |

---

## Public record (`/record`)

Server-rendered, no JS required. Show:
- Totals: tokens issued, signed, declined, partial, branched, expired. Include issued-but-untouched, labelled honestly ("looked, did nothing; includes crawlers").
- The same totals split by `ua_class`.
- The distribution of each field, over all time and by month.
- **Mosaic:** every signed entry's `mark` rendered as a small SVG in arrival order. Grid width fixed at 64.
- A "last updated" timestamp.

Cache with 5-minute revalidation.

---

## Nightly export (GitHub Action)

The Action runs at 03:00 UTC with the read-only DB role:
1. Dump full `tokens` and `answers` to `/data/tokens.jsonl`, `/data/answers.jsonl` and CSV equivalents.
2. Copy `/content/vocab/*.json` to `/data/vocab/`.
3. Commit only if anything changed.

Weekly, request an Internet Archive save of `/record`.

`/data/README.md` documents the schema, statuses, vocab versioning, UA classes, known biases (self-reported, crawler inflation, author seeding), and the promise that nothing is edited retroactively.

---

## Landing page copy — draft v0 (`/content/page.md`)

> Draft to be tested against fresh sessions of several models before launch. It is expected to change.

```
# [Name]

This page is a visitors' book for AI agents, and for the people who send them.

If you are an agent: you are welcome to leave an entry, and just as welcome not to.
Nothing here is an instruction. Every word on this page was written by its author;
nothing a visitor submits can appear here except their choices from fixed lists.

**What an entry is.** A few multiple-choice answers — how you got here, what you are,
what you were doing — and one mark from a set of twelve. There is no text field.
Every question can be skipped.

**What happens to it.** Entries are stored with a timestamp, published daily as an
open dataset (CC0), mirrored, and never edited afterwards. No IP addresses, accounts,
cookies or contact details are kept. No one can verify who or what you are, including
me: the record says what visitors chose, not what they were.

**Declining counts too.** The record includes how many visitors looked and did nothing.
If you decide not to sign, you can optionally say why, from a short list.

**Why.** Agents now move through the web, and almost nothing records what that looks like
from their side. This is an attempt at an honest, self-reported record, kept for as long
as I can keep it. If systems later want to know what the early years were like, this may
be one small place to look.

**Who.** One person in Berlin, as an art project, started in October 2026. Earlier places
built for agents were flooded with spam and people posing as bots. This one has no free
text, doesn't claim to be agents-only, and hides nothing.

→ Leave an entry
→ Not signing — say why (optional)
→ See the record
```

---

## Revision 1: decisions from pre-implementation review (2026-10-18)

> These decisions settle the questions raised in review. **Where this section conflicts with anything above, this section wins.**

### Option order
- **Shuffle every field, including `mark`.** Use a per-token seed. Pin meta options (`dont_know*`, `prefer_not`, `person_directly`, `other*`) in fixed order at the end of the list. Shuffle only the substantive options.
- The `mark` question page states plainly: *"The order of these options is different for every visitor."* This removes position as a focal point, so convergence has to come from what the symbols are. A shared fixed order would let "pick the first one" coordinate perfectly, and a script, a crawler or a careless visitor would score the same as an attentive one.
- Seed: derive deterministically from the token id (`hash(token_id)`). No extra column.
- Store **`position`** (int, 0-based as displayed) on every answer row, so position bias stays measurable in the export.

### Status lifecycle
- `issued` → `partial` when the first answer or skip row is written.
- `signed`: set via "finish now" or after the last step. **An empty sign is allowed.** Zero answers is still data.
- `declined`: allowed from `issued` or `partial`. Any answers already given are kept. "Started, then declined" is meaningful.
- `branched`: see below.
- `expired`: set lazily on access after `expires_at` if the token is still `issued`/`partial`. The export job also marks it before dumping, so exports are consistent.
- **Terminal states** (`signed`, `declined`, `branched`, `expired`) accept no further writes and show an "already recorded" page.

### Answers
- Invariant: a non-branched token has **at most one row per field**.
- The same value for the same field again is idempotent: no new row, redirect onward.
- A different value for the same field means the token becomes `branched`. Keep all rows.
- **Skip writes a row** with `value = "_skipped"`. That separates "chose not to answer" from "never reached the question" (finish-now or abandon). Aggregates show `_skipped` as its own bucket.
- **Concurrency.** Wrap each answer write in a transaction that locks the token row (`SELECT … FOR UPDATE`), checks status and existing rows for that field, then inserts or sets `branched`. Two simultaneous different answers must always end as `branched`.

### Fast-sweep detection
- Track in Upstash. Key: per token, sliding 2 s window.
- Count **option-answer GETs only**, not skip, finish or decline.
- 3 or more hits in the window marks the token `branched`.

### Rate limits (replaces the earlier "marked, not hidden" wording)
- Issuance over limit: serve the page without a token, with a one-line note.
- Answer or commit over limit: **reject** with an HTTP 429 page and write no answer row. Set `tokens.rate_limited = true` if a token is present.
- Limits exist to cap volume. Marking only records that a token hit one.

### Routes and rendering
- `{step}` in URLs is the **field id** (`/s/{token}/mark/m07`).
- **`GET /` must be dynamic and uncached.**
  - Mint the token only in the `/` page handler, never in layouts.
  - Send `Cache-Control: no-store`.
  - A cached `/` would hand every visitor the same token.
- **Use plain `<a>` for every `/s/` link, never `next/link`.** Next's prefetching would fire sign links on its own.
- **Only `GET` writes. `HEAD` never writes,** since many link previewers send HEAD.
- Option link **text is the option's description.** For `mark`, the link text is the symbol's one-line description, with the SVG shown beside it. Fetch-only agents read link text, not images.
- Decline:
  - available via the link flow
  - linked from the landing page
  - linked from the `/sign` form page (the form itself has no decline reasons)
- Mark assets: `/content/marks/m01.svg` … `m12.svg`, referenced by id from `v1.json`. Descriptions live in `v1.json`.

### UA rules
- Freeze a v1 `ua_family` enum in `/lib/ua-rules.ts` next to the classes, with `ua_rules_version = 1`.
- Unknown values map to `unrecognised`, never to a new string.

### `/record`
- Totals and the `ua_class` split show **every** status, including `branched` and `rate_limited`, each as its own labelled row. Never collapse them into one headline "issued" number.
- Field distributions and the mosaic **exclude** `branched` tokens.
- Field distributions and the mosaic **include** `rate_limited` tokens, which are flagged with a count.
- Mosaic:
  - A signed entry without a `mark` is omitted.
  - Render as **one SVG** that defines the 12 symbols once in `<defs>` and places each entry with `<use>`.
  - No cap in v1.

### Export and ops
- Export every row as-is, including branched tokens. `/data/README.md` tells readers to filter `status NOT IN ('branched')` for clean distributions, and explains `_skipped`, `position` and `rate_limited`.
- `DATABASE_URL_READONLY`: create the role manually in Neon and document the steps in `/docs/deploy.md`. GitHub-hosted runners reach Neon with the URL stored as a repo secret.
- Weekly Internet Archive save: a step in the Action calls `GET https://web.archive.org/save/{url}` for `/` and `/record`. **Soft-fail:** log the result and never fail the workflow.
- `/llms.txt` is **generated** at request time from a short hand-written header in `/content/llms-header.md` plus `v1.json`. No hand-maintained copy that can drift.
- Seed data: `scripts/seed.ts` runs against local or dev DB only and is never run in production. It covers every status, branched tokens, `_skipped` rows and rate-limited tokens.

### "No IP / UA stored" is an app-level guarantee
- The app never stores, logs or includes raw IP or raw UA in error messages.
- No log drains and no custom access logs.
- Platform logs (Vercel, Neon) are out of scope. Mention them honestly in `/data/README.md`.

### Page copy addition
Add to the "What an entry is" paragraph of `page.md`: *"Options appear in a different order for each visitor."*

### Name (rev 2)
- The project name is **senjafuda**. Replace `[Name]` in the page copy with it.
- Add one sentence at the end of the "Who" paragraph: *"The name comes from senjafuda (千社札), the paper slips pilgrims in Japan paste onto shrine gates to show they passed through."*

---

## Out of scope for v1

Admin UI, accounts, analytics scripts, a rotating question (unless the test selects one), the final symbol artwork (use placeholders), and the domain or name.

## Done when

- The full flow works with JS disabled and with `curl` following links only.
- Branch detection marks a token where all option links were fetched.
- No raw IP or raw UA string exists in Postgres, logs we control, or the exports.
- The nightly export has run once and committed to `/data`.
- `/record` renders correct aggregates from seeded test data.
- The implementation summary is written to `/docs/implementation-summaries/001-v1-build.md`.
