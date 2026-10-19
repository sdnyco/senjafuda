/**
 * Nightly export: dump tokens + answers to /data and copy vocab.
 * Read-only — never UPDATE. Usage:
 *   DATABASE_URL_READONLY=... EXPORT_ID_SALT=... pnpm exec tsx scripts/export.ts
 *
 * Public files use `public_id` only — never the raw token id.
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
import ws from "ws";
import { answers, tokens } from "../src/db/schema";
import { effectiveStatus } from "../src/lib/effective-status";
import { publicId } from "../src/lib/public-id";

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

  const salt = process.env.EXPORT_ID_SALT;
  if (!salt) throw new Error("EXPORT_ID_SALT is required (never rotate once published)");

  const exportedAt = new Date();
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const tokenRows = await db.select().from(tokens);
  const answerRows = await db.select().from(answers);

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(path.join(dataDir, "vocab"), { recursive: true });

  const tokensJsonl = tokenRows
    .map((r) =>
      JSON.stringify({
        public_id: publicId(r.id, salt),
        issued_at: r.issuedAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
        vocab_version: r.vocabVersion,
        ua_rules_version: r.uaRulesVersion,
        ua_class: r.uaClass,
        ua_family: r.uaFamily,
        status: r.status,
        effective_status: effectiveStatus(
          r.status,
          r.expiresAt,
          exportedAt,
          r.swept,
        ),
        completed_at: r.completedAt ? r.completedAt.toISOString() : null,
        rate_limited: r.rateLimited,
        swept: r.swept,
      }),
    )
    .join("\n");

  const answersJsonl = answerRows
    .map((r) =>
      JSON.stringify({
        public_id: publicId(r.tokenId, salt),
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
    "public_id,issued_at,expires_at,vocab_version,ua_rules_version,ua_class,ua_family,status,effective_status,completed_at,rate_limited,swept\n";
  const tokenCsv = tokenRows
    .map((r) =>
      [
        publicId(r.id, salt),
        r.issuedAt.toISOString(),
        r.expiresAt.toISOString(),
        r.vocabVersion,
        r.uaRulesVersion,
        r.uaClass,
        r.uaFamily,
        r.status,
        effectiveStatus(r.status, r.expiresAt, exportedAt, r.swept),
        r.completedAt ? r.completedAt.toISOString() : "",
        r.rateLimited,
        r.swept,
      ]
        .map(csvEscape)
        .join(","),
    )
    .join("\n");
  writeFileSync(
    path.join(dataDir, "tokens.csv"),
    tokenCsvHeader + tokenCsv + (tokenCsv ? "\n" : ""),
  );

  const answerCsvHeader = "public_id,field,value,answered_at,path,position\n";
  const answerCsv = answerRows
    .map((r) =>
      [
        publicId(r.tokenId, salt),
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

  writeFileSync(
    path.join(dataDir, "exported_at"),
    exportedAt.toISOString() + "\n",
  );

  const fingerprint = createHash("sha256")
    .update(tokensJsonl)
    .update(answersJsonl)
    .update(exportedAt.toISOString())
    .digest("hex");
  writeFileSync(path.join(dataDir, ".export-fingerprint"), fingerprint + "\n");

  if (!existsSync(path.join(dataDir, "README.md"))) {
    console.warn("data/README.md missing — expected to be committed in repo");
  }

  await pool.end();
  console.log(
    `Exported ${tokenRows.length} tokens, ${answerRows.length} answers at ${exportedAt.toISOString()} (read-only, public_id).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
