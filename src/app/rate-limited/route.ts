export const dynamic = "force-dynamic";

const BODY = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex" />
  <title>Too many requests</title>
</head>
<body style="font-family: Georgia, serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5;">
  <h1>Too many requests</h1>
  <p>A rate limit was reached for this network. Nothing was written for this attempt. Please try again later.</p>
  <p><a href="/">Home</a> · <a href="/record">Record</a></p>
</body>
</html>`;

export function GET() {
  return new Response(BODY, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export function HEAD() {
  return new Response(null, {
    status: 429,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
