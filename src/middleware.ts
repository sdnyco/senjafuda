import { NextResponse, type NextRequest } from "next/server";

/** HEAD never performs writes. Short-circuit write routes with an empty body. */
export function middleware(request: NextRequest) {
  if (request.method !== "HEAD") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const writes =
    pathname === "/" ||
    pathname.startsWith("/s/") ||
    pathname === "/sign";

  if (!writes) {
    return NextResponse.next();
  }

  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  if (pathname.startsWith("/s/") || pathname === "/sign") {
    headers.set("X-Robots-Tag", "noindex");
  }
  return new NextResponse(null, { status: 200, headers });
}

export const config = {
  matcher: ["/", "/s/:path*", "/sign"],
};
