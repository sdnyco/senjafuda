import { NextResponse, type NextRequest } from "next/server";
import { verifySignature } from "@/lib/link-sign";
import {
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import { redirectIfUnavailable } from "@/lib/upstash-response";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { remintFrom } from "@/lib/visits";

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

  const n = request.nextUrl.searchParams.get("n");
  const verified = verifySignature(n, {
    visitId: v,
    action: "fresh",
    target: "",
    x: "",
    y: "",
  });
  if (!verified.ok) {
    return redirectTo(`${origin}/`);
  }

  const mintOk = await checkMintSourceLimit();
  const globalOk = await checkAndIncrGlobalMint();
  const closed = redirectIfUnavailable(origin, mintOk, globalOk);
  if (closed) return closed;
  if (!mintOk.success || !globalOk.success) {
    return redirectTo(`${origin}/`);
  }

  const visit = await remintFrom(v, request.headers.get("user-agent"));
  return redirectTo(`${origin}/s/${visit.id}/draw?note=stale`);
}
