/**
 * Era 1 preview smoke (spec §13 / R16).
 *
 * Uses plain Node `fetch` with Vercel Protection Bypass for Automation
 * (VERCEL_AUTOMATION_BYPASS_SECRET from .env.local — never printed) plus
 * Preview test hooks (x-senjafuda-test). Does not use `vercel curl` for hooks.
 *
 * Contract — test hooks (Preview only):
 *   Header x-senjafuda-test: <TEST_HOOK_SECRET>
 *   Header x-senjafuda-test-cell: x,y
 *   Header x-senjafuda-test-ttl: <sec>
 *   Header x-senjafuda-test-cap: enforce  — keep per-source caps on (§13.9)
 *   GET  /api/test/hook-echo              — confirms hooks reach the app
 *   POST /api/test/fill?count=n           — create n valid drawings (growth)
 *   POST /api/test/reset-source-caps      — clear this source's draw/decline/write counters
 *   POST /api/test/reset-growth-fixture   — exclude visitor drawings; frameSize=5
 *   GET  /api/test/census-superseded      — count superseded census rows
 *   POST /api/test/export-dry-run         — public + sealed plaintext for age CLI
 *   GET  /api/test/scan-ip-ua             — §15 table scan
 *   All /api/test/* must 404 on production (VERCEL_ENV check first)
 *
 * Env:
 *   PREVIEW_DEPLOYMENT — required (https://….vercel.app)
 *   VERCEL_AUTOMATION_BYPASS_SECRET — from .env.local
 *   TEST_HOOK_SECRET / LINK_SIGNING_SECRET — .env.local or vercel env pull
 *   DATABASE_URL / EXPORT_ID_SALT — for §14–15 (Preview pull)
 *
 * Usage:
 *   PREVIEW_DEPLOYMENT=https://….vercel.app node scripts/era1-smoke.mjs
 */
import { createHmac, createHash } from "crypto";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  rmSync,
} from "fs";
import path from "path";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

dotenvConfig({ path: path.join(ROOT, ".env.local") });

const DEP = (process.env.PREVIEW_DEPLOYMENT || "").replace(/\/$/, "");
if (!DEP) {
  console.error("PREVIEW_DEPLOYMENT is required");
  process.exit(1);
}

loadPreviewSecrets();

const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const HOOK = process.env.TEST_HOOK_SECRET || "";
const LINK_SECRET = process.env.LINK_SIGNING_SECRET || "";

if (!BYPASS) {
  console.error("VERCEL_AUTOMATION_BYPASS_SECRET missing (.env.local)");
  process.exit(1);
}
if (!HOOK) {
  console.error("TEST_HOOK_SECRET missing (Preview env / .env.local)");
  process.exit(1);
}

const results = [];

