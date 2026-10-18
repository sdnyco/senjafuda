import { NextResponse } from "next/server";

export function GET() {
  const repo =
    process.env.GITHUB_DATA_URL ??
    process.env.NEXT_PUBLIC_GITHUB_DATA_URL ??
    "https://github.com/";
  return NextResponse.redirect(repo, 302);
}
