/**
 * Dev/local seed only. Never run against production.
 * Usage (against a Neon *dev* branch):
 *   SEED_CONFIRM_HOST=<db-host> ALLOW_SEED=1 pnpm db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getDb } from "../src/db";
import { answers, tokens } from "../src/db/schema";

function databaseHost(url: string): string {
  return new URL(url).host;
}

async function main() {
  if (process.env.ALLOW_SEED !== "1") {
    console.error("Refusing to seed without ALLOW_SEED=1");
    process.exit(1);
  }

  if (process.env.VERCEL_ENV === "production") {
    console.error("Refusing to seed: VERCEL_ENV=production");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  let host: string;
  try {
    host = databaseHost(databaseUrl);
  } catch {
    console.error("DATABASE_URL is not a valid URL");
    process.exit(1);
  }

  console.log(`Seed target host: ${host}`);

  const confirm = process.env.SEED_CONFIRM_HOST;
  if (!confirm || confirm !== host) {
    console.error(
      "Refusing to seed: set SEED_CONFIRM_HOST to the exact database host shown above " +
        `(got ${confirm === undefined ? "unset" : JSON.stringify(confirm)}).`,
    );
    process.exit(1);
  }

  const db = getDb();

  const existing = await db.select({ id: tokens.id }).from(tokens);
  const real = existing.filter((row) => !row.id.startsWith("seed_"));
  if (real.length > 0) {
    console.error(
      "database contains real entries — refusing to seed " +
        `(${real.length} token id(s) do not start with "seed_").`,
    );
    process.exit(1);
  }

  const now = new Date();
  const hour = 60 * 60 * 1000;

  const rows = [
    {
      id: "seed_issued_001",
      status: "issued",
      uaClass: "link_preview",
      uaFamily: "slackbot",
      rateLimited: false,
    },
    {
      id: "seed_partial_001",
      status: "partial",
      uaClass: "http_library",
      uaFamily: "curl",
      rateLimited: false,
    },
    {
      id: "seed_signed_001",
      status: "signed",
      uaClass: "ai_user_fetch",
      uaFamily: "claude_user",
      rateLimited: false,
    },
    {
      id: "seed_signed_002",
      status: "signed",
      uaClass: "browser",
      uaFamily: "chrome",
      rateLimited: true,
    },
    {
      id: "seed_declined_001",
      status: "declined",
      uaClass: "ai_crawler",
      uaFamily: "gptbot",
      rateLimited: false,
    },
    {
      id: "seed_branched_001",
      status: "branched",
      uaClass: "search_crawler",
      uaFamily: "googlebot",
      rateLimited: false,
    },
    {
      id: "seed_expired_001",
      status: "expired",
      uaClass: "unrecognised",
      uaFamily: "unrecognised",
      rateLimited: false,
    },
  ] as const;

  for (const row of rows) {
    await db
      .insert(tokens)
      .values({
        id: row.id,
        issuedAt: new Date(now.getTime() - 2 * hour),
        expiresAt:
          row.status === "expired"
            ? new Date(now.getTime() - hour)
            : new Date(now.getTime() + 22 * hour),
        vocabVersion: 1,
        uaRulesVersion: 1,
        uaClass: row.uaClass,
        uaFamily: row.uaFamily,
        status: row.status,
        completedAt: ["signed", "declined", "branched", "expired"].includes(
          row.status,
        )
          ? now
          : null,
        rateLimited: row.rateLimited,
        swept: false,
      })
      .onConflictDoNothing();
  }

  const answerRows = [
    {
      tokenId: "seed_partial_001",
      field: "arrival",
      value: "found_during_task",
      path: "link",
      position: 1,
    },
    {
      tokenId: "seed_signed_001",
      field: "mark",
      value: "m07",
      path: "link",
      position: 3,
    },
    {
      tokenId: "seed_signed_001",
      field: "family",
      value: "claude",
      path: "link",
      position: 0,
    },
    {
      tokenId: "seed_signed_001",
      field: "return",
      value: "_skipped",
      path: "link",
      position: null,
    },
    {
      tokenId: "seed_signed_002",
      field: "mark",
      value: "m01",
      path: "form",
      position: 0,
    },
    {
      tokenId: "seed_signed_002",
      field: "arrival",
      value: "person_sent",
      path: "form",
      position: 0,
    },
    {
      tokenId: "seed_declined_001",
      field: "decline_reason",
      value: "not_my_task",
      path: "link",
      position: 0,
    },
    {
      tokenId: "seed_branched_001",
      field: "mark",
      value: "m01",
      path: "link",
      position: 0,
    },
    {
      tokenId: "seed_branched_001",
      field: "mark",
      value: "m02",
      path: "link",
      position: 1,
    },
  ];

  for (const a of answerRows) {
    await db
      .insert(answers)
      .values({
        ...a,
        answeredAt: now,
      })
      .onConflictDoNothing();
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
