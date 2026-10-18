/**
 * Nightly export: dump tokens + answers to /data and copy vocab.
 * Usage: DATABASE_URL_READONLY=... pnpm exec tsx scripts/export.ts
 */
import "dotenv/config";
import { createHash } from "crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import { answers, tokens } from "../src/db/schema";

neonConfig.webSocketConstructor = ws;

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const url = process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_READONLY (or DATABASE_URL) is required");

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  await db.execute(sql`
    UPDATE tokens
    SET status = 'expired', completed_at = COALESCE(completed_at, now())
    WHERE status IN ('issued', 'partial')
      AND expires_at <= now()
  `);

  const tokenRows = await db.select().from(tokens);
  const answerRows = await db.select().from(answers);

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(path.join(dataDir, "vocab"), { recursive: true });

  const tokensJsonl = tokenRows
    .map((r) =>
      JSON.stringify({
        id: r.id,
        issued_at: r.issuedAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
        vocab_version: r.vocabVersion,
        ua_rules_version: r.uaRulesVersion,
        ua_class: r.uaClass,
        ua_family: r.uaFamily,
        status: r.status,
        completed_at: r.completedAt ? r.completedAt.toISOString() : null,
        rate_limited: r.rateLimited,
      }),
    )
    .join("\n");

  const answersJsonl = answerRows
    .map((r) =>
      JSON.stringify({
        token_id: r.tokenId,
        field: r.field,
        value: r.value,
        answered_at: r.answeredAt.toISOString(),
        path: r.path,
        position: r.position,
      }),
    )
    .join("\n");

  writeFileSync(
    path.join(dataDir, "tokens.jsonl"),
    tokensJsonl + (tokensJsonl ? "\n" : ""),
  );
  writeFileSync(
    path.join(dataDir, "answers.jsonl"),
    answersJsonl + (answersJsonl ? "\n" : ""),
  );

  const tokenCsvHeader =
    "id,issued_at,expires_at,vocab_version,ua_rules_version,ua_class,ua_family,status,completed_at,rate_limited\n";
  const tokenCsv = tokenRows
    .map((r) =>
      [
        r.id,
        r.issuedAt.toISOString(),
        r.expiresAt.toISOString(),
        r.vocabVersion,
        r.uaRulesVersion,
        r.uaClass,
        r.uaFamily,
        r.status,
        r.completedAt ? r.completedAt.toISOString() : "",
        r.rateLimited,
      ]
        .map(csvEscape)
        .join(","),
    )
    .join("\n");
  writeFileSync(
    path.join(dataDir, "tokens.csv"),
    tokenCsvHeader + tokenCsv + (tokenCsv ? "\n" : ""),
  );

  const answerCsvHeader = "token_id,field,value,answered_at,path,position\n";
  const answerCsv = answerRows
    .map((r) =>
      [
        r.tokenId,
        r.field,
        r.value,
        r.answeredAt.toISOString(),
        r.path,
        r.position ?? "",
      ]
        .map(csvEscape)
        .join(","),
    )
    .join("\n");
  writeFileSync(
    path.join(dataDir, "answers.csv"),
    answerCsvHeader + answerCsv + (answerCsv ? "\n" : ""),
  );

  const vocabSrc = path.join(process.cwd(), "content", "vocab");
  for (const file of readdirSync(vocabSrc)) {
    if (file.endsWith(".json")) {
      copyFileSync(path.join(vocabSrc, file), path.join(dataDir, "vocab", file));
    }
  }

  const fingerprint = createHash("sha256")
    .update(tokensJsonl)
    .update(answersJsonl)
    .digest("hex");
  writeFileSync(path.join(dataDir, ".export-fingerprint"), fingerprint + "\n");

  if (!existsSync(path.join(dataDir, "README.md"))) {
    console.warn("data/README.md missing — expected to be committed in repo");
  }

  await pool.end();
  console.log(`Exported ${tokenRows.length} tokens, ${answerRows.length} answers.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
