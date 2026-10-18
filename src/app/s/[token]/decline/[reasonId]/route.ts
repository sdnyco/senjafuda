import { NextResponse } from "next/server";
import { commitDeclined } from "@/lib/answers";
import { checkRateLimit } from "@/lib/rate-limit";
import { markRateLimited } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; reasonId: string }> };

function redirect(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

export async function GET(request: Request, ctx: Ctx) {
  const { token, reasonId } = await ctx.params;

  const answerLimit = await checkRateLimit("answer");
  if (!answerLimit.success) {
    await markRateLimited(token).catch(() => undefined);
    return redirect(new URL("/rate-limited", request.url).toString());
  }

  const commitLimit = await checkRateLimit("commit");
  if (!commitLimit.success) {
    await markRateLimited(token).catch(() => undefined);
    return redirect(new URL("/rate-limited", request.url).toString());
  }

  const result = await commitDeclined(token, reasonId);
  if (!result.ok && result.reason === "not_found") {
    return redirect(new URL("/", request.url).toString());
  }
  if (!result.ok && result.reason === "invalid") {
    return new NextResponse("<h1>Unknown decline reason</h1>", {
      status: 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }
  return redirect(new URL(`/s/${token}/thanks`, request.url).toString());
}

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
