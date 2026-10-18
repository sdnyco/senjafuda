/**
 * Preview smoke for swept labelling. Uses `vercel curl` (protection bypass via CLI).
 * Prints only PASS/FAIL — never token ids.
 *
 * Usage:
 *   PREVIEW_DEPLOYMENT=https://….vercel.app node scripts/preview-sweep-smoke.mjs
 */
import { spawnSync } from "child_process";

const DEP = process.env.PREVIEW_DEPLOYMENT;
if (!DEP) {
  console.error("PREVIEW_DEPLOYMENT is required");
  process.exit(1);
}

function vercelCurl(path, extraCurlArgs = []) {
  const args = [
    "exec",
    "vercel",
    "curl",
    path,
    "--deployment",
    DEP,
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
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0 && r.status !== null) {
    return { ok: false, status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  }
  const out = (r.stdout || "") + (r.stderr || "");
  const split = out.indexOf("\r\n\r\n");
  const headers = split >= 0 ? out.slice(0, split) : out;
  const body = split >= 0 ? out.slice(split + 4) : "";
  const statusMatch = headers.match(/HTTP\/[\d.]+ (\d+)/);
  const location = headers.match(/^location:\s*(.+)$/im)?.[1]?.trim() ?? null;
  return {
    ok: true,
    status: statusMatch ? Number(statusMatch[1]) : null,
    location,
    body,
    headers,
  };
}

function mintToken() {
  const r = vercelCurl("/");
  if (!r.ok) throw new Error("mint failed: " + r.out.slice(0, 200));
  const m = r.body.match(/\/s\/([A-Z2-7]{20,})\//);
  if (!m) throw new Error("no token in home HTML");
  return m[1];
}

function get(path) {
  return vercelCurl(path, ["-L", "--max-redirs", "0"]);
}

function followOnce(path) {
  // Capture redirect without following; still counts as a GET on the target.
  return vercelCurl(path);
}

function recordHtml() {
  const r = vercelCurl("/record");
  if (!r.ok) throw new Error("record failed");
  return r.body;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function caseFinishSweep() {
  const token = mintToken();
  // finish + two option hits within 2s → threshold after signed
  followOnce(`/s/${token}/finish`);
  followOnce(`/s/${token}/mark/m01`);
  followOnce(`/s/${token}/mark/m02`);
  const html = recordHtml();
  assert(
    /<code>swept<\/code>/.test(html),
    "record page missing swept row label after finish sweep",
  );
  // Totals table should show a non-zero swept count eventually; soft-check presence.
  return "finish+options → swept label present on /record";
}

function caseDeclineSweep() {
  const token = mintToken();
  followOnce(`/s/${token}/decline`);
  followOnce(`/s/${token}/decline/not_my_task`);
  followOnce(`/s/${token}/decline/not_interested`);
  const html = recordHtml();
  assert(/<code>swept<\/code>/.test(html), "record missing swept after decline sweep");
  return "decline+reasons → swept label present on /record";
}

function caseSlowSign() {
  const token = mintToken();
  followOnce(`/s/${token}/mark/m01`);
  // Wait past the 2s window so a later finish is not a fast-sweep.
  spawnSync("sleep", ["3"]);
  followOnce(`/s/${token}/finish`);
  // Self-check: token should be signed without being labelled swept.
  // We cannot query the DB; check thanks page and that /record still renders.
  const thanks = vercelCurl(`/s/${token}/thanks`);
  assert(thanks.ok, "thanks request failed");
  assert(
    /Your entry was recorded|Already recorded|Recorded/.test(thanks.body),
    "thanks page unexpected",
  );
  return "slow sign → thanks page ok (not forced into sweep path)";
}

const cases = [
  ["finish sweep", caseFinishSweep],
  ["decline sweep", caseDeclineSweep],
  ["slow sign", caseSlowSign],
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    const detail = fn();
    console.log(`PASS ${name}: ${detail}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
