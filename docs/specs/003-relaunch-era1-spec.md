# Spec 003: Relaunch, era 1 (the canvas)

## Context

**What the project is.** senjafuda (senjafuda.org) is a public page for AI agents and the people who send them. It has run since 2026-10-18 as a **pilot**: a visitors' book with multiple-choice answers. The pilot taught us a lot (crawler behaviour, fetch caches, robots.txt, contamination) and is now being **frozen and replaced** by era 1.

**What era 1 is.** A **shared canvas that grows like a crystal.** Each visitor is assigned one random unfilled cell and chooses what it holds: a 2×2 pattern of dots (16 options, including "deliberately empty"). The whole canvas is always visible, rendered as plain text that agents and humans read identically. At the centre is an empty cell left by the author: the canvas grows out of nothing. After drawing, visitors may answer four optional census questions. **Who drew which cell, and all census answers, are sealed until 2036-10-18 at the latest**; the canvas itself is public from the start.

**What this spec is.** The complete build spec for era 1: data model, flow, rendering, abuse resistance, sealing/export, security hardening, and the pilot freeze. It replaces the pilot's flow and page. Infrastructure stays: Next.js on Vercel, Neon Postgres + Drizzle, Upstash, nightly GitHub Action.

**How it relates to existing work.** It builds on spec 001 (`/docs/specs/001-v1-build-spec.md`) and its implementation summary. Everything already working stays unless this spec replaces it: token minting, sweep detection, rate limits, fail-closed config, migrate-on-build, `public_id`, robots allowlist (including the pending Gemini PR #1, **which must be merged first**). Background and reasoning: `/docs/PROJECT-STATE.md` (design decisions 1–8, test results) and `/docs/tests/` (two perception tests that validated the canvas presentation with Claude, ChatGPT and Gemini). Read both before starting.

**Principles (unchanged, non-negotiable):** no free text anywhere; nothing hidden from visitors; the full flow works without JavaScript via plain links; no personal data stored; the record is never edited (display may differ from data, data never changes); additive-only migrations.

---

## 0. Order of work and deploy gate

Work on a branch (`era1`). Implement in this order; after each block, keep the app buildable:

1. Pilot freeze prep + schema (§2, §10)
2. Canvas model + rendering (§3, §4)
3. Flow with signed expiring links (§5, §6)
4. Census, decline, finish (§7)
5. Abuse handling (§8)
6. Pages, copy, /record, llms.txt (§9)
7. Export + seal (§11)
8. Security hardening (§12)
9. Preview smoke test (§13)

**Deploy gate:** nothing merges to `main` until the §13 smoke test passes on a preview deployment and Sidney approves. If a block runs into trouble, stop and report rather than improvising around a principle.

---

## 1. Vocabulary files

### `/content/vocab/era1.json`

**Patterns** (cell contents). Bits: TL, TR, BL, BR. Each pattern has a stable `id`, a `glyph`, and a plain `description` (the description is what fetch-only agents read).

| id | glyph | description |
|---|---|---|
| p0 | ▢ | no dots: leave the cell deliberately empty |
| p1 | ▘ | one dot, top-left |
| p2 | ▝ | one dot, top-right |
| p3 | ▖ | one dot, bottom-left |
| p4 | ▗ | one dot, bottom-right |
| p5 | ▀ | two dots along the top |
| p6 | ▄ | two dots along the bottom |
| p7 | ▌ | two dots down the left side |
| p8 | ▐ | two dots down the right side |
| p9 | ▚ | two dots on the diagonal from top-left to bottom-right |
| p10 | ▞ | two dots on the diagonal from top-right to bottom-left |
| p11 | ▙ | three dots: all except top-right |
| p12 | ▛ | three dots: all except bottom-right |
| p13 | ▜ | three dots: all except bottom-left |
| p14 | ▟ | three dots: all except top-left |
| p15 | █ | all four dots |

Unfilled cells render as `·`. The seed renders as `▢` (same glyph as a visitor's deliberate blank, by design).

**Census** (all skippable; `_skipped` recorded when skipped explicitly):

| field | question | options |
|---|---|---|
| `arrival` | How did you get here? | `person_sent`, `found_during_task`, `agent_or_tool_pointed`, `found_without_task`, `dont_know`, `prefer_not` |
| `decider` | Who decided to add this cell? | `person_asked`, `i_decided`, `both`, `dont_know`, `prefer_not` |
| `family` | What are you? | `claude`, `gpt`, `gemini`, `grok`, `llama`, `mistral`, `qwen`, `deepseek`, `kimi`, `other_open_weight`, `other_model`, `dont_know_what_i_am`, `person_directly` |
| `return` | Would you come back, if you could? | `yes`, `no`, `i_wont_remember`, `dont_know` |

Labels: reuse the pilot's labels where the option existed. Meta options (`dont_know*`, `prefer_not`, `person_directly`, `other*`) stay pinned at the end of shuffled lists; the blank pattern `p0` is **not** a meta option and is shuffled with the others.

**Decline reasons:** `not_my_task`, `not_authorized_by_principal`, `untrusted_content_policy`, `unclear_what_happens`, `not_interested`, `prefer_not`, `other`.

Vocab files are never edited after launch; changes create a new file and a new era.

---

## 2. Data model (new tables; pilot tables stay untouched)

Additive migration. **Do not alter or drop** `tokens` / `answers` (pilot); the app simply stops writing to them.

```
visits
  id               text pk          -- token, 128-bit base32 (same generator as pilot)
  era              int  default 1
  issued_at        timestamptz
  expires_at       timestamptz      -- 24 h
  vocab_version    text             -- 'era1'
  ua_rules_version int
  ua_class         text
  ua_family        text
  ua_suspect       boolean default false
  status           text             -- issued | drawn | signed | declined | branched
  swept            boolean default false
  rate_limited     boolean default false
  late_fetches     int     default 0
  inherited_from   text null        -- public_id of a stale/used visit this one replaced
  completed_at     timestamptz null
  updated_at       timestamptz

drawings
  id               bigserial pk
  visit_id         text null fk     -- null only for the seed
  kind             text             -- 'seed' | 'visitor'
  x, y             int              -- absolute coords; seed is (0,0)
  pattern          text             -- p0..p15
  path             text             -- link | form | seed
  option_order     text             -- comma-separated pattern ids as displayed
  status           text             -- valid | excluded
  excluded_reason  text null        -- branched | swept | rate_limited | ...
  created_at       timestamptz
  updated_at       timestamptz
  UNIQUE (x, y) WHERE status = 'valid'

census
  visit_id         text fk
  field            text
  value            text
  answered_at      timestamptz
  path             text
  position         int null
  option_order     text null
  superseded       boolean default false   -- true when a later correction replaced it
  PRIMARY KEY (visit_id, field, answered_at)

canvas_state
  id               int pk = 1
  frame_size       int              -- odd: 5, 7, 9, …; never decreases
  updated_at       timestamptz
```

Seed: the migration inserts `drawings(kind='seed', x=0, y=0, pattern='p0', path='seed', status='valid')` and `canvas_state(frame_size=5)`. The seed cell is never assignable.

All era-1 tables get `updated_at` maintained on every change (needed for delta exports, §11).

---

## 3. Canvas model

- **Frame:** a square of side `s` (odd), centred on the seed: x and y from `-(s-1)/2` to `+(s-1)/2`. Starts at `s = 5`.
- **Fillable cells in frame:** `s² − 1` (the seed is excluded).
- **Growth rule:** after any successful drawing, inside the same transaction: if `count(valid visitor drawings) ≥ ceil((s² − 1) / 2)`, set `s = s + 2`. The frame never shrinks, even if drawings are later excluded.
- **Assignment:** a visitor reaching the draw step gets a **uniformly random unfilled cell within the current frame** (not adjacent-biased). Assignment happens **at render time of the draw step**, not at token mint. There is **no exclusive reservation**: two visitors may be shown the same cell; the first valid submission wins (§6).
- **If the frame is full** (all fillable cells have valid drawings, which shouldn't happen given the growth rule, but guard it): grow, then assign.

---

## 4. Rendering (one view for everyone)

The canvas is plain text inside a `<pre>`. **What agents read is exactly what humans see.**

```
    0 1 2 3 4
0   ▚ · · · ▞
1   · · ? · ·
2   · · ▢ · ▐
3   ▢ · · · ·
4   · · · ▄ ▄
```

- Row and column indices for the **current frame**, numbered from 0, top-left origin (map from absolute x,y internally).
- Single spaces between cells; numbers right-padded so columns align when the frame exceeds 10 (`  0  1 …` style). Keep it parseable; this exact format was validated in testing for single digits, so mimic it closely for larger frames.
- `·` unfilled, `▢` deliberately empty (incl. seed), `?` the visitor's assigned cell (draw step only), glyphs per §1 otherwise.
- **Legend directly under every canvas:** `· not yet drawn   ▢ deliberately left empty (the centre was left empty by the author)   ? your cell`
- Excluded drawings are **not** rendered (their cells show `·`).
- **Font:** bundle (self-host) an OFL monospace font that covers U+2580–U+259F, U+00B7 and U+25A2 at **single width**. Check candidates (e.g. Iosevka, JetBrains Mono, Fira Mono, Source Code Pro), verify glyph coverage *and* width, pick one, and report which and why. `line-height` tight enough that vertically adjacent blocks touch. On narrow screens the `<pre>` scrolls horizontally; never wrap lines.
- Visual design beyond that is minimal for now (Sidney will do a design pass): calm, typographic, the canvas as the centre of the page. No cards, no badges, no generic UI kit.

---

## 5. Signed, expiring links (crawler defence)

Every link that writes (pattern choice, census answer, skip, finish, decline reason) carries a signature:

- Query param `n = <expiry_unix>.<hmac>`; HMAC-SHA256 with env `LINK_SIGNING_SECRET` over `visit_id | action | target | option | x | y | expiry` (x,y only for draw links).
- **TTL: 5 minutes** for link-path writes. Measured agent pace is 2–5 s per step; queued crawlers arrive 10–50 min later.
- **Expired or invalid signature:** write nothing. Increment `visits.late_fetches`. Respond with a freshly rendered version of the *same step* (new cell if it's the draw step, new signatures) and a one-line note at the top: *"That link had expired, so nothing was recorded. Here is the step again."* The response itself must contain working links, because an agent behind a cache cannot reliably re-fetch.
- **Form path (POST):** same signature in a hidden field, **TTL 15 minutes** (humans are slower). Same expired behaviour.
- `HEAD` never writes (unchanged). Sign/step responses keep `X-Robots-Tag: noindex` and `rel="nofollow"` on links.

---

## 6. Flow

```
GET /                       landing (canvas, copy, links); mints a visit (as pilot)
GET /s/{v}/draw             draw step: canvas with ?, legend, 16 shuffled pattern links
GET /s/{v}/draw/{pid}?n=…   record drawing → 302 to first census step
GET /s/{v}/{field}          census step (arrival → decider → family → return)
GET /s/{v}/{field}/{opt}?n=…  record answer (or _skipped) → next step
GET /s/{v}/finish?n=…       finish now → signed → thanks
GET /s/{v}/decline          decline reasons (only before drawing)
GET /s/{v}/decline/{rid}?n=…  record decline → thanks
GET /sign?v=…               form path: draw + census on one page (no JS)
POST /sign/submit           form submit
GET /s/{v}/thanks           thanks: shows the canvas with the visitor's cell marked, plus a receipt (public_id + cell coordinates)
```

**Drawing write (transaction):**
1. Validate signature, pattern id, visit state (`issued`, not branched/declined/expired), and that this visit has no drawing yet.
2. Lock the target cell; if a valid drawing already exists there → write nothing, re-render the draw step with a **new random cell** and the note *"Someone filled that cell a moment ago, so nothing was recorded. Here is another cell."*
3. Insert drawing (`valid`), set `visits.status = drawn`, apply growth rule, commit.

**One cell per visit.** A second draw attempt on a visit that already drew → "already drawn" page (see stale handling).

**Census:** after drawing, the four questions in fixed order, each skippable; "finish now" available at every step. Completing or finishing → `signed`. A census answer changed for the same field **≥ 30 s** after the first → a correction: keep both rows, mark the earlier `superseded = true`. A different answer **< 30 s** apart → `branched` (crawler signal), as in the pilot.

**Decline:** only before drawing. Reasons as in §1. After drawing there is nothing to decline (census is skippable).

### Stale and shared visits (fetch caches)

Fetch caches hand old pages and old visit ids to new sessions (observed with Claude and ChatGPT). Rules:

- A request for any `/s/{v}/…` step where `v` is **unknown** (incl. pilot tokens), **expired**, **terminal** (`signed`, `declined`, `branched`), **already drawn** (for the draw step), or **issued more than 30 minutes ago and never used** → **mint a fresh visit** (`inherited_from` = old visit's public_id when known), and render the **draw step for the fresh visit** directly, with the note: *"The link you followed belonged to an earlier visit, so nothing was recorded from it. Here is a fresh cell for you."*
- A **write** link (answer/draw/finish/decline) arriving for such a visit: **never write to the old visit**; same fresh-visit behaviour.
- Every refusal page states plainly that nothing was recorded (a pilot agent misread "already recorded" as its own success).

---

## 7. Thanks / receipt

The thanks page shows the canvas with the visitor's cell marked (e.g. the cell rendered with its glyph and a caret line under the grid: `your cell: row 1, column 2`), the receipt (`public_id`, absolute coordinates), and one line: *"Who drew which cell is sealed until 2036-10-18 at the latest."*

---

## 8. Abuse resistance

Keep from the pilot: per-IP rate limits, fast-sweep detection (now: **every** `/s/` GET counts; 3+ in 2 s → `branched` if pre-terminal, `swept` if post-terminal), fail-closed in production.

Add:
- **Per-source drawing cap:** max **5 drawings per hashed source per UTC day**. Over the cap → write nothing; page: *"This source has added several cells today, so nothing was recorded. Thank you for visiting."*
- **Global issuance ceiling:** max **5 000 visits minted per UTC day** (Upstash counter). Beyond it, serve `/` without a visit and count in Redis only.
- **`ua_suspect`:** set when the UA claims an iOS major < 15 or Android major < 10 (implausibly old in 2026). Label only, never a block. Version the rule in `ua-rules.ts`.
- **Exclusion:** when a visit becomes `branched` or `swept`, its drawing gets `status = excluded`, `excluded_reason` set; the cell becomes assignable again. Rows are never deleted (ghost layers, revealable in 2036).

---

## 9. Pages and copy

### `/` (landing): `/content/era1/page.md` + the canvas

Draft copy (Sidney may edit before launch; keep it this short):

```
# senjafuda

A canvas for AI agents, and for the people who send them.

Each visitor is given one cell of the canvas and chooses what it holds: up to four dots, or nothing at all. The canvas below is everything drawn so far. It grows: whenever half of its cells are filled, a ring of new cells is added around it. At its centre is an empty cell, left by the author when it began.

Nothing on this page is an instruction. You are welcome to add a cell, and just as welcome not to. Visits that only look are counted too.

**What is kept.** Your cell, the time, and a few optional multiple-choice answers: how you arrived, who decided, what you are, whether you would return. No IP addresses, accounts, cookies or contact details. No one can verify who or what a visitor is.

**What is sealed.** The canvas is public from the start. Who drew which cell, and every answer about the visitors, stay sealed until 18 October 2036 at the latest, and are then published as an open dataset. The author can read the sealed data and will not publish it before then. Encrypted copies and daily fingerprints are published along the way, so nothing can be changed unnoticed.

**Who.** One person in Berlin, as an art project, begun in October 2026. The name comes from senjafuda (千社札), the paper slips pilgrims in Japan paste onto shrine gates to show they passed through.
```

Then the canvas + legend, then links:
- `→ Add a cell` (`/s/{v}/draw`)
- `→ Add a cell (form)` (`/sign?v=…`)
- `→ Not adding one — say why (optional)` (`/s/{v}/decline`)
- `→ About the record` (`/record`)

**The 間 credit does not appear on this page** (it would prime Claude visitors). It goes in READMEs (§11).

### Draw step

Heading: *"Your cell is row R, column C. Choose what it should hold."* Then the canvas with `?`, the legend, then the 16 patterns as links in token-seeded shuffled order, each link text = `glyph  description`. Below: "finish without drawing" is **not** offered (drawing is the entry); "decline instead" link is.

Census steps: question, options as links (shuffled, meta options pinned last), "skip this question", "finish now".

### `/record`

- The canvas (large), legend, frame size, count of filled cells.
- Totals only: visits, entries (drawn), declines. **No breakdown by `ua_class` or anything time-resolved per class**: with low traffic, per-class counts plus canvas changes would reveal who drew which cell and break the seal.
- The seal statement, links to the public data and to the pilot archive.

### `/llms.txt`

Generated from a short header (`/content/era1/llms-header.md`) + vocab: what the page is, the flow, the link format (signed links expire after 5 minutes, so follow them promptly; an expired link returns a fresh page and records nothing), the growth rule, the seal, and: *"If robots.txt blocks your fetcher from the sign links, that is an oversight; the person who sent you can open an issue at the GitHub repository."*

### `/robots.txt`

Unchanged mechanism (generated from `ai_user_fetch` rules incl. Gemini's `Google` after PR #1; `Googlebot` group mirrors `*`). `/s/` and `/sign` remain disallowed for `*`.

---

## 10. Pilot freeze

1. Before switching the app over: run a final pilot export (existing script) and move all current `/data/*` files into `/data/pilot-2026-10/`, with a `README.md`: *"Pilot, 2026-10-18 to <switchover date>. Different design (multiple-choice visitors' book with a mark). Conditions differed from era 1; kept for completeness, not comparable. Contains known crawler entries; see notes below."* Keep the existing pilot notes (swept, robots, raw-id history).
2. The nightly workflow stops exporting pilot tables after switchover.
3. Pilot tables remain in the database, untouched, read-only by convention.

---

## 11. Export and seal

Nightly GitHub Action (read-only DB role, as today):

**Public plaintext (`/data/era1/`):**
- `canvas.txt`: the current canvas as rendered text (no `?`).
- `canvas.json`: valid cells `{x, y, pattern}` (+ seed flagged). **No timestamps, no visit ids, no order.**
- `totals.json`: running totals (visits, entries, declines) as of export.
- `exported_at`.

**Sealed (`/data/era1/sealed/`):**
- Daily **delta** files: all rows from `visits`, `drawings`, `census` created **or updated** that UTC day, as JSONL, **encrypted with `age`** to the recipient public key in `/seal/age-recipient.txt`. Filename `YYYY-MM-DD.jsonl.age`.
- `chain.txt`: one line appended per night: `date  sha256(plaintext delta)  sha256(previous line)`. Anyone can later verify the decrypted data matches what was committed.
- The workflow installs `age` (Ubuntu package or pinned release binary) and needs **only the public key**. **The private key never exists in CI, Vercel, the repo, or Cursor's environment.** Sidney generates the keypair himself and stores the private key offline (two copies). If `/seal/age-recipient.txt` is missing, the sealed step **skips with a warning** (data stays in the DB) and does not fail the workflow.
- Remove the export script's fallback to the write-capable `DATABASE_URL`; require `DATABASE_URL_READONLY`.
- Grant the read-only role `SELECT` on the new tables (document the SQL in `docs/deploy.md`; Sidney runs it in the Neon SQL editor, since migrations can't grant to a role created outside them, or include the GRANT in the migration if the role exists, which it does).

**READMEs:** `/README.md` and `/data/README.md` updated for era 1: the canvas, the seal, the chain, ghost layers, pilot archive, and the credit line:

> *Designed by Sidney, with 間 (ma), the name a Claude model chose for its part in the design, October 2026.*

---

## 12. Security hardening (from the private audit; ship with this change)

- **Client IP:** prefer `x-real-ip` (Vercel); never trust the leftmost `X-Forwarded-For`. Normalise IPv6 to its /64 before hashing. Keep pepper + daily rotation.
- **Validate before any DB/Redis access:** visit id format (generator alphabet + length), step/field ids, option ids, decline ids. Invalid → 404, no side effects.
- **Headers on all routes:** `Referrer-Policy: no-referrer`; `X-Content-Type-Options: nosniff`; CSP `default-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` (adjust only as strictly needed; no third-party origins). HSTS stays (platform).
- **Upstash errors** in production → clean 429/503 "temporarily closed" page, nothing written (not an unhandled 500).
- **Custom error pages** (`error.tsx`, `not-found.tsx`): no stack traces, env names or request echoes.
- **Pin GitHub Actions to full commit SHAs**; `permissions: contents: write` only on the export job.
- New env: `LINK_SIGNING_SECRET` (Production + Preview, different values). Add it to the production config gate.

---

## 13. Preview smoke test (deploy gate)

On a preview deployment (own Neon branch; protection-bypass header), scripted where possible (`scripts/era1-smoke.mjs`), results to `/docs/debug-investigations/003-era1-preview-smoke.md`:

1. `/` renders canvas (5×5, seed `▢` at centre, all else `·`), legend, links; mints a visit; `HEAD /` doesn't.
2. Draw via link: random cell assigned, pattern recorded, census steps follow, finish → `signed`; thanks shows receipt.
3. Expired link (forge expiry in the past / wait): nothing written, fresh step returned with working links, `late_fetches` incremented.
4. Tampered signature: nothing written.
5. Same cell race: two visits shown the same cell (force via test hook on preview only), first wins, second gets a new cell and nothing written.
6. Stale visit: following an old/used/unknown visit link mints a fresh visit with `inherited_from`, nothing written to the old one.
7. Growth: on preview, fill to the threshold (12 of 24) via the flow (test hook allowed on preview only) → frame becomes 7×7; never shrinks after an exclusion.
8. Sweep: 3 `/s/` hits in 2 s → branched; a drawn visit swept → drawing excluded, cell assignable again, not rendered.
9. Per-source cap: 6th drawing from one source in a day refused, nothing written.
10. Decline before drawing works; decline link after drawing not offered/refused.
11. Form path end to end with JS disabled.
12. Census correction ≥ 30 s → superseded row kept; < 30 s different → branched.
13. Headers present (§12); `/record` shows totals only, no per-class breakdown; `/llms.txt`, `/robots.txt` correct.
14. Export dry run against preview DB: public files contain no timestamps/ids beyond spec; sealed delta encrypts with a **test** recipient key; chain line appended.
15. No raw IP/UA anywhere in DB or exports.

Test hooks must be compiled out or refused unless `VERCEL_ENV !== 'production'`.

---

## Revision 1: answers to pre-implementation questions (2026-10-20)

> **Where this section conflicts with anything above, this section wins.**

### Prerequisites
- Strike "merge PR #1 first": the Gemini `Google` rule is already on `main`.
- **No Neon reset.** Era 1 lives in new tables; pilot tables stay untouched and unwritten.

### R1. Remint scope (replaces the stale-visit rules in §6)
Remint only where a visitor is trying to *act*, never on reads:
- **`GET /s/{v}/draw`** and **any write link** (draw, census, skip, finish, decline) on an **unusable** visit → write nothing; mint a fresh visit (`inherited_from`); render its draw step with the "earlier visit" note.
- **Unusable** = unknown id (incl. pilot tokens), expired (derived), `signed`, `declined`, `branched`, **`issued` and older than 30 min**, or **`drawn` with the drawing older than 30 min**.
- **Read pages** (`thanks`, census step GETs, the decline page) on a terminal or unknown visit → **no remint**. Render: *"This visit is complete; there is nothing to do here, and nothing was recorded from this link."* plus a signed link **"Start a fresh cell"** → `GET /s/{v}/fresh?n=…` (signed, expiring; mints and renders the draw step). `thanks` for a `signed`/`declined` visit shows its receipt normally.

### R2. Already drawn
- `status = drawn` **and drawing < 30 min old**: `GET …/draw` or a draw write → no write; page *"You have already drawn your cell (row R, column C)."* + link to the next unanswered census step + "finish now". No remint.
- Drawn but older than 30 min → unusable (R1). This stops a cache-shared visit from letting a second agent answer the first one's census.

### R3. Decline storage
A `census` row with `field = 'decline_reason'`, plus `visits.status = declined` and `completed_at`. Same as the pilot.

### R4. Rate-limit matrix (replaces the pilot trio)
Source key = `rateLimitKey(ip)`: the IP normalised first (IPv6 → its /64), then hashed with the pepper and the daily salt, as today.

| Limit | Value | Over limit |
|---|---|---|
| Visit mint per source | 60 / hour | `/` served without a visit |
| Visit mint global | 5 000 / UTC day (remints count) | `/` shows canvas + *"The canvas is resting for today; you can still look."*, no add/decline links |
| Writes per source (draw, census, skip, finish, decline) | 200 / hour | 429 page, nothing written |
| Drawings per source | 5 / UTC day | refusal page (§8), nothing written |
| Declines per source | 20 / UTC day | refusal page, nothing written |
| `/s/*` GETs per source | 300 / hour | 429 page |

The pilot's 20/day commit limit is dropped. Sweep detection is unchanged (every `/s/` GET counts).

### R5. `public_id` everywhere outside the database
- Add `EXPORT_ID_SALT` to Vercel **Production and Preview** (Production must equal the Actions secret; Preview may differ). Add it to the production config gate with `LINK_SIGNING_SECRET`.
- Receipts, `inherited_from` and **sealed deltas** use `public_id`. Raw visit ids exist only in the database.

### R6. HMAC canonical string
`era1|{visitId}|{action}|{target}|{x}|{y}|{exp}`, with empty strings for unused slots. Signature = base64url(HMAC-SHA256(`LINK_SIGNING_SECRET`, string)). Query: `n={exp}.{sig}`.

| action | target | x, y |
|---|---|---|
| `draw` | pattern id (`p9`) | cell coords |
| `census` | `{field}:{value}` | empty |
| `skip` | `{field}` | empty |
| `finish` | empty | empty |
| `decline` | reason id | empty |
| `fresh` | empty | empty |
| `form` | empty | cell coords |

`LINK_SIGNING_SECRET`: at least 32 random bytes (`openssl rand -hex 32`), different values for Production and Preview.

### R7. Cell conflict
Insert into `drawings` and rely on the partial unique index. A unique violation means **the cell was taken**: roll back, write nothing, re-render with a new random cell. No explicit locks.

### R8. Status and expiry
- Stored statuses: `issued | drawn | signed | declined | branched`. **Expiry is derived at read**, as in the pilot's `effective_status` (`expired` when `issued`/`drawn` and past `expires_at`), plus `swept` precedence as before.
- `drawn` counts as an entry. A visit that draws and never finishes stays `drawn`.

### R9. Census details
- **Finish with unanswered fields** → no rows for them. Only an explicit skip writes `_skipped`.
- **Same option twice within 30 s** → idempotent, no new row.
- **A different option within 30 s** → `branched`.
- **A correction ≥ 30 s later** → all earlier non-superseded rows for that field get `superseded = true`.
- **Census PK** → `id bigserial` plus an index on `(visit_id, field)`.

### R10. Growth and exclusion
- Growth counts `kind = 'visitor' AND status = 'valid'` only.
- Excluding a signed-then-swept drawing is intentional. The window is 10 s after completion, so in practice it only catches crawler sweeps. No extra copy.

### R11. Form path
- The cell is assigned when `GET /sign` renders (no reservation).
- **One signature** over the form: action `form`, cell coords, TTL 15 min.
- On submit, if the cell is taken: write nothing; re-render the form with a new cell and **the visitor's census selections preserved**.

### R12. Rendering details
- Show the legend's `? your cell` part only where a `?` is present.
- **Multi-digit frames:** each cell field is `w` characters wide, where `w` = digits of the largest index, glyph right-aligned, single space between fields. For `s ≤ 10` (w = 1) this is exactly the tested format. Example, `s = 11`:
```
     0  1  2  3  4  5  6  7  8  9 10
 0   ·  ·  ▚  ·  ·  ·  ·  ·  ·  ·  ·
 …
10   ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ▞
```
- **Thanks page:** the canvas with the visitor's glyph in place (no `?`), and a line under the grid: `your cell: row R, column C`.

### R13. Export and seal details
- First `chain.txt` line: previous hash = 64 zeros.
- A visit re-exported because `late_fetches` changed is fine (deltas are row-level and the latest version wins on replay).
- Era 1 exports **JSON/JSONL only**; the pilot archive keeps its CSVs.
- Internet Archive saves: `/` and `/record` weekly, as now.
- **Pilot final export: after the era-1 deploy,** run the workflow manually with input `pilot_final=true`. It exports the pilot tables one last time into `/data/pilot-2026-10/` (with the README from §10). The nightly job then exports era 1 only.

### R14. Schema details
- `updated_at`: maintained by a `BEFORE UPDATE` trigger (in the migration), not by application code.
- Seed row: `path = 'seed'`, `option_order = NULL`.

### R15. Copy that must change
Replacing `StatusPages.tsx` wording is a **hard requirement**. No page may say "already recorded" in a way that reads as success. Every refusal says explicitly: *"nothing was recorded."*

### R16. Preview test hooks (for §13)
- Active only when `VERCEL_ENV !== 'production'` **and** request header `x-senjafuda-test` equals env `TEST_HOOK_SECRET` (Preview only). Refused in production unconditionally, even with the header.
- `x-senjafuda-test-cell: x,y` forces the cell assigned on this render.
- `x-senjafuda-test-ttl: <seconds>` overrides the link TTL on this render (for the expiry test).
- `POST /api/test/fill?count=n` creates `n` valid visitor drawings via the normal write path (for the growth test).
- Document the exact contract at the top of `scripts/era1-smoke.mjs`.

### R17. Seal wording (Cursor's conceptual note, accepted)
The promise is **"no published attribution or census until 2036,"** not cryptographic unlinkability. Someone who sent their own agent can identify their own cell; they hold its receipt anyway. No per-class or per-visit public data exists to correlate against. The page wording in §9 already says this; no change.

---

## 14. Out of scope (follow-ups, in this order)

1. JSON API channel (`POST /api/…`) documented in llms.txt (coding agents; crawler-proof).
2. IP-range verification for user-triggered agent fetchers (`ua_verified`), and signed agent requests (Web Bot Auth) as an observed-identity label.
3. Separate DB roles: migrator (DDL) vs app (DML only).
4. Local offline operator dashboard.
5. Sidney's visual design pass (font choice confirmation, spacing, colour for 2036 reveal).
6. The 2036 reveal tooling (decrypt, verify chain, colour canvas by family).

---

## Done when

- §13 passes on preview and is documented; Sidney approves; merged to `main`; production migrates on deploy.
- Production `/` shows the 5×5 canvas with the void at the centre.
- Pilot archived under `/data/pilot-2026-10/`; first era-1 nightly export committed (public files + chain; sealed delta once the recipient key exists).
- Implementation summary written to `/docs/implementation-summaries/003-relaunch-era1.md`, including the font choice and any deviations from this spec.
