import { NextResponse, type NextRequest } from "next/server";
import {
  isCensusFieldId,
  isValidCensusOption,
  loadEra1Vocab,
} from "@/lib/era1-vocab";
import { applySweepHit, writeCensusAnswer } from "@/lib/era1-write";
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

type Ctx = { params: Promise<{ v: string; field: string; opt: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { v, field, opt } = await ctx.params;
  const origin = request.nextUrl.origin;
  const vocab = loadEra1Vocab();

  if (
    !isValidVisitIdFormat(v) ||
    !isCensusFieldId(field) ||
    !isValidCensusOption(field, opt, vocab)
  ) {
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
  const isSkip = opt === vocab.skip_value;
  const verified = verifySignature(n, {
    visitId: visit.id,
    action: isSkip ? "skip" : "census",
    target: isSkip ? field : `${field}:${opt}`,
    x: "",
    y: "",
  });
  if (!verified.ok) {
    await incrementLateFetches(visit.id);
    return redirectTo(`${origin}/s/${visit.id}/${field}?note=expired`);
  }

  const result = await writeCensusAnswer({
    visitId: visit.id,
    field,
    value: opt,
    path: "link",
  });

  if (!result.ok) {
    return redirectTo(`${origin}/s/${visit.id}/draw?note=stale`);
  }

  if (result.visit.status === "branched" || result.signed) {
    return redirectTo(`${origin}/s/${visit.id}/thanks`);
  }
  if (result.nextFieldId) {
    return redirectTo(`${origin}/s/${visit.id}/${result.nextFieldId}`);
  }
  return redirectTo(`${origin}/s/${visit.id}/thanks`);
}
