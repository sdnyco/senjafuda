import { NextResponse, type NextRequest } from "next/server";
import { isValidDeclineReason } from "@/lib/era1-vocab";
import { applySweepHit, writeDecline } from "@/lib/era1-write";
import { verifySignature } from "@/lib/link-sign";
import {
  checkDeclineLimit,
  checkWriteLimit,
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import {
  redirectIfUnavailable,
  redirectTemporarilyClosed,
} from "@/lib/upstash-response";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import {
  getVisit,
  incrementLateFetches,
  isVisitUnusable,
  markVisitRateLimited,
  remintFrom,
} from "@/lib/visits";

export const dynamic = "force-dynamic";

function redirectTo(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

type Ctx = { params: Promise<{ v: string; rid: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { v, rid } = await ctx.params;
  const origin = request.nextUrl.origin;

  if (!isValidVisitIdFormat(v) || !isValidDeclineReason(rid)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const writeLim = await checkWriteLimit();
  const closed = redirectIfUnavailable(origin, writeLim);
  if (closed) return closed;
  if (!writeLim.success) {
    await markVisitRateLimited(v).catch(() => {});
    return redirectTo(`${origin}/rate-limited`);
  }
  const declineLim = await checkDeclineLimit();
  const closedDecline = redirectIfUnavailable(origin, declineLim);
  if (closedDecline) return closedDecline;
  if (!declineLim.success) {
    return redirectTo(`${origin}/decline-cap`);
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

  if (visit.status !== "issued") {
    return redirectTo(`${origin}/s/${visit.id}/draw`);
  }

  if ((await applySweepHit(visit.id)) === "unavailable") {
    return redirectTemporarilyClosed(origin);
  }

  const n = request.nextUrl.searchParams.get("n");
  const verified = verifySignature(n, {
    visitId: visit.id,
    action: "decline",
    target: rid,
    x: "",
    y: "",
  });
  if (!verified.ok) {
    await incrementLateFetches(visit.id);
    return redirectTo(`${origin}/s/${visit.id}/decline`);
  }

  const result = await writeDecline({
    visitId: visit.id,
    reasonId: rid,
    path: "link",
  });
  if (!result.ok) {
    return redirectTo(`${origin}/s/${visit.id}/draw?note=stale`);
  }
  return redirectTo(`${origin}/s/${visit.id}/thanks`);
}