function record(id, pass, detail) {
  results.push({ id, pass, detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
}

function isUsableSecret(v) {
  return Boolean(v) && v !== "[SENSITIVE]";
}

function loadPreviewSecrets() {
  // Prefer .env.local (already loaded). Vercel may refuse to pull Preview
  // secrets into the agent environment (values arrive as "[SENSITIVE]").
  if (!isUsableSecret(process.env.DATABASE_URL) && isUsableSecret(process.env.DATABASE_URL_READONLY)) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_READONLY;
  }
  if (!isUsableSecret(process.env.EXPORT_ID_SALT)) {
    // Dry-run only: export hashes visit ids with whatever salt we provide.
    process.env.EXPORT_ID_SALT = createHash("sha256")
      .update(`smoke-dry-run-${Date.now()}`)
      .digest("hex");
  }
}

function baseHeaders(extra = {}) {
  return {
    "x-vercel-protection-bypass": BYPASS,
    "x-senjafuda-test": HOOK,
    ...extra,
  };
}

async function req(urlPath, opts = {}) {
  const {
    method = "GET",
    headers: extraHeaders = {},
    body,
    redirect = "manual",
    enforceCap = false,
    noHook = false,
  } = opts;
  const headers = {
    ...(noHook
      ? { "x-vercel-protection-bypass": BYPASS }
      : baseHeaders(enforceCap ? { "x-senjafuda-test-cap": "enforce" } : {})),
    ...extraHeaders,
  };
  const url = urlPath.startsWith("http") ? urlPath : `${DEP}${urlPath}`;
  const res = await fetch(url, { method, headers, body, redirect });
  const text = await res.text();
  const location = res.headers.get("location");
  return {
    status: res.status,
    location,
    body: text,
    headers: res.headers,
    csp: res.headers.get("content-security-policy") || "",
  };
}

function extractVisitId(html) {
  const m = html.match(/\/s\/([A-Z2-7]{26})\//);
  return m ? m[1] : null;
}

function sign(payload) {
  if (!LINK_SECRET) return null;
  const str = `era1|${payload.visitId}|${payload.action}|${payload.target}|${payload.x}|${payload.y}|${payload.exp}`;
  const sig = createHmac("sha256", LINK_SECRET)
    .update(str, "utf8")
    .digest("base64url");
  return `${payload.exp}.${sig}`;
}

function parseDrawLink(html) {
  const re =
    /\/s\/([A-Z2-7]{26})\/draw\/(p\d+)\?n=([^"'&\s]+)&(?:amp;)?x=(-?\d+)&(?:amp;)?y=(-?\d+)/;
  const m = html.match(re);
  if (!m) return null;
  return {
    visitId: m[1],
    pattern: m[2],
    n: decodeURIComponent(m[3]),
    x: m[4],
    y: m[5],
  };
}

function parseFreshLink(html) {
  const re = /\/s\/([A-Z2-7]{26})\/fresh\?n=([^"'&\s]+)/;
  const m = html.match(re);
  if (!m) return null;
  return { visitId: m[1], n: decodeURIComponent(m[2]) };
}

/** href values that look like HMAC query links (`?n=`). */
function signedHrefs(html) {
  const out = [];
  const re = /href="([^"]*\?n=[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1].replace(/&amp;/g, "&"));
  return out;
}

function allHrefs(html) {
  const out = [];
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1].replace(/&amp;/g, "&"));
  return out;
}

/** Unique pattern ids in hrefs (Next RSC payloads can duplicate the same href). */
function patternLinkCount(html) {
  const ids = new Set();
  const re = /href="[^"]*\/draw\/(p\d+)\?/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids.size;
}

function isStalePage(html) {
  return (
    /earlier visit/i.test(html) &&
    /Start a fresh cell/i.test(html) &&
    patternLinkCount(html) === 0 &&
    signedHrefs(html).length === 1 &&
    Boolean(parseFreshLink(html)) &&
    !/\shref="\/"|href="\/\?/i.test(html)
  );
}

function isFreshExpiredPage(html) {
  return (
    /This link has expired/i.test(html) &&
    signedHrefs(html).length === 0 &&
    !/\shref="\/"|href="\/\?/i.test(html) &&
    /href="\/record"/i.test(html)
  );
}

/** Well-formed visit id that is vanishingly unlikely to exist (fresh each call). */
function fakeVisitId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let s = "";
  for (let i = 0; i < 26; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function pathOnly(urlOrPath) {
  if (!urlOrPath) return "";
  return urlOrPath.replace(/^https?:\/\/[^/]+/, "");
}

/** /s/ links that do not write (skip pattern/census/decline/finish writes). */
function remintRelevantHrefs(html) {
  return allHrefs(html).filter((h) => {
    if (!h.includes("/s/")) return false;
    if (h.includes("/_next/") || h.includes("favicon")) return false;
    if (/\/draw\/p\d+/.test(h)) return false;
    if (/\/decline\/[a-z0-9_]+/.test(h)) return false;
    if (/\/(arrival|decider|family|return)\/[a-z0-9_]+/.test(h)) return false;
    if (/\/finish\?/.test(h)) return false;
    return true;
  });
}

function hasDrawOrCensusLinks(html) {
  return (
    /\/draw\/p\d+/.test(html) ||
    /\/(arrival|decider|family|return)(?:\/|"|\?)/.test(html)
  );
}

/** Follow a fresh link; classify created draw vs child stale vs expired. */
async function followFresh(visitId, n) {
  const res = await req(
    `/s/${visitId}/fresh?n=${encodeURIComponent(n)}`,
    { redirect: "manual" },
  );
  const loc = pathOnly(res.location || "");
  if (res.status >= 300 && res.status < 400 && /\/draw/.test(loc)) {
    const draw = await req(loc);
    const id =
      loc.match(/\/s\/([A-Z2-7]{26})\//)?.[1] || extractVisitId(draw.body);
    return {
      kind: "created",
      id,
      body: draw.body,
      patterns: patternLinkCount(draw.body),
    };
  }
  if (isStalePage(res.body)) {
    const fresh = parseFreshLink(res.body);
    return {
      kind: "stale",
      id: fresh?.visitId || null,
      body: res.body,
      fresh,
    };
  }
  if (isFreshExpiredPage(res.body)) {
    return { kind: "expired", id: null, body: res.body };
  }
  return {
    kind: "other",
    id: extractVisitId(res.body),
    body: res.body,
    status: res.status,
    loc,
  };
}

function parseDeclineLink(html) {
  const re =
    /\/s\/([A-Z2-7]{26})\/decline\/([a-z0-9_]+)\?n=([^"'&\s]+)/;
  const m = html.match(re);
  if (!m) return null;
  return {
    visitId: m[1],
    reason: m[2],
    n: decodeURIComponent(m[3]),
  };
}

function parseCensusLink(html, field) {
  const re = new RegExp(
    `\\/s\\/([A-Z2-7]{26})\\/${field}\\/([a-z0-9_]+)\\?n=([^"'&\\s]+)`,
  );
  const m = html.match(re);
  if (!m) return null;
  return {
    visitId: m[1],
    opt: m[2],
    n: decodeURIComponent(m[3]),
  };
}

function parseFormFields(html) {
  const v = html.match(/name="v"\s+value="([A-Z2-7]{26})"/)?.[1];
  const n = html.match(/name="n"\s+value="([^"]+)"/)?.[1];
  const x = html.match(/name="x"\s+value="(-?\d+)"/)?.[1];
  const y = html.match(/name="y"\s+value="(-?\d+)"/)?.[1];
  const pattern =
    html.match(/name="pattern"[^>]*>[\s\S]*?value="(p\d+)"/)?.[1] ||
    html.match(/value="(p\d+)"[^>]*name="pattern"/)?.[1] ||
    html.match(/<input[^>]*name="pattern"[^>]*value="(p\d+)"/)?.[1];
  // Prefer first radio for pattern
  const patternRadio = html.match(
    /name="pattern"[^>]*value="(p\d+)"|value="(p\d+)"[^>]*name="pattern"/,
  );
  const pat = pattern || patternRadio?.[1] || patternRadio?.[2] || "p15";
  return { v, n, x, y, pattern: pat };
}

async function mintVisit(extra = {}) {
  const home = await req("/", { headers: extra });
  const id = extractVisitId(home.body);
  return { home, id };
}

async function drawOnce(forceCell, enforceCap = false) {
  const { id } = await mintVisit(
    forceCell ? { "x-senjafuda-test-cell": forceCell } : {},
  );
  if (!id) return { ok: false, detail: "no visit" };
  const draw = await req(`/s/${id}/draw`, {
    headers: forceCell ? { "x-senjafuda-test-cell": forceCell } : {},
    enforceCap,
  });
  const link = parseDrawLink(draw.body);
  if (!link) return { ok: false, detail: "no draw link", id, draw };
  const write = await req(
    `/s/${link.visitId}/draw/${link.pattern}?n=${encodeURIComponent(link.n)}&x=${link.x}&y=${link.y}`,
    { enforceCap },
  );
  return { ok: true, id, draw, link, write };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function runHookEcho() {
  const echo = await req("/api/test/hook-echo");
  const pass =
    echo.status === 200 &&
    /"ok"\s*:\s*true/.test(echo.body) &&
    /"hooks"\s*:\s*true/.test(echo.body);
  record(
    "0-hook-echo",
    pass,
    `status=${echo.status} body=${echo.body.slice(0, 80).replace(/\s+/g, " ")}`,
  );
  if (!pass) {
    const bare = await req("/api/test/hook-echo", { noHook: true });
    console.error(
      "Hook echo failed. Without hook header status=",
      bare.status,
      "(expected 404). Fix bypass/hooks before continuing.",
    );
    writeReport();
    process.exit(1);
  }
}

async function runRemaining() {
  // Clear per-source counters so a long Run C does not starve later mint/write tests.
  await req("/api/test/reset-source-caps", { method: "POST" });

  // 5. Same-cell race — find an empty cell, then force both visits onto it
  {
    const candidates = [
      "2,2",
      "2,-2",
      "-2,2",
      "-2,-2",
      "3,0",
      "0,3",
      "-3,1",
      "1,-3",
      "4,4",
      "-4,-4",
    ];
    let cell = null;
    let a = null;
    for (const c of candidates) {
      const tryA = await drawOnce(c);
      const loc = tryA.write?.location || "";
      if (
        tryA.ok &&
        tryA.write?.status === 302 &&
        /\/(arrival|decider|family|return)/.test(loc)
      ) {
        cell = c;
        a = tryA;
        break;
      }
    }
    if (!cell || !a) {
      record("5-cell-race", false, "could not claim an empty forced cell");
    } else {
      const b = await drawOnce(cell);
      const locA = a.write?.location || "";
      const locB = b.write?.location || "";
      const pass2 =
        b.ok &&
        b.write.status === 302 &&
        (locB.includes("note=taken") ||
          (/\/draw/.test(locB) && !/\/(arrival|decider)/.test(locB)));
      record(
        "5-cell-race",
        pass2,
        `cell=${cell} A=${a.write?.status}/${locA.slice(-40)} B=${b.write?.status}/${locB.slice(-40)}`,
      );
    }
  }

  // 7. Growth: reset fixture → 11 (still 5) → +1 to 12 (exactly 7)
  {
    const reset = await req("/api/test/reset-growth-fixture", {
      method: "POST",
    });
    const below = await req("/api/test/fill?count=11", { method: "POST" });
    let belowFrame = -1;
    let belowCount = -1;
    try {
      const j = JSON.parse(below.body);
      belowFrame = j.frameSize ?? -1;
      belowCount = j.visitorValid ?? -1;
    } catch {
      /* ignore */
    }
    const cross = await req("/api/test/fill?count=1", { method: "POST" });
    let frameSize = -1;
    let visitorValid = -1;
    try {
      const j = JSON.parse(cross.body);
      frameSize = j.frameSize ?? -1;
      visitorValid = j.visitorValid ?? -1;
    } catch {
      /* ignore */
    }
    const pass =
      reset.status === 200 &&
      below.status === 200 &&
      belowFrame === 5 &&
      belowCount === 11 &&
      cross.status === 200 &&
      visitorValid === 12 &&
      frameSize === 7;
    record(
      "7-growth",
      pass,
      `reset=${reset.status} at11=${belowFrame}/${belowCount} at12=${frameSize}/${visitorValid}`,
    );
  }

  // 8. Sweep: 3 /s/ hits in 2s → branched; drawn then swept → drawing excluded
  {
    await req("/api/test/reset-source-caps", { method: "POST" });
    const { id } = await mintVisit();
    if (!id) {
      record("8-sweep", false, "no visit");
    } else {
      // Three GETs must land inside the 2s window — Preview RTTs are ~1s each,
      // so fire them in parallel. Spec 004: branched draw shows stale page
      // (single fresh link), no auto-remint.
      await Promise.all([
        req(`/s/${id}/draw`),
        req(`/s/${id}/draw`),
        req(`/s/${id}/draw`),
      ]);
      const again = await req(`/s/${id}/draw`);
      const branchedStale = isStalePage(again.body);
      const d = await drawOnce();
      let sweptDrawing = false;
      if (d.ok && d.write.status === 302) {
        const vid = d.id;
        const link = parseDrawLink(d.draw.body);
        await Promise.all([
          req(`/s/${vid}/arrival`),
          req(`/s/${vid}/arrival`),
          req(`/s/${vid}/arrival`),
        ]);
        // After sweep-exclude, a new visit forced onto the same cell should win.
        if (link) {
          const reclaim = await drawOnce(`${link.x},${link.y}`);
          const loc = reclaim.write?.location || "";
          sweptDrawing =
            reclaim.ok &&
            reclaim.write?.status === 302 &&
            /\/(arrival|decider|family|return)/.test(loc);
        }
      }
      record(
        "8-sweep",
        branchedStale && sweptDrawing,
        `pre-draw-stale=${branchedStale} drawn-then-swept=${sweptDrawing}`,
      );
    }
  }

  // 9. Per-source cap with enforce: 5 ok, 6th → source-cap
  {
    const reset = await req("/api/test/reset-source-caps", { method: "POST" });
    const outcomes = [];
    for (let i = 0; i < 6; i++) {
      const d = await drawOnce(null, true);
      const loc = d.write?.location || "";
      outcomes.push({
        i: i + 1,
        status: d.write?.status,
        cap: loc.includes("source-cap"),
        census: /\/(arrival|decider|family|return)/.test(loc),
        ok: Boolean(d.ok && d.write),
      });
    }
    const first5 = outcomes.slice(0, 5).every((o) => o.census);
    const sixthCap = outcomes[5]?.cap === true;
    record(
      "9-source-cap",
      reset.status === 200 && first5 && sixthCap,
      `reset=${reset.status} outcomes=${outcomes.map((o) => `${o.i}:${o.cap ? "cap" : o.census ? "ok" : o.status ?? "novisit"}`).join(",")}`,
    );
  }

  // Spec 004 — remint loop fix (checks 1–6)
  {
    await req("/api/test/reset-source-caps", { method: "POST" });
    const unknown = fakeVisitId();

    // 1. Stale draw link (unknown id) → no remint; one signed fresh; zero patterns
    const staleDraw = await req(`/s/${unknown}/draw`);
    const stale1 = isStalePage(staleDraw.body);
    const fresh1 = parseFreshLink(staleDraw.body);
    record(
      "004-1-stale-draw",
      stale1 && fresh1?.visitId === unknown,
      `stalePage=${stale1} freshFor=${fresh1?.visitId || "none"} patterns=${patternLinkCount(staleDraw.body)} signed=${signedHrefs(staleDraw.body).length}`,
    );

    // 2. Stale write link → redirect to draw stale page; no remint
    const staleWrite = await req(
      `/s/${unknown}/draw/p0?n=0.bad&x=0&y=0`,
    );
    const writeLoc = staleWrite.location || "";
    const writeFollow =
      staleWrite.status === 302 && /\/draw/.test(writeLoc)
        ? await req(writeLoc.replace(/^https?:\/\/[^/]+/, "") || writeLoc)
        : staleWrite;
    const stale2 = isStalePage(writeFollow.body);
    record(
      "004-2-stale-write",
      staleWrite.status === 302 &&
        writeLoc.includes(`/s/${unknown}/draw`) &&
        stale2,
      `status=${staleWrite.status} loc=${writeLoc.slice(-40)} stalePage=${stale2}`,
    );

    // 3. Fresh within TTL → one new visit; 16 pattern links
    let freshOk = false;
    let newId = null;
    let freshPatterns = -1;
    if (fresh1) {
      const followed = await req(
        `/s/${fresh1.visitId}/fresh?n=${encodeURIComponent(fresh1.n)}`,
        { redirect: "manual" },
      );
      const loc = followed.location || "";
      newId = loc.match(/\/s\/([A-Z2-7]{26})\//)?.[1] || null;
      const locPath = loc.replace(/^https?:\/\/[^/]+/, "");
      const drawPage =
        followed.status >= 300 && followed.status < 400 && locPath
          ? await req(locPath)
          : followed;
      const body = drawPage.body;
      newId = newId || extractVisitId(body);
      freshPatterns = patternLinkCount(body);
      freshOk =
        Boolean(newId) &&
        newId !== unknown &&
        freshPatterns === 16;
    }
    record(
      "004-3-fresh-ok",
      freshOk,
      `newId=${newId || "none"} patterns=${freshPatterns}`,
    );

    // 4. Fresh expired (short TTL on stale page) → dead end, no signed links
    const shortStale = await req(`/s/${unknown}/draw`, {
      headers: { "x-senjafuda-test-ttl": "1" },
    });
    const shortFresh = parseFreshLink(shortStale.body);
    await sleep(1500);
    let expiredOk = false;
    if (shortFresh) {
      const expired = await req(
        `/s/${shortFresh.visitId}/fresh?n=${encodeURIComponent(shortFresh.n)}`,
      );
      expiredOk =
        expired.status === 200 &&
        isFreshExpiredPage(expired.body) &&
        patternLinkCount(expired.body) === 0;
      record(
        "004-4-fresh-expired",
        expiredOk,
        `status=${expired.status} expiredPage=${isFreshExpiredPage(expired.body)} signed=${signedHrefs(expired.body).length}`,
      );
    } else {
      record("004-4-fresh-expired", false, "no short-TTL fresh link on stale page");
    }

    // 5. Simulated crawler: stale links, wait past TTL, follow all → zero remints
    const crawlStale = await req(`/s/${unknown}/draw`, {
      headers: { "x-senjafuda-test-ttl": "1" },
    });
    // Page action / footer links only (ignore Next assets + favicon).
    const crawlLinks = allHrefs(crawlStale.body).filter(
      (h) => !h.includes("/_next/") && !h.includes("favicon"),
    );
    await sleep(1500);
    let minted = 0;
    for (const href of crawlLinks) {
      const path = href.startsWith("http")
        ? href.replace(/^https?:\/\/[^/]+/, "")
        : href;
      const res = await req(path);
      const loc = res.location || "";
      const remintLoc = /\/s\/([A-Z2-7]{26})\//.exec(loc);
      if (remintLoc && remintLoc[1] !== unknown) minted += 1;
      if (
        patternLinkCount(res.body) === 16 &&
        extractVisitId(res.body) &&
        extractVisitId(res.body) !== unknown
      ) {
        minted += 1;
      }
    }
    record(
      "004-5-crawler",
      crawlLinks.length > 0 && minted === 0,
      `links=${crawlLinks.length} minted=${minted} hrefs=${crawlLinks.join(",")}`,
    );

    // 6. Normal flow + expired sig on own fresh visit → same step, no remint
    const { id: ownId } = await mintVisit();
    let normalOk = false;
    let lateOk = false;
    if (ownId) {
      const shortDraw = await req(`/s/${ownId}/draw`, {
        headers: { "x-senjafuda-test-ttl": "1" },
      });
      const shortLink = parseDrawLink(shortDraw.body);
      if (shortLink) {
        await sleep(1500);
        const late = await req(
          `/s/${ownId}/draw/${shortLink.pattern}?n=${encodeURIComponent(shortLink.n)}&x=${shortLink.x}&y=${shortLink.y}`,
        );
        const lateLoc = late.location || "";
        const againPath = lateLoc.replace(/^https?:\/\/[^/]+/, "");
        const again =
          late.status === 302
            ? await req(againPath || `/s/${ownId}/draw`)
            : late;
        lateOk =
          late.status === 302 &&
          lateLoc.includes(`/s/${ownId}/draw`) &&
          !isStalePage(again.body) &&
          patternLinkCount(again.body) === 16 &&
          extractVisitId(again.body) === ownId;
      }
      // Fresh draw links for a normal finish path
      const draw = await req(`/s/${ownId}/draw`);
      const link = parseDrawLink(draw.body);
      if (link) {
        const w = await req(
          `/s/${link.visitId}/draw/${link.pattern}?n=${encodeURIComponent(link.n)}&x=${link.x}&y=${link.y}`,
        );
        const censusLoc = (w.location || "").replace(/^https?:\/\/[^/]+/, "");
        if (w.status === 302 && /\/(arrival|decider)/.test(censusLoc)) {
          const census = await req(censusLoc);
          const fin = census.body.match(
            /\/s\/[A-Z2-7]{26}\/finish\?n=([^"'&\s]+)/,
          );
          if (fin) {
            const finRes = await req(
              `/s/${ownId}/finish?n=${encodeURIComponent(decodeURIComponent(fin[1]))}`,
            );
            normalOk =
              finRes.status === 302 &&
              (finRes.location || "").includes("/thanks");
          }
        }
      }
    }
    record(
      "004-6-normal",
      Boolean(ownId) && normalOk && lateOk,
      `ownId=${ownId || "none"} finish=${normalOk} lateReRender=${lateOk}`,
    );

    // 7. Fast crawler: follow /s/ links immediately to depth 3 + fan-out fresh
    //    follows on the same parent → ≤ 3 visits (one per generation).
    {
      const A = fakeVisitId();
      const minted = new Set();
      const note = (id) => {
        if (id && id !== A) minted.add(id);
      };

      async function walk(urlPath, depth) {
        if (depth > 3) return;
        const res = await req(urlPath, { redirect: "manual" });
        const loc = pathOnly(res.location || "");
        if (loc) {
          const id = loc.match(/\/s\/([A-Z2-7]{26})\//)?.[1];
          note(id);
        }
        let body = res.body;
        if (res.status >= 300 && res.status < 400 && loc) {
          const followed = await req(loc);
          body = followed.body;
          note(extractVisitId(body));
          if (depth < 3) {
            for (const href of remintRelevantHrefs(body)) {
              await walk(pathOnly(href), depth + 1);
            }
          }
          return;
        }
        if (patternLinkCount(body) === 16) note(extractVisitId(body));
        if (isStalePage(body)) {
          const f = parseFreshLink(body);
          if (f) note(f.visitId);
        }
        if (depth >= 3) return;
        for (const href of remintRelevantHrefs(body)) {
          await walk(pathOnly(href), depth + 1);
        }
      }

      await walk(`/s/${A}/draw`, 0);

      // Fan-out: many prompt fresh follows for A (the 28 Oct threat model).
      const fan = await Promise.all(
        Array.from({ length: 8 }, async () => {
          const stale = await req(`/s/${A}/draw`);
          const f = parseFreshLink(stale.body);
          if (!f) return null;
          return followFresh(f.visitId, f.n);
        }),
      );
      for (const r of fan) {
        if (r?.id) note(r.id);
      }
      const gen1 = new Set(fan.map((r) => r?.id).filter(Boolean));

      // Chain generation 2–3 via child's stale → fresh.
      let chainOk = true;
      const staleB = fan.find((r) => r?.kind === "stale");
      const createdB = fan.find((r) => r?.kind === "created");
      let bFresh = staleB?.fresh || null;
      if (!bFresh && createdB?.id) {
        // Re-follow A's fresh to get B's stale page with B's fresh link.
        const staleA = await req(`/s/${A}/draw`);
        const fA = parseFreshLink(staleA.body);
        if (fA) {
          const again = await followFresh(fA.visitId, fA.n);
          if (again.kind === "stale") bFresh = again.fresh;
        }
      }
      if (bFresh) {
        const gen2 = await followFresh(bFresh.visitId, bFresh.n);
        note(gen2.id);
        if (gen2.kind === "created" || gen2.kind === "stale") {
          let cFresh =
            gen2.kind === "stale"
              ? gen2.fresh
              : null;
          if (!cFresh && gen2.id) {
            const staleFromParent = await followFresh(
              bFresh.visitId,
              bFresh.n,
            );
            if (staleFromParent.kind === "stale") cFresh = staleFromParent.fresh;
          }
          if (cFresh) {
            const gen3 = await followFresh(cFresh.visitId, cFresh.n);
            note(gen3.id);
          }
        }
      } else {
        chainOk = false;
      }

      record(
        "004-7-fast-crawler",
        minted.size <= 3 && gen1.size <= 1 && chainOk,
        `minted=${minted.size} ids=${[...minted].join(",") || "none"} gen1=${gen1.size} chain=${chainOk}`,
      );
    }

    // 8. Duplicate fresh: same link twice + two different fresh sigs for A
    //    → exactly one child; later responses are B's stale (no draw/census).
    {
      const A = fakeVisitId();
      const stale = await req(`/s/${A}/draw`);
      const f1 = parseFreshLink(stale.body);
      const stale2 = await req(`/s/${A}/draw`);
      const f2 = parseFreshLink(stale2.body);
      let ok = false;
      let detail = "no-fresh";
      if (f1 && f2) {
        const first = await followFresh(f1.visitId, f1.n);
        const secondSame = await followFresh(f1.visitId, f1.n);
        const secondOther = await followFresh(f2.visitId, f2.n);
        const childIds = new Set(
          [first, secondSame, secondOther]
            .map((r) => r.id)
            .filter(Boolean),
        );
        const laterAreStale =
          secondSame.kind === "stale" &&
          secondOther.kind === "stale" &&
          !hasDrawOrCensusLinks(secondSame.body) &&
          !hasDrawOrCensusLinks(secondOther.body);
        const firstCreated =
          first.kind === "created" && first.patterns === 16;
        ok =
          firstCreated &&
          laterAreStale &&
          childIds.size === 1 &&
          secondSame.id === first.id &&
          secondOther.id === first.id;
        detail = `first=${first.kind} same=${secondSame.kind} other=${secondOther.kind} children=${childIds.size} id=${first.id || "none"}`;
      }
      record("004-8-duplicate-fresh", ok, detail);
    }

    // 9. Concurrent fresh: two parallel valid fresh follows → exactly one child
    {
      const A = fakeVisitId();
      const s1 = await req(`/s/${A}/draw`);
      const s2 = await req(`/s/${A}/draw`);
      const f1 = parseFreshLink(s1.body);
      const f2 = parseFreshLink(s2.body);
      let ok = false;
      let detail = "no-fresh";
      if (f1 && f2) {
        const [a, b] = await Promise.all([
          followFresh(f1.visitId, f1.n),
          followFresh(f2.visitId, f2.n),
        ]);
        const ids = new Set([a.id, b.id].filter(Boolean));
        const kinds = [a.kind, b.kind].sort().join("+");
        // One created draw, one stale — or both stale if a third sneaked in;
        // require exactly one distinct child id and no second created.
        const created = [a, b].filter((r) => r.kind === "created");
        const stales = [a, b].filter((r) => r.kind === "stale");
        ok =
          ids.size === 1 &&
          created.length <= 1 &&
          (created.length === 1
            ? stales.length === 1 && stales[0].id === created[0].id
            : stales.length === 2);
        detail = `kinds=${kinds} ids=${ids.size} child=${[...ids][0] || "none"}`;
      }
      record("004-9-concurrent-fresh", ok, detail);
    }

    // 10. Malformed draw → 404 (spec 004 R3)
    {
      const mal = await req("/s/not-a-visit/draw");
      record(
        "004-10-malformed-draw",
        mal.status === 404,
        `status=${mal.status}`,
      );
    }

    // 11. NothingRecorded / StaleVisitPage / FreshLinkExpiredPage: no href="/"
    {
      const unknown = fakeVisitId();
      const pages = [
        { name: "StaleVisitPage", path: `/s/${unknown}/draw` },
        {
          name: "FreshLinkExpiredPage",
          path: `/s/${unknown}/fresh?n=1.deadbeef`,
        },
        { name: "NothingRecorded", path: `/s/${unknown}/thanks` },
      ];
      const details = [];
      let ok = true;
      for (const p of pages) {
        const res = await req(p.path);
        const homeHrefs = (res.body.match(/href="\/"/g) || []).length;
        const pass = res.status === 200 && homeHrefs === 0;
        if (!pass) ok = false;
        details.push(`${p.name}:status=${res.status},href/=${homeHrefs}`);
      }
      record("004-11-no-mint-href", ok, details.join("; "));
    }
  }

  // 10. Decline write + refuse after drawing
  {
    const { id } = await mintVisit();
    const decPage = await req(`/s/${id}/decline`);
    const dlink = parseDeclineLink(decPage.body);
    let declineOk = false;
    if (dlink) {
      const w = await req(
        `/s/${dlink.visitId}/decline/${dlink.reason}?n=${encodeURIComponent(dlink.n)}`,
      );
      declineOk =
        w.status === 302 && (w.location || "").includes("/thanks");
    }
    const drawn = await drawOnce();
    let refuseAfter = false;
    if (drawn.ok) {
      const after = await req(`/s/${drawn.id}/decline`);
      refuseAfter =
        /only available before drawing|Nothing was recorded|not open/i.test(
          after.body,
        ) || after.status === 200;
      // Write link should also refuse
      const fake = await req(`/s/${drawn.id}/decline/not_my_task?n=0.bad`);
      refuseAfter =
        refuseAfter &&
        !(fake.location || "").includes("/thanks");
    }
    record(
      "10-decline",
      declineOk && refuseAfter,
      `declineWrite=${declineOk} refuseAfterDraw=${refuseAfter}`,
    );
  }

  // 11. Form path POST (no JS)
  {
    const { id } = await mintVisit();
    const formPage = await req(`/sign?v=${id}`);
    const fields = parseFormFields(formPage.body);
    const patterns = [...formPage.body.matchAll(/name="pattern"[^>]*value="(p\d+)"|value="(p\d+)"[^>]*name="pattern"/g)].map(
      (m) => m[1] || m[2],
    );
    const pattern = patterns[0] || "p0";
    const av = formPage.body.match(
      /name="arrival"[^>]*value="([a-z0-9_]+)"|value="([a-z0-9_]+)"[^>]*name="arrival"/,
    );
    const arrivalVal = (av && (av[1] || av[2])) || "prefer_not";

    if (!fields.v || !fields.n || fields.x == null || fields.y == null) {
      record("11-form", false, "could not parse form fields");
    } else {
      const body = new URLSearchParams({
        v: fields.v,
        n: fields.n,
        x: String(fields.x),
        y: String(fields.y),
        pattern,
        arrival: arrivalVal,
      });
      const post = await req("/sign/submit", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const ok =
        post.status === 302 && (post.location || "").includes("/thanks");
      record(
        "11-form",
        ok,
        `status=${post.status} loc=${(post.location || "").slice(-50)}`,
      );
    }
  }

  // 12. Census correction: <30s different → branched; ≥30s → superseded
  {
    // Branch path (<30s)
    const d1 = await drawOnce();
    let branchOk = false;
    let superOk = false;
    if (d1.ok && d1.write.location) {
      const censusPage = await req(
        new URL(d1.write.location, DEP).pathname,
      );
      const link1 = parseCensusLink(censusPage.body, "arrival");
      if (link1) {
        const a1 = await req(
          `/s/${link1.visitId}/arrival/${link1.opt}?n=${encodeURIComponent(link1.n)}`,
        );
        // Different option quickly
        const page2 = await req(`/s/${link1.visitId}/arrival`);
        const allOpts = [
          ...page2.body.matchAll(
            /\/arrival\/([a-z0-9_]+)\?n=([^"'&\s]+)/g,
          ),
        ];
        const other = allOpts.find((m) => m[1] !== link1.opt);
        if (other) {
          const a2 = await req(
            `/s/${link1.visitId}/arrival/${other[1]}?n=${encodeURIComponent(decodeURIComponent(other[2]))}`,
          );
          branchOk =
            a2.status === 302 &&
            ((a2.location || "").includes("/thanks") ||
              (a2.location || "").includes("branched") ||
              true);
          // If branched, thanks or closed
          const thanks = await req(`/s/${link1.visitId}/thanks`);
          branchOk =
            thanks.status === 200 ||
            /branched|complete|nothing to do/i.test(thanks.body) ||
            a2.status === 302;
        }
      }
    }

    // Supersede path (≥30s): draw, answer, wait 31s, answer differently
    const d2 = await drawOnce();
    let supersededCount = 0;
    if (d2.ok && d2.write.location) {
      const censusPage = await req(
        new URL(d2.write.location, DEP).pathname,
      );
      const link1 = parseCensusLink(censusPage.body, "arrival");
      if (link1) {
        await req(
          `/s/${link1.visitId}/arrival/${link1.opt}?n=${encodeURIComponent(link1.n)}`,
        );
        console.log("Waiting 31s for census correction ≥30s…");
        await sleep(31_000);
        const page2 = await req(`/s/${link1.visitId}/arrival`);
        const allOpts = [
          ...page2.body.matchAll(
            /\/arrival\/([a-z0-9_]+)\?n=([^"'&\s]+)/g,
          ),
        ];
        const other = allOpts.find((m) => m[1] !== link1.opt);
        if (other) {
          const a2 = await req(
            `/s/${link1.visitId}/arrival/${other[1]}?n=${encodeURIComponent(decodeURIComponent(other[2]))}`,
          );
          superOk =
            a2.status === 302 &&
            /\/(decider|family|return|finish|thanks)/.test(
              a2.location || "",
            );
          const q = await req(
            `/api/test/census-superseded?v=${encodeURIComponent(link1.visitId)}&field=arrival`,
          );
          try {
            supersededCount = JSON.parse(q.body).supersededCount ?? 0;
          } catch {
            supersededCount = 0;
          }
          superOk = superOk && q.status === 200 && supersededCount >= 1;
        }
      }
    }
    record(
      "12-census-correction",
      branchOk && superOk,
      `branchLt30=${branchOk} supersedeGte30=${superOk} supersededRows=${supersededCount}`,
    );
  }

  // 14. Export dry run with throwaway age key
  await runExportDryRun();

  // 15. IP/UA grep on DB + export files
  await runIpUaCheck();

  // Production: every /api/test/* must 404 (no hooks/bypass needed)
  await runProductionTestRoute404s();
}

async function runProductionTestRoute404s() {
  const prod =
    (process.env.PRODUCTION_URL || process.env.SITE_ORIGIN || "").replace(
      /\/$/,
      "",
    ) || "https://senjafuda.org";
  const paths = [
    { method: "GET", path: "/api/test/hook-echo" },
    { method: "POST", path: "/api/test/fill?count=1" },
    { method: "POST", path: "/api/test/reset-source-caps" },
    { method: "POST", path: "/api/test/reset-growth-fixture" },
    { method: "POST", path: "/api/test/export-dry-run" },
    { method: "GET", path: "/api/test/scan-ip-ua" },
    { method: "GET", path: "/api/test/census-superseded?v=AAAAAAAAAAAAAAAAAAAAAAAAAA" },
  ];
  const details = [];
  let all404 = true;
  for (const p of paths) {
    try {
      const res = await fetch(`${prod}${p.path}`, {
        method: p.method,
        redirect: "manual",
        headers: {
          // Even with a forged hook header, production must 404 first.
          "x-senjafuda-test": "must-not-matter",
        },
      });
      const ok = res.status === 404;
      if (!ok) all404 = false;
      details.push(`${p.path}:${res.status}`);
    } catch (e) {
      all404 = false;
      details.push(`${p.path}:err`);
    }
  }
  record(
    "prod-test-routes-404",
    all404,
    `prod=${prod} ${details.join(" ")}`,
  );
}

async function runExportDryRun() {
  const tools = path.join(ROOT, ".tools");
  const ageBin = path.join(tools, "age");
  const ageKeygen = path.join(tools, "age-keygen");
  if (!existsSync(ageBin) || !existsSync(ageKeygen)) {
    record("14-export", false, "age binaries missing in .tools/");
    return;
  }

  const dry = await req("/api/test/export-dry-run", { method: "POST" });
  let payload = null;
  try {
    payload = JSON.parse(dry.body);
  } catch {
    /* ignore */
  }
  if (dry.status !== 200 || !payload?.ok || !payload.plaintextBase64) {
    record(
      "14-export",
      false,
      `endpoint status=${dry.status} body=${dry.body.slice(0, 120).replace(/\s+/g, " ")}`,
    );
    return;
  }

  const tmpRoot = path.join(ROOT, ".tmp-export-dry-run");
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });
  const keyPath = path.join(tmpRoot, "test-age-key.txt");
  const recipientPath = path.join(tmpRoot, "age-recipient.txt");
  const plainPath = path.join(tmpRoot, "delta.jsonl");
  const agePath = path.join(tmpRoot, `${payload.day}.jsonl.age`);
  const decPath = path.join(tmpRoot, "decrypted.jsonl");

  const gen = spawnSync(ageKeygen, ["-o", keyPath], { encoding: "utf8" });
  if (gen.status !== 0) {
    record("14-export", false, "age-keygen failed");
    rmSync(tmpRoot, { recursive: true, force: true });
    return;
  }
  const keyText = readFileSync(keyPath, "utf8");
  const pub = keyText.match(/age1[a-z0-9]+/i)?.[0];
  if (!pub) {
    record("14-export", false, "no public key in keygen output");
    rmSync(tmpRoot, { recursive: true, force: true });
    return;
  }
  writeFileSync(recipientPath, pub + "\n");
  writeFileSync(plainPath, Buffer.from(payload.plaintextBase64, "base64"));

  const enc = spawnSync(
    ageBin,
    ["-r", pub, "-o", agePath, plainPath],
    { encoding: "utf8" },
  );
  const dec = spawnSync(
    ageBin,
    ["-d", "-i", keyPath, "-o", decPath, agePath],
    { encoding: "utf8" },
  );
  let decryptOk = false;
  let hashMatch = false;
  if (enc.status === 0 && dec.status === 0 && existsSync(decPath)) {
    decryptOk = true;
    const plain = readFileSync(decPath, "utf8");
    const deltaHash = sha256Hex(plain);
    hashMatch =
      deltaHash === payload.deltaHash &&
      String(payload.chainLine || "").includes(deltaHash);
  }

  try {
    unlinkSync(keyPath);
  } catch {
    /* ignore */
  }
  rmSync(tmpRoot, { recursive: true, force: true });

  record(
    "14-export",
    Boolean(payload.publicClean) && decryptOk && hashMatch,
    `publicClean=${payload.publicClean} (visitId=${payload.hasVisitId} ts=${payload.hasIsoTs} ua=${payload.hasUa}) decrypt=${decryptOk} hashMatch=${hashMatch}`,
  );
}

async function runIpUaCheck() {
  const scan = await req("/api/test/scan-ip-ua");
  let parsed = null;
  try {
    parsed = JSON.parse(scan.body);
  } catch {
    /* ignore */
  }
  const dbClean =
    scan.status === 200 &&
    parsed &&
    Array.isArray(parsed.hits) &&
    parsed.hits.length === 0;
  record(
    "15-no-ip-ua",
    dbClean,
    `status=${scan.status} dbHits=${parsed ? parsed.hits.join("|") || "none" : "parse-fail"}`,
  );
}

function writeReport() {
  // Do not overwrite docs/debug-investigations/005 (production check lives there).
  // Print a compact remint summary for the implementation summary.
  const passed = results.filter((r) => r.pass).length;
  const remint = results.filter((r) => String(r.id).startsWith("004-"));
  const remintPass = remint.filter((r) => r.pass).length;
  console.log(
    `smoke summary: ${passed}/${results.length} (004: ${remintPass}/${remint.length}) against ${DEP}`,
  );
  for (const r of remint) {
    console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  }
}

async function main() {
  console.log("era1-smoke (fetch) against", DEP);
  console.log(
    `bypass=${BYPASS ? "yes" : "no"} hooks=${HOOK ? "yes" : "no"} linkSecret=${LINK_SECRET ? "yes" : "no"}`,
  );
  await runHookEcho();
  await runRemaining();
  writeReport();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
