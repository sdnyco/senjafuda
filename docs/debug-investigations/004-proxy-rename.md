# 004 — Next.js middleware → proxy rename

**Date:** 2026-10-22  
**Branch:** `proxy-rename` @ `0ac5933`  
**Preview:** https://senjafuda-extdhwzk4-sdnycos-projects.vercel.app  
**Alias:** https://senjafuda-git-proxy-rename-sdnycos-projects.vercel.app  
**Do not merge** until Sidney approves.

## Change

Ran the official codemod:

```bash
pnpm dlx @next/codemod@canary middleware-to-proxy . --force
```

**Diff reviewed:** `src/middleware.ts` → `src/proxy.ts` with a single semantic edit — named export `middleware` renamed to `proxy`. Matcher, HEAD short-circuit logic, and headers are unchanged.

```diff
- export function middleware(request: NextRequest) {
+ export function proxy(request: NextRequest) {
```

No `next.config` middleware flags were present, so nothing else was rewritten.

## Runtime / behaviour notes (Next.js 16)

From the Next 16 upgrade guide and Proxy docs:

| Topic | Middleware (deprecated) | Proxy (Next 16) | Impact on us |
|---|---|---|---|
| Purpose / API | Rewrite, redirect, headers, direct response | Same | None — docs say functionality remains the same |
| Default runtime | Historically Edge | **Node.js only**; `runtime: 'edge'` is not supported and throws | Our file never set `runtime: 'edge'`. Logic is sync header/response only (no Edge-specific APIs). Node default is fine and should not change HEAD/GET behaviour |
| Config renames | `skipMiddlewareUrlNormalize`, etc. | `skipProxyUrlNormalize`, … | We did not use these flags |
| File convention | `middleware.ts` | `proxy.ts` (project root or `src/`) | Applied |

**Risk if we had needed Edge:** Next says keep `middleware` until further Edge instructions. We do not need Edge for this HEAD short-circuit.

## Preview verification

Method: Node `fetch` with `x-vercel-protection-bypass` only (no test-hook headers). Visit counts taken from `GET /record` totals (Visits).

| Check | Result | Detail |
|---|---|---|
| `HEAD /` → 200 | **PASS** | status 200; `Cache-Control: no-store` |
| `HEAD /` mints no visit | **PASS** | Visits 24 → 24 |
| `GET /` mints exactly one visit | **PASS** | Visits 24 → 25; home HTML includes `/s/{visit}/…` |
| `/s/*` has `X-Robots-Tag: noindex` | **PASS** | `GET /s/{v}/draw` → `noindex` |
| `/sign` has `X-Robots-Tag: noindex` | **PASS** | `GET /sign?v=…` → `noindex` |
| Security headers on `/`, `/record`, `/s/*` | **PASS** | CSP (incl. `frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` match `next.config.ts` |
| Build log: no middleware deprecation warning | **PASS** | Build shows `ƒ Proxy (Middleware)`; no “middleware is deprecated” / migrate-to-proxy warning |

### Observed CSP (unchanged)

`default-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`

### Note on Preview `X-Robots-Tag`

`HEAD /` and `GET /` on this Preview also returned `X-Robots-Tag: noindex`. That is outside our proxy matcher logic for `/` (proxy only adds `noindex` on HEAD for `/s/*` and `/sign`; `next.config` adds `noindex` for `/s` and `/sign`). Likely Vercel Deployment Protection / Preview behaviour, not introduced by the rename.

## Verdict

Behaviour matches the previous middleware for the checks above. Safe to merge when approved.
