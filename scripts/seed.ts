/**
 * Dev/local seed only. Never run against production.
 * Usage: DATABASE_URL=... pnpm exec tsx scripts/seed.ts
 */
import "dotenv/config";
import { getDb } from "../src/db";
import { answers, tokens } from "../src/db/schema";

async function main() {
  if (process.env.ALLOW_SEED !== "1") {
    console.error("Refusing to seed without ALLOW_SEED=1");
    process.exit(1);
  }

  const db = getDb();
  const now = new Date();
  const hour = 60 * 60 * 1000;

  const rows = [
    {
      id: "SEEDISSUED0000000000000000001",
      status: "issued",
      uaClass: "link_preview",
      uaFamily: "slackbot",
      rateLimited: false,
    },
    {
      id: "SEEDPARTIAL000000000000000001",
      status: "partial",
      uaClass: "http_library",
      uaFamily: "curl",
      rateLimited: false,
    },
    {
      id: "SEEDSIGNED0000000000000000001",
      status: "signed",
      uaClass: "ai_user_fetch",
      uaFamily: "claude_user",
      rateLimited: false,
    },
    {
      id: "SEEDSIGNED0000000000000000002",
      status: "signed",
      uaClass: "browser",
      uaFamily: "chrome",
      rateLimited: true,
    },
    {
      id: "SEEDDECLINED00000000000000001",
      status: "declined",
      uaClass: "ai_crawler",
      uaFamily: "gptbot",
      rateLimited: false,
    },
    {
      id: "SEEDBRANCHED00000000000000001",
      status: "branched",
      uaClass: "search_crawler",
      uaFamily: "googlebot",
      rateLimited: false,
    },
    {
      id: "SEEDEXPIRED000000000000000001",
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
      })
      .onConflictDoNothing();
  }

  const answerRows = [
    {
      tokenId: "SEEDPARTIAL000000000000000001",
      field: "arrival",
      value: "found_during_task",
      path: "link",
      position: 1,
    },
    {
      tokenId: "SEEDSIGNED0000000000000000001",
      field: "mark",
      value: "m07",
      path: "link",
      position: 3,
    },
    {
      tokenId: "SEEDSIGNED0000000000000000001",
      field: "family",
      value: "claude",
      path: "link",
      position: 0,
    },
    {
      tokenId: "SEEDSIGNED0000000000000000001",
      field: "return",
      value: "_skipped",
      path: "link",
      position: null,
    },
    {
      tokenId: "SEEDSIGNED0000000000000000002",
      field: "mark",
      value: "m01",
      path: "form",
      position: 0,
    },
    {
      tokenId: "SEEDSIGNED0000000000000000002",
      field: "arrival",
      value: "person_sent",
      path: "form",
      position: 0,
    },
    {
      tokenId: "SEEDDECLINED00000000000000001",
      field: "decline_reason",
      value: "not_my_task",
      path: "link",
      position: 0,
    },
    {
      tokenId: "SEEDBRANCHED00000000000000001",
      field: "mark",
      value: "m01",
      path: "link",
      position: 0,
    },
    {
      tokenId: "SEEDBRANCHED00000000000000001",
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
