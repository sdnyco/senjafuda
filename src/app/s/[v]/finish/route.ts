import { NextResponse, type NextRequest } from "next/server";
import { applySweepHit, finishVisit } from "@/lib/era1-write";
import { verifySignature } from "@/lib/link-sign";
import {
  checkWriteLimit,
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import { skipSourceCaps } from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import {
  getVisit,
  incrementLateFetches,
  isVisitUnusable,
  markVisitRateLimited,
  remintFrom,
} from "@/lib/visits";
import {
  redirectIfUnavailable,
  redirectTemporarilyClosed,
} from "@/lib/upstash-response";

export const dynamic = "force-dynamic";

function redirectTo(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

type Ctx = { params: Promise<{ v: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { v } = await ctx.params;
  const origin = request.nextUrl.origin;

  if (!isValidVisitIdFormat(v)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const skipCaps = skipSourceCaps(
    request.headers.get("x-senjafuda-test"),
    request.headers.get("x-senjafuda-test-cap"),
  );
  if (!skipCaps) {
    const writeLim = await checkWriteLimit();
    const closed = redirectIfUnavailable(origin, writeLim);
    if (closed) return closed;
    if (!writeLim.success) {
      await markVisitRateLimited(v).catch(() => {});
      return redirectTo(`${origin}/rate-limited`);
    }
  }

  let visit = await getVisit(v);
  if (!visit || (await isVisitUnusable(visit))) {
    const mintOk = await checkMintSourceLimit();
    const globalOk = await checkAndIncrGlobalMint();
    const closedMint = redirectIfUnavailable(origin, mintOk, globalOk);
    if (closedMint) return closedMint;
    if (mintOk.success && globalOk.success) {
      visit = await remintFrom(visit?.id ?? v, request.headers.get("user-agent"));
      return redirectTo(`${origin}/s/${visit.id}/draw?note=stale`);
    }
    return new NextResponse("Nothing was recorded.", { status: 200 });
  }

  if ((await applySweepHit(visit.id)) === "unavailable") {
    return redirectTemporarilyClosed(origin);
  }

  const n = request.nextUrl.searchParams.get("n");
  const verified = verifySignature(n, {
    visitId: visit.id,
    action: "finish",
    target: "",
    x: "",
    y: "",
  });
  if (!verified.ok) {
    await incrementLateFetches(visit.id);
    if (visit.status === "drawn") {
      return redirectTo(`${origin}/s/${visit.id}/arrival?note=expired`);
    }
    return redirectTo(`${origin}/s/${visit.id}/draw?note=expired`);
  }

  const result = await finishVisit(visit.id);
  if (!result.ok) {
    return redirectTo(`${origin}/s/${visit.id}/draw?note=stale`);
  }
  return redirectTo(`${origin}/s/${visit.id}/thanks`);
}
