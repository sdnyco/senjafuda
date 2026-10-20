/**
 * Era 1 preview smoke (spec §13 / R16).
 *
 * Uses `vercel curl` for protection bypass (same pattern as preview-sweep-smoke.mjs).
 *
 * Contract — test hooks (Preview only):
 *   Header x-senjafuda-test: <TEST_HOOK_SECRET>
 *   Header x-senjafuda-test-cell: x,y
 *   Header x-senjafuda-test-ttl: <sec>
 *   POST /api/test/fill?count=n
 *
 * Env:
 *   PREVIEW_DEPLOYMENT — deployment URL (required), e.g. https://senjafuda-….vercel.app
 *   TEST_HOOK_SECRET / LINK_SIGNING_SECRET — optional; if unset, tries vercel env pull
 *
 * Results: docs/debug-investigations/003-era1-preview-smoke.md
 */
import { createHmac } from "crypto";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { config as dotenvConfig } from "dotenv";

const DEP = (process.env.PREVIEW_DEPLOYMENT || "").replace(/\/$/, "");
if (!DEP) {
  console.error("PREVIEW_DEPLOYMENT is required");
  process.exit(1);
}

loadPreviewSecrets();

const results = [];

function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
}

function loadPreviewSecrets() {
  if (process.env.TEST_HOOK_SECRET && process.env.LINK_SIGNING_SECRET) return;
  const tmp = path.join(process.cwd(), ".env.vercel.preview.tmp");
  try {
    const r = spawnSync(
      "pnpm",
      [
        "exec",
        "vercel",
        "env",
        "pull",
        tmp,
        "--environment",
        "preview",
        "--yes",
      ],
      { encoding: "utf8" },
    );
    if (r.status === 0 && existsSync(tmp)) {
      dotenvConfig({ path: tmp, override: false });
      unlinkSync(tmp);
    }
  } catch {
    /* optional */
  }
}

