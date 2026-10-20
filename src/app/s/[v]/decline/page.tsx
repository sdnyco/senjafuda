import { headers } from "next/headers";
import { Shell } from "@/components/Shell";
import {
  NothingRecorded,
  RateLimitedPage,
  VisitClosed,
} from "@/components/StatusPages";
import { applySweepHit } from "@/lib/era1-write";
import { loadEra1Vocab } from "@/lib/era1-vocab";
import { signDeclineLink, signFreshLink } from "@/lib/link-sign";
import { checkSGetLimit } from "@/lib/rate-limit";
import {
  pageIfUnavailable,
  redirectTemporarilyClosedPage,
} from "@/lib/upstash-response";
import { parseTtlOverride, testHooksAllowed } from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { getVisit, isVisitUnusable } from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ v: string }> };

export default async function DeclinePage({ params }: Props) {
  const { v } = await params;
  if (!isValidVisitIdFormat(v)) {
    return (
      <NothingRecorded>
        <p>Nothing was recorded from this link.</p>
      </NothingRecorded>
    );
  }

  const sGet = await checkSGetLimit();
  pageIfUnavailable(sGet);
  if (!sGet.success) return <RateLimitedPage />;

  const visit = await getVisit(v);
  if (!visit) {
    return (
      <NothingRecorded>
        <p>This visit was not found. Nothing was recorded from this link.</p>
      </NothingRecorded>
    );
  }

  if (
    visit.status === "signed" ||
    visit.status === "declined" ||
    visit.status === "branched"
  ) {
    const fresh = signFreshLink({ visitId: visit.id });
    return <VisitClosed freshHref={`/s/${visit.id}/fresh?n=${fresh}`} />;
  }

  if (visit.status !== "issued" || (await isVisitUnusable(visit))) {
    return (
      <NothingRecorded>
        <p>
          Decline is only available before drawing. Nothing was recorded from
          this link.
        </p>
        <p>
          <a href={`/s/${visit.id}/draw`} rel="nofollow">
            → Your cell
          </a>
        </p>
      </NothingRecorded>
    );
  }

  if ((await applySweepHit(visit.id)) === "unavailable") {
    redirectTemporarilyClosedPage();
  }

  const h = await headers();
  const hooks = testHooksAllowed(h.get("x-senjafuda-test"));
  const ttl = hooks
    ? parseTtlOverride(h.get("x-senjafuda-test-ttl"))
    : undefined;
  const vocab = loadEra1Vocab();

  return (
    <Shell>
      <h1>Not adding a cell — optional reason</h1>
      <ul className="option-list">
        {vocab.decline_reasons.map((r) => {
          const n = signDeclineLink({
            visitId: visit.id,
            reasonId: r.id,
            ttlSec: ttl,
          });
          return (
            <li key={r.id}>
              <a
                href={`/s/${visit.id}/decline/${r.id}?n=${encodeURIComponent(n)}`}
                rel="nofollow"
              >
                {r.label}
              </a>
            </li>
          );
        })}
      </ul>
      <nav className="meta-nav">
        <a href={`/s/${visit.id}/draw`} rel="nofollow">
          → Add a cell instead
        </a>
        <a href="/">Home</a>
      </nav>
    </Shell>
  );
}
