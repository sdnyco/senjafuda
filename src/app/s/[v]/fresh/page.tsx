import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { FreshLinkExpiredPage } from "@/components/StatusPages";
import { verifySignature } from "@/lib/link-sign";
import {
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import { pageIfUnavailable } from "@/lib/upstash-response";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { remintFrom } from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ v: string }>;
  searchParams: Promise<{ n?: string }>;
};

/**
 * Spec 004: the only remint path. Invalid/expired signature → HTML dead end
 * (not a redirect to `/`, which would mint).
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

  const mintOk = await checkMintSourceLimit();
  const globalOk = await checkAndIncrGlobalMint();
  pageIfUnavailable(mintOk, globalOk);
  if (!mintOk.success || !globalOk.success) {
    redirect("/");
  }

  const h = await headers();
  const visit = await remintFrom(v, h.get("user-agent"));
  redirect(`/s/${visit.id}/draw?note=stale`);
}
