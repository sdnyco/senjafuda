export const dynamic = "force-dynamic";

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Temporarily closed</title>
<meta name="robots" content="noindex"/>
</head><body>
<main style="padding:2rem;font-family:serif;max-width:40rem;margin:0 auto">
<h1>Temporarily closed</h1>
<p>The site is temporarily closed, so nothing was recorded. Please try again later.</p>
<p><a href="/">Home</a></p>
</main></body></html>`;

export function GET() {
  return new Response(HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Retry-After": "60",
    },
  });
}
