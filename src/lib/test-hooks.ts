import type { CellCoord } from "./canvas";

/**
 * Preview-only test hooks (spec R16).
 * Active only when VERCEL_ENV !== 'production' AND
 * header x-senjafuda-test === TEST_HOOK_SECRET.
 *
 * Cap override: when hooks are allowed, per-source drawing / decline / write
 * caps are skipped unless header x-senjafuda-test-cap: enforce is also sent
 * (§13.9 uses enforce to verify the 6th drawing is refused).
 */
export function testHooksAllowed(
  headerSecret: string | null,
): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const expected = process.env.TEST_HOOK_SECRET;
  if (!expected || !headerSecret) return false;
  return headerSecret === expected;
}

/** True when Preview hooks are active and caps should not apply. */
export function skipSourceCaps(
  hookSecret: string | null,
  capHeader: string | null,
): boolean {
  if (!testHooksAllowed(hookSecret)) return false;
  return (capHeader ?? "").trim().toLowerCase() !== "enforce";
}

export function parseForcedCell(
  header: string | null,
): CellCoord | null {
  if (!header) return null;
  const m = header.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

export function parseTtlOverride(header: string | null): number | undefined {
  if (!header) return undefined;
  const n = Number(header);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}
