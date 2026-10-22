import { readFileSync } from "fs";
import path from "path";
import { headers } from "next/headers";
import { Shell } from "@/components/Shell";
import { CanvasPre } from "@/components/CanvasPre";
import { renderSimpleMarkdown } from "@/lib/markdown";
import {
  checkAndIncrGlobalMint,
  checkMintSourceLimit,
} from "@/lib/rate-limit";
import { pageIfUnavailable } from "@/lib/upstash-response";
import { issueVisit } from "@/lib/visits";
import { getFrameSize, loadValidCells } from "@/lib/canvas";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const h = await headers();
  let visitId: string | null = null;
  let rateLimitedNote = false;
  let restingNote = false;

  const source = await checkMintSourceLimit();
  pageIfUnavailable(source);
  if (!source.success) {
    rateLimitedNote = true;
  } else {
    const global = await checkAndIncrGlobalMint();
    pageIfUnavailable(global);
    if (!global.success) {
      restingNote = true;
    } else {
      try {
        const visit = await issueVisit(h.get("user-agent"));
        visitId = visit.id;
      } catch {
        visitId = null;
      }
    }
  }

  const md = readFileSync(
    path.join(process.cwd(), "content", "era1", "page.md"),
    "utf8",
  );
  const html = renderSimpleMarkdown(md);

  let frameSize = 5;
  let cells: Awaited<ReturnType<typeof loadValidCells>> = [];
  try {
    const db = getDb();
    frameSize = await getFrameSize(db);
    cells = await loadValidCells(db);
  } catch {
    // Seed-less local render
  }

  return (
    <Shell>
      {restingNote ? (
        <p className="banner">
          The canvas is resting for today; you can still look.
        </p>
      ) : null}
      {rateLimitedNote ? (
        <p className="banner">
          Visit tokens are temporarily unavailable from this network. You can
          still read the page and the public record. Nothing was recorded.
        </p>
      ) : null}
      <article
        className="prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CanvasPre frameSize={frameSize} cells={cells} />
      <nav className="actions" aria-label="Primary">
        {visitId ? (
          <>
            <a href={`/s/${visitId}/draw`} rel="nofollow">
              → Add a cell
            </a>
            <a href={`/sign?v=${visitId}`} rel="nofollow">
              → Add a cell (form)
            </a>
            <a href={`/s/${visitId}/decline`} rel="nofollow">
              → Not adding one — say why (optional)
            </a>
          </>
        ) : restingNote ? null : (
          <p className="note">
            Add-a-cell links are unavailable right now
            {rateLimitedNote ? " due to a rate limit" : ""}.{" "}
            <a href="/record">About the record</a>
          </p>
        )}
        <a href="/record">→ About the record</a>
      </nav>
    </Shell>
  );
}
