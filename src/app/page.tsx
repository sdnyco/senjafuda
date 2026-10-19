import { readFileSync } from "fs";
import path from "path";
import { headers } from "next/headers";
import { Shell } from "@/components/Shell";
import { renderSimpleMarkdown } from "@/lib/markdown";
import { checkRateLimit } from "@/lib/rate-limit";
import { firstFieldId } from "@/lib/vocab";
import { issueToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const h = await headers();
  const limit = await checkRateLimit("issue");
  let tokenId: string | null = null;
  let rateLimitedNote = false;

  if (limit.success) {
    try {
      const token = await issueToken(h.get("user-agent"));
      tokenId = token.id;
    } catch {
      // DB unavailable during local builds / misconfig — still render copy.
      tokenId = null;
    }
  } else {
    rateLimitedNote = true;
  }

  const md = readFileSync(path.join(process.cwd(), "content", "page.md"), "utf8");
  const html = renderSimpleMarkdown(md);
  const first = firstFieldId();

  return (
    <Shell>
      {rateLimitedNote ? (
        <p className="banner">
          Visit tokens are temporarily unavailable from this network (rate
          limit). You can still read the page and the public record.
        </p>
      ) : null}
      <article
        className="prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <nav className="actions" aria-label="Primary">
        {tokenId ? (
          <>
            <a href={`/s/${tokenId}/${first}`} rel="nofollow">
              → Leave an entry
            </a>
            <a href={`/sign?t=${tokenId}`} rel="nofollow">
              → Leave an entry (form)
            </a>
            <a href={`/s/${tokenId}/decline`} rel="nofollow">
              → Not signing — say why (optional)
            </a>
          </>
        ) : (
          <p className="note">
            Signing links are unavailable right now
            {rateLimitedNote ? " due to a rate limit" : ""}.{" "}
            <a href="/record">See the record</a>
          </p>
        )}
        <a href="/record">→ See the record</a>
      </nav>
    </Shell>
  );
}
