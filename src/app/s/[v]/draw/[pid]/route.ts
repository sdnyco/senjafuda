import { NextResponse, type NextRequest } from "next/server";
import { firstCensusFieldId } from "@/lib/era1-vocab";
import { writeDrawing, applySweepHit } from "@/lib/era1-write";
import { verifySignature } from "@/lib/link-sign";
import {
  checkDrawLimit,
  checkWriteLimit,
} from "@/lib/rate-limit";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { isValidPatternId } from "@/lib/era1-vocab";
import {
  getVisit,
  incrementLateFetches,
  isVisitUnusable,
  markVisitRateLimited,
  remintFrom,
} from "@/lib/visits";
import {
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import {
  redirectIfUnavailable,
  redirectTemporarilyClosed,
} from "@/lib/upstash-response";

export const dynamic = "force-dynamic";

function htmlNote(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

function redirectTo(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

type Ctx = { params: Promise<{ v: string; pid: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { v, pid } = await ctx.params;
  const origin = request.nextUrl.origin;

  if (!isValidVisitIdFormat(v) || !isValidPatternId(pid)) {
    return htmlNote("<p>Nothing was recorded.</p>", 404);
  }

  const n = request.nextUrl.searchParams.get("n");
  const xStr = request.nextUrl.searchParams.get("x");
  const yStr = request.nextUrl.searchParams.get("y");
  const x = Number(xStr);
  const y = Number(yStr);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return htmlNote("<p>Nothing was recorded.</p>", 404);
  }

  const writeLim = await checkWriteLimit();
  const closed = redirectIfUnavailable(origin, writeLim);
  if (closed) return closed;
  if (!writeLim.success) {
    await markVisitRateLimited(v).catch(() => {});
    return redirectTo(`${origin}/rate-limited`);
  }
  const drawLim = await checkDrawLimit();
  const closedDraw = redirectIfUnavailable(origin, drawLim);
  if (closedDraw) return closedDraw;
  if (!drawLim.success) {
    return redirectTo(`${origin}/source-cap`);
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
    return htmlNote(
      "<p>Nothing was recorded from this link. New visits are unavailable.</p>",
    );
  }

  if ((await applySweepHit(visit.id)) === "unavailable") {
    return redirectTemporarilyClosed(origin);
  }

  const verified = verifySignature(n, {
    visitId: visit.id,
    action: "draw",
    target: pid,
    x: String(x),
    y: String(y),
  });
  if (!verified.ok) {
    await incrementLateFetches(visit.id);
    return redirectTo(`${origin}/s/${visit.id}/draw?note=expired`);
  }

  const result = await writeDrawing({
    visitId: visit.id,
    patternId: pid,
    x,
    y,
    path: "link",
  });

  if (!result.ok) {
    if (result.reason === "cell_taken") {
      return redirectTo(`${origin}/s/${visit.id}/draw?note=taken`);
    }
    if (result.reason === "already_drawn") {
      return redirectTo(`${origin}/s/${visit.id}/draw`);
    }
    return redirectTo(`${origin}/s/${visit.id}/draw?note=expired`);
  }

  const first = firstCensusFieldId();
  return redirectTo(`${origin}/s/${visit.id}/${first}`);
}
