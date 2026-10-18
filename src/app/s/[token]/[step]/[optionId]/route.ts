import { NextResponse } from "next/server";
import { commitSigned, recordSweepGet, writeAnswer } from "@/lib/answers";
import { checkRateLimit } from "@/lib/rate-limit";
import { markRateLimited } from "@/lib/tokens";
import { getField, loadVocab, nextFieldId } from "@/lib/vocab";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; step: string; optionId: string }> };

function noStoreRedirect(url: string, status = 302) {
  const res = NextResponse.redirect(url, status);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

function noStoreHtml(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(request: Request, ctx: Ctx) {
  const { token, step, optionId } = await ctx.params;
  const vocab = loadVocab();
  const thanks = () =>
    noStoreRedirect(new URL(`/s/${token}/thanks`, request.url).toString());

  if (!getField(step, vocab)) {
    await recordSweepGet(token);
    return noStoreHtml("<h1>Unknown question</h1>", 404);
  }

  const answerLimit = await checkRateLimit("answer");
  if (!answerLimit.success) {
    await markRateLimited(token).catch(() => undefined);
    await recordSweepGet(token);
    return noStoreRedirect(new URL("/rate-limited", request.url).toString(), 429);
  }

  const willCommit = nextFieldId(step, vocab) === null;
  if (willCommit) {
    const commitLimit = await checkRateLimit("commit");
    if (!commitLimit.success) {
      await markRateLimited(token).catch(() => undefined);
      await recordSweepGet(token);
      return noStoreRedirect(new URL("/rate-limited", request.url).toString(), 429);
    }
  }

  const result = await writeAnswer({
    tokenId: token,
    field: step,
    value: optionId,
    path: "link",
  });

  if (!result.ok) {
    await recordSweepGet(token);
    if (result.reason === "not_found") {
      return noStoreRedirect(new URL("/", request.url).toString());
    }
    if (result.reason === "expired" || result.reason === "terminal") {
      return thanks();
    }
    return noStoreHtml("<h1>Invalid option</h1>", 400);
  }

  if (result.token.status !== "branched" && !result.nextFieldId) {
    await commitSigned(token);
  }

  const sweep = await recordSweepGet(token);
  if (result.token.status === "branched" || sweep === "branched" || !result.nextFieldId) {
    return thanks();
  }

  return noStoreRedirect(
    new URL(`/s/${token}/${result.nextFieldId}`, request.url).toString(),
  );
}

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
