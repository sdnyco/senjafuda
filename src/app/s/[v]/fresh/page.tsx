import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  FreshLinkExpiredPage,
  StaleVisitPage,
} from "@/components/StatusPages";
import { signFreshLink, verifySignature } from "@/lib/link-sign";
import { visitPublicId } from "@/lib/public-id-env";
import {
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import { pageIfUnavailable } from "@/lib/upstash-response";
import { parseTtlOverride, testHooksAllowed } from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import {
  findExistingFreshChild,
  remintFromOrExisting,
} from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ v: string }>;
  searchParams: Promise<{ n?: string }>;
};

/**
 * Spec 004: the only remint path. Invalid/expired signature → HTML dead end
 * (not a redirect to `/`, which would mint).
 * R2: at most one child per parent; later follows get the child's stale page.
 */
export default async function FreshPage({ params, searchParams }: Props) {
  const { v } = await params;
  const sp = await searchParams;

  if (!isValidVisitIdFormat(v)) {
    notFound();
  }

  const verified = verifySignature(sp.n, {
    visitId: v,
    action: "fresh",
    target: "",
    x: "",
    y: "",
  });
  if (!verified.ok) {
    return <FreshLinkExpiredPage />;
  }

  const h = await headers();
  const hooks = testHooksAllowed(h.get("x-senjafuda-test"));
  const ttl = hooks
    ? parseTtlOverride(h.get("x-senjafuda-test-ttl"))
    : undefined;

  let parentPublicId: string | null = null;
  try {
    parentPublicId = visitPublicId(v);
  } catch {
    parentPublicId = null;
  }

  if (parentPublicId) {
    const existing = await findExistingFreshChild(parentPublicId);
    if (existing) {
      const freshN = signFreshLink({ visitId: existing.id, ttlSec: ttl });
      return <StaleVisitPage visitId={existing.id} freshN={freshN} />;
    }
  }

  const mintOk = await checkMintSourceLimit();
  const globalOk = await checkAndIncrGlobalMint();
  pageIfUnavailable(mintOk, globalOk);
  if (!mintOk.success || !globalOk.success) {
    redirect("/");
  }

  const result = await remintFromOrExisting(v, h.get("user-agent"));
  if (result.kind === "existing") {
    // Lost the insert race: show the winner's stale page, not its draw step.
    const freshN = signFreshLink({
      visitId: result.visit.id,
      ttlSec: ttl,
    });
    return <StaleVisitPage visitId={result.visit.id} freshN={freshN} />;
  }

  redirect(`/s/${result.visit.id}/draw?note=stale`);
}
