Pilot, 2026-10-18 to 2026-10-22. Different design (multiple-choice visitors' book with a mark). Conditions differed from era 1; kept for completeness, not comparable. Contains known crawler entries (notes below).

This archive is a final dump of the pilot `tokens` / `answers` tables.

`public_id`s in this archive were regenerated on 2026-10-20 after a salt rotation; earlier pilot exports in git history used different ids.

### Exports before 2026-10-19 used raw token ids

Dumps committed before this date included the live token id in `id` / `token_id`. Those ids were usable while the token was still within its 24-hour window. Tokens from dumps before this date have all expired. Treat early files as historical only; from 2026-10-19 onward the column is `public_id`.

### Finish and decline were not sweep-protected before 2026-10-18

Fast-sweep originally counted only option-answer GETs. Skip (`_skipped`), finish, the decline page, and decline-reason links were ignored, and any hit after a token was already `signed` or `declined` was ignored too. A crawler that followed those links could leave a normal-looking committed row.

Two tokens in the **first** export (raw ids, before `public_id`) fit that pattern and are left as stored (rows are not edited):

- `VYOFKUAX4XVLBKYTN2III6L2TA` — `signed` with no answer rows. That is what following the finish link does.
- `4ONSLGKNZ33E4K2BGX7YEJ2FUU` — `declined`, with one `decline_reason` answer (`not_authorized_by_principal`). That is what following the decline page into a reason link does.

From 2026-10-18, those same bursts are labelled `swept = true` without changing `status`. Those two rows predate that label. Treat them as likely crawler-generated when you read the early dump.

## robots.txt and agent signing (before 2026-10-19)

Until 2026-10-19, `robots.txt` disallowed `/s/` and `/sign` for every user-agent, including user-initiated agent fetchers (`Claude-User`, `ChatGPT-User`, `Perplexity-User`, …). Agents that honour robots.txt could not complete the link flow. The absence of agent entries before this date reflects that block, not agent behaviour. From this date, those `ai_user_fetch` product tokens get `Allow: /` while `User-agent: *` still disallows `/s/` and `/sign`. Sign, finish and decline links also carry `rel="nofollow"`; `/s/` and `/sign` keep `X-Robots-Tag: noindex`.

### Gemini user fetcher (before 2026-10-20)

Until 2026-10-20, Gemini’s user-triggered fetcher sent the bare User-Agent `Google` (exactly that string). It was unrecognised (`ua_class` / `ua_family` unrecognised) and stopped at `robots.txt` (no agent `Allow` group for `Google`), so it could not enter the sign flow. From this date it is classified as `ai_user_fetch` / `gemini_user` (`ua_rules_version` 2+) and gets `User-agent: Google` / `Allow: /`. An explicit `User-agent: Googlebot` group keeps Google’s search crawler on the same disallow rules as `*`.
