/**
 * Era 1 preview smoke (spec §13 / R16).
 *
 * Contract — test hooks (Preview only):
 *   Header x-senjafuda-test: <TEST_HOOK_SECRET>
 *   Header x-senjafuda-test-cell: x,y   — force assigned cell on draw/sign render
 *   Header x-senjafuda-test-ttl: <sec>  — override link TTL on this render
 *   POST /api/test/fill?count=n         — create n valid drawings (growth test)
 *
 * Env:
 *   PREVIEW_URL          — base URL of the preview deployment
 *   TEST_HOOK_SECRET     — must match Preview env
 *   VERCEL_AUTOMATION_BYPASS_SECRET — optional protection bypass
 *   EXPORT_ID_SALT / LINK_SIGNING_SECRET — for forged-signature checks (optional)
 *
 * Results: write notes to docs/debug-investigations/003-era1-preview-smoke.md
 *
 * Usage:
 *   PREVIEW_URL=https://….vercel.app TEST_HOOK_SECRET=… node scripts/era1-smoke.mjs
 */
const base = process.env.PREVIEW_URL;
if (!base) {
  console.error("PREVIEW_URL required");
  process.exit(1);
}

const secret = process.env.TEST_HOOK_SECRET || "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

function headers(extra = {}) {
  const h = { ...extra };
  if (secret) h["x-senjafuda-test"] = secret;
  if (bypass) h["x-vercel-protection-bypass"] = bypass;
  return h;
}

async function main() {
  console.log("era1-smoke against", base);
  const home = await fetch(base + "/", { headers: headers(), redirect: "manual" });
  const html = await home.text();
  console.log("GET /", home.status, html.includes("▢") ? "has seed glyph" : "MISSING seed");
  console.log("HEAD / mint check: run separately; middleware should not mint");
  console.log("Full §13 checklist: document results in docs/debug-investigations/003-era1-preview-smoke.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
