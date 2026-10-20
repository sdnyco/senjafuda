import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { RateLimitResult } from "./rate-limit";

export const TEMPORARILY_CLOSED_PATH = "/temporarily-closed";

/** Route handlers: soft 503 landing (nothing written). */
export function redirectTemporarilyClosed(origin: string): NextResponse {
  const res = NextResponse.redirect(`${origin}${TEMPORARILY_CLOSED_PATH}`, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

/** Server Components / pages: soft close via redirect. */
export function redirectTemporarilyClosedPage(): never {
  redirect(TEMPORARILY_CLOSED_PATH);
}

/** If any result is unavailable, redirect (route). Returns true if handled. */
export function redirectIfUnavailable(
  origin: string,
  ...results: RateLimitResult[]
): NextResponse | null {
  if (results.some((r) => r.unavailable)) {
    return redirectTemporarilyClosed(origin);
  }
  return null;
}

/** If any result is unavailable, redirect (page). */
export function pageIfUnavailable(...results: RateLimitResult[]): void {
  if (results.some((r) => r.unavailable)) {
    redirectTemporarilyClosedPage();
  }
}
