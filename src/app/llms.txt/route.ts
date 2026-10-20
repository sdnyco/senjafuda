import { readFileSync } from "fs";
import path from "path";
import { loadEra1Vocab } from "@/lib/era1-vocab";

export const dynamic = "force-dynamic";

export function GET() {
  const header = readFileSync(
    path.join(process.cwd(), "content", "era1", "llms-header.md"),
    "utf8",
  );
  const vocab = loadEra1Vocab();

  const patterns = vocab.patterns
    .map((p) => `- \`${p.id}\` ${p.glyph} — ${p.description}`)
    .join("\n");

  const fields = vocab.fields
    .filter((f) => f.enabled)
    .map((f) => {
      const opts = f.options.map((o) => o.id).join(", ");
      return `### ${f.id}\n${f.question}\nOptions: ${opts}`;
    })
    .join("\n\n");

  const declines = vocab.decline_reasons.map((r) => r.id).join(", ");

  const body = `${header.trim()}

## Patterns

${patterns}

## Census fields

${fields}

## Decline reasons

${declines}

## robots.txt

If robots.txt blocks your fetcher from the sign links, that is an oversight; the person who sent you can open an issue at the GitHub repository.

## Data

Public canvas and totals: /data (GitHub). Attribution and census answers are sealed until 2036-10-18 at the latest.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
