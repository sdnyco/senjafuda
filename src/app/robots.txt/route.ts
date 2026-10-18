export function GET() {
  const body = `User-agent: *
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
