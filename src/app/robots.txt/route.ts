import { aiUserFetchRobotsUserAgents } from "@/lib/ua-rules";

export const dynamic = "force-dynamic";

export function GET() {
  const agentLines = aiUserFetchRobotsUserAgents()
    .map(
      (ua) => `User-agent: ${ua}
Allow: /
`,
    )
    .join("\n");

  const body = `${agentLines}
User-agent: *
Allow: /
Allow: /record
Allow: /llms.txt
Disallow: /s/
Disallow: /sign
Disallow: /sign/
Disallow: /rate-limited
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