function vercelCurl(urlPath, extraCurlArgs = []) {
  const args = [
    "exec",
    "vercel",
    "curl",
    urlPath,
    "--deployment",
    DEP,
    "--yes",
    "--",
    "-sS",
    "-D",
    "-",
    "-o",
    "-",
    ...extraCurlArgs,
  ];
  const r = spawnSync("pnpm", args, {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
  const out = (r.stdout || "") + (r.stderr || "");
  // Strip CLI noise before HTTP response
  const httpAt = out.search(/HTTP\/[\d.]+ \d+/);
  const sliced = httpAt >= 0 ? out.slice(httpAt) : out;
  const split = sliced.indexOf("\r\n\r\n");
  const headers = split >= 0 ? sliced.slice(0, split) : sliced;
  const body = split >= 0 ? sliced.slice(split + 4) : "";
  const statusMatch = headers.match(/HTTP\/[\d.]+ (\d+)/);
  const location = headers.match(/^location:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const csp = headers.match(/^content-security-policy:\s*(.+)$/im)?.[1]?.trim() ?? "";
  return {
    ok: r.status === 0 || r.status === null,
    status: statusMatch ? Number(statusMatch[1]) : null,
    location,
    body,
    headers,
    csp,
    raw: out,
  };
}

function extractVisitId(html) {
  const m = html.match(/\/s\/([A-Z2-7]{26})\//);
  return m ? m[1] : null;
}

function sign(payload) {
  const secret = process.env.LINK_SIGNING_SECRET;
  if (!secret) return null;
  const str = `era1|${payload.visitId}|${payload.action}|${payload.target}|${payload.x}|${payload.y}|${payload.exp}`;
  const sig = createHmac("sha256", secret).update(str, "utf8").digest("base64url");
  return `${payload.exp}.${sig}`;
}

function hookArgs(extraHeaders = {}) {
  const secret = process.env.TEST_HOOK_SECRET;
  const args = [];
  if (secret) {
    args.push("-H", `x-senjafuda-test: ${secret}`);
  }
  for (const [k, v] of Object.entries(extraHeaders)) {
    args.push("-H", `${k}: ${v}`);
  }
  return args;
}

function main() {
  console.log("era1-smoke against", DEP);
  const hook = process.env.TEST_HOOK_SECRET;
  const linkSecret = process.env.LINK_SIGNING_SECRET;
  console.log(
    `hooks=${hook ? "yes" : "no"} linkSecret=${linkSecret ? "yes" : "no"}`,
  );

  // 1. Landing
  const home = vercelCurl("/");
  const hasSeed =
    home.body.includes("▢") &&
    home.body.includes("·") &&
    home.body.includes("0 1 2 3 4");
  const visitId = extractVisitId(home.body);
  record(
    "1-landing",
    home.status === 200 && hasSeed && Boolean(visitId),
    `status=${home.status} seed=${hasSeed} visit=${visitId ? "yes" : "no"}`,
  );

  const head = vercelCurl("/", ["-I", "-X", "HEAD"]);
  record("1-head", head.status === 200, `status=${head.status}`);

  if (!visitId) {
    writeReport();
    process.exit(1);
  }

  // 2. Draw → census → finish → thanks
  const draw = vercelCurl(`/s/${visitId}/draw`, hookArgs());
  const hasQ = draw.body.includes("?");
  const patternLink = draw.body.match(
    /\/s\/[A-Z2-7]{26}\/draw\/(p\d+)\?n=([^"'&\s]+)&amp;x=(-?\d+)&amp;y=(-?\d+)/,
  ) || draw.body.match(
    /\/s\/[A-Z2-7]{26}\/draw\/(p\d+)\?n=([^"'&\s]+)&x=(-?\d+)&y=(-?\d+)/,
  );
  record(
    "2-draw-page",
    draw.status === 200 && hasQ && Boolean(patternLink),
    `status=${draw.status} ?= ${hasQ} link=${Boolean(patternLink)}`,
  );

  if (patternLink) {
    const [, pid, nRaw, x, y] = patternLink;
    const n = decodeURIComponent(nRaw.replace(/&amp;/g, "&"));
    const write = vercelCurl(
      `/s/${visitId}/draw/${pid}?n=${encodeURIComponent(n)}&x=${x}&y=${y}`,
      hookArgs(),
    );
    const loc = write.location || "";
    record(
      "2-draw-write",
      write.status === 302 && /\/(arrival|decider)/.test(loc),
      `status=${write.status} loc=${loc.includes("/s/") ? "census" : loc}`,
    );

    if (loc) {
      const censusPath = loc.startsWith("http")
        ? new URL(loc).pathname + new URL(loc).search
        : loc;
      const census = vercelCurl(censusPath, hookArgs());
      const finishM =
        census.body.match(/\/s\/[A-Z2-7]{26}\/finish\?n=([^"'&\s]+)/);
      if (finishM) {
        const finishN = decodeURIComponent(finishM[1].replace(/&amp;/g, "&"));
        const finish = vercelCurl(
          `/s/${visitId}/finish?n=${encodeURIComponent(finishN)}`,
          hookArgs(),
        );
        const thanksLoc = finish.location || "";
        record(
          "2-finish",
          finish.status === 302 && thanksLoc.includes("/thanks"),
          `status=${finish.status}`,
        );
        if (thanksLoc) {
          const tp = thanksLoc.startsWith("http")
            ? new URL(thanksLoc).pathname
            : thanksLoc;
          const thanks = vercelCurl(tp, hookArgs());
          record(
            "2-thanks",
            thanks.status === 200 &&
              (thanks.body.includes("receipt") ||
                thanks.body.includes("your cell")),
            `status=${thanks.status}`,
          );
        }
      } else {
        record("2-finish", false, "no finish link");
      }
    }
  }

  // 3–4 signatures
  if (linkSecret && hook) {
    const home2 = vercelCurl("/");
    const v2 = extractVisitId(home2.body);
    if (v2) {
      vercelCurl(`/s/${v2}/draw`, hookArgs({ "x-senjafuda-test-cell": "1,0" }));
      const past = Math.floor(Date.now() / 1000) - 60;
      const expiredN = sign({
        visitId: v2,
        action: "draw",
        target: "p15",
        x: "1",
        y: "0",
        exp: past,
      });
      const expRes = vercelCurl(
        `/s/${v2}/draw/p15?n=${encodeURIComponent(expiredN)}&x=1&y=0`,
        hookArgs(),
      );
      record(
        "3-expired-sig",
        expRes.status === 302 && (expRes.location || "").includes("note=expired"),
        `status=${expRes.status}`,
      );

      const badN = `${Math.floor(Date.now() / 1000) + 300}.notavalidsignature==========`;
      const bad = vercelCurl(
        `/s/${v2}/draw/p15?n=${encodeURIComponent(badN)}&x=1&y=0`,
        hookArgs(),
      );
      record(
        "4-tampered-sig",
        bad.status === 302 &&
          ((bad.location || "").includes("note=expired") ||
            (bad.location || "").includes("/draw")),
        `status=${bad.status}`,
      );
    }
  } else {
    record("3-expired-sig", false, "skipped: need LINK_SIGNING_SECRET + TEST_HOOK_SECRET");
    record("4-tampered-sig", false, "skipped: need LINK_SIGNING_SECRET + TEST_HOOK_SECRET");
  }

  // 5. Cell race
  if (hook) {
    const a = extractVisitId(vercelCurl("/").body);
    const b = extractVisitId(vercelCurl("/").body);
    const force = { "x-senjafuda-test-cell": "-1,-1" };
    const dA = vercelCurl(`/s/${a}/draw`, hookArgs(force));
    const dB = vercelCurl(`/s/${b}/draw`, hookArgs(force));
    const re =
      /\/s\/[A-Z2-7]{26}\/draw\/(p\d+)\?n=([^"'&\s]+)&(?:amp;)?x=(-?\d+)&(?:amp;)?y=(-?\d+)/;
    const linkA = dA.body.match(re);
    const linkB = dB.body.match(re);
    if (linkA && linkB) {
      const wA = vercelCurl(
        `/s/${a}/draw/${linkA[1]}?n=${encodeURIComponent(decodeURIComponent(linkA[2]))}&x=${linkA[3]}&y=${linkA[4]}`,
        hookArgs(),
      );
      const wB = vercelCurl(
        `/s/${b}/draw/${linkB[1]}?n=${encodeURIComponent(decodeURIComponent(linkB[2]))}&x=${linkB[3]}&y=${linkB[4]}`,
        hookArgs(),
      );
      const locB = wB.location || "";
      record(
        "5-cell-race",
        wA.status === 302 &&
          (locB.includes("note=taken") || locB.includes("/draw")),
        `A=${wA.status} B=${wB.status}`,
      );
    } else {
      record("5-cell-race", false, "parse draw links failed");
    }
  } else {
    record("5-cell-race", false, "skipped: need TEST_HOOK_SECRET");
  }

  // 6. Stale
  const stale = vercelCurl("/s/AAAAAAAAAAAAAAAAAAAAAAAAAA/draw", hookArgs());
  const staleVisit = extractVisitId(stale.body);
  record(
    "6-stale-remint",
    stale.status === 200 &&
      Boolean(staleVisit) &&
      staleVisit !== "AAAAAAAAAAAAAAAAAAAAAAAAAA" &&
      stale.body.includes("earlier visit"),
    `status=${stale.status} reminted=${Boolean(staleVisit)}`,
  );

  // 7. Growth
  if (hook) {
    const fill = vercelCurl("/api/test/fill?count=12", [
      ...hookArgs(),
      "-X",
      "POST",
    ]);
    const recordPage = vercelCurl("/record");
    const grew =
      /Frame 7/.test(recordPage.body) || recordPage.body.includes("7×7");
    let created = 0;
    try {
      created = JSON.parse(fill.body).created ?? 0;
    } catch {
      /* ignore */
    }
    record(
      "7-growth",
      fill.status === 200 && (created >= 1 || grew),
      `status=${fill.status} created=${created} grew=${grew}`,
    );
  } else {
    record("7-growth", false, "skipped: need TEST_HOOK_SECRET");
  }

  // 10. Decline before drawing
  const homeD = vercelCurl("/");
  const vD = extractVisitId(homeD.body);
  if (vD) {
    const dec = vercelCurl(`/s/${vD}/decline`, hookArgs());
    record(
      "10-decline-page",
      dec.status === 200 && /not_my_task|Not my task/i.test(dec.body),
      `status=${dec.status}`,
    );
  }

  // 13. Record / robots / llms / headers
  const recordPage = vercelCurl("/record");
  record(
    "13-record",
    recordPage.status === 200 &&
      recordPage.body.includes("Visits") &&
      !/ai_user_fetch|ua_class/i.test(recordPage.body),
    `status=${recordPage.status}`,
  );

  const robots = vercelCurl("/robots.txt");
  record(
    "13-robots",
    robots.body.includes("User-agent: Google") &&
      robots.body.includes("Disallow: /s/"),
    `ok`,
  );

  const llms = vercelCurl("/llms.txt");
  record(
    "13-llms",
    llms.status === 200 && /canvas/i.test(llms.body),
    `status=${llms.status}`,
  );

  const closed = vercelCurl("/temporarily-closed");
  record(
    "12-temporarily-closed",
    closed.status === 503 && /nothing was recorded/i.test(closed.body),
    `status=${closed.status}`,
  );

  record(
    "12-csp",
    home.csp.includes("default-src 'self'") &&
      home.csp.includes("frame-ancestors 'none'"),
    home.csp ? "present" : "missing",
  );

  writeReport();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

function writeReport() {
  const dir = path.join(process.cwd(), "docs", "debug-investigations");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "003-era1-preview-smoke.md");
  const passed = results.filter((r) => r.pass).length;
  const body = `# Era 1 preview smoke (§13)

**Date:** ${new Date().toISOString()}
**Preview deployment:** ${DEP}
**Automated:** ${passed}/${results.length} checks passed (via \`vercel curl\`)

| Id | Result | Detail |
|---|---|---|
${results
  .map(
    (r) =>
      `| ${r.id} | ${r.pass ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "/")} |`,
  )
  .join("\n")}

## Manual checks still required

- [ ] 8 Sweep: 3 \`/s/\` hits in 2 s → branched; drawn then swept → drawing excluded
- [ ] 9 Per-source drawing cap (6th refused)
- [ ] 10 Decline reason write + refuse decline after drawing
- [ ] 11 Form path end-to-end with JS disabled
- [ ] 12 Census correction ≥ 30 s → superseded; < 30 s different → branched
- [ ] 14 Export dry run against preview DB (public files + sealed test recipient)
- [ ] 15 No raw IP/UA in DB or exports

## Notes

- Protection bypass via \`vercel curl\` (deployment is Vercel-auth protected).
- \`docs/tests/\` was not present in the repo at commit time (referenced in PROJECT-STATE only).
- Deploy gate: Sidney approves after manual items; do not merge until then.
`;
  writeFileSync(out, body);
  console.log("Wrote", out);
}

main();
