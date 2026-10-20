import { aiUserFetchRobotsUserAgents } from "@/lib/ua-rules";

export const dynamic = "force-dynamic";

/** Same path rules for `*` and for crawlers that must not inherit agent Allow. */
const DEFAULT_CRAWLER_RULES = `Allow: /
Allow: /record
Allow: /llms.txt
Disallow: /s/
Disallow: /sign
Disallow: /sign/
Disallow: /rate-limited
`;

export function GET() {
  const agentLines = aiUserFetchRobotsUserAgents()
    .map(
      (ua) => `User-agent: ${ua}
Allow: /
`,
    )
    .join("\n");

  // Explicit Googlebot group: robots User-agent matching can treat "Google" as a
  // prefix of "Googlebot"; a longer, more specific group keeps search crawl on
  // the same disallow rules as `*` and out of the agent allowance.
  const body = `${agentLines}
User-agent: Googlebot
${DEFAULT_CRAWLER_RULES}
User-agent: *
${DEFAULT_CRAWLER_RULES}`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
