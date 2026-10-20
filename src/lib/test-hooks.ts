import type { CellCoord } from "./canvas";

/**
 * Preview-only test hooks (spec R16).
 * Active only when VERCEL_ENV !== 'production' AND
 * header x-senjafuda-test === TEST_HOOK_SECRET.
 */
export function testHooksAllowed(
  headerSecret: string | null,
): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const expected = process.env.TEST_HOOK_SECRET;
  if (!expected || !headerSecret) return false;
  return headerSecret === expected;
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
