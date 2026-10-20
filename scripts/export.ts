/**
 * Nightly export (era 1).
 *   DATABASE_URL_READONLY=... EXPORT_ID_SALT=... pnpm exec tsx scripts/export.ts
 *
 * Optional: PILOT_FINAL=1 also dumps pilot tokens/answers into data/pilot-2026-10/.
 * Requires DATABASE_URL_READONLY (no fallback to DATABASE_URL).
 */
import "dotenv/config";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import ws from "ws";
import {
  answers,
  canvasState,
  census,
  drawings,
  tokens,
  visits,
} from "../src/db/schema";
import { publicId } from "../src/lib/public-id";
import { era1EffectiveStatus } from "../src/lib/era1-effective-status";
import { effectiveStatus } from "../src/lib/effective-status";
import {
  renderCanvasText,
  type CanvasCell,
} from "../src/lib/canvas";
import { loadEra1Vocab } from "../src/lib/era1-vocab";

neonConfig.webSocketConstructor = ws;

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function dayStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function exportPilotFinal(
  db: ReturnType<typeof drizzle>,
  salt: string,
  exportedAt: Date,
) {
  const dir = path.join(process.cwd(), "data", "pilot-2026-10");
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "vocab"), { recursive: true });

  const tokenRows = await db.select().from(tokens);
  const answerRows = await db.select().from(answers);

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

  writeFileSync(path.join(dir, "tokens.jsonl"), tokensJsonl + (tokensJsonl ? "\n" : ""));
  writeFileSync(path.join(dir, "answers.jsonl"), answersJsonl + (answersJsonl ? "\n" : ""));
  writeFileSync(path.join(dir, "exported_at"), exportedAt.toISOString() + "\n");

  const switchover = exportedAt.toISOString().slice(0, 10);
  const readme = `Pilot, 2026-10-18 to ${switchover}. Different design (multiple-choice visitors' book with a mark). Conditions differed from era 1; kept for completeness, not comparable. Contains known crawler entries; see notes in the previous data README history.

This archive is a final dump of the pilot \`tokens\` / \`answers\` tables.

public_ids in this archive were regenerated on 2026-10-20 after a salt rotation; earlier pilot exports in git history used different ids.
`;
  writeFileSync(path.join(dir, "README.md"), readme);

  const vocabSrc = path.join(process.cwd(), "content", "vocab");
  for (const f of readdirSync(vocabSrc)) {
    if (f.endsWith(".json")) {
      copyFileSync(path.join(vocabSrc, f), path.join(dir, "vocab", f));
    }
  }
  console.log("Pilot final export written to data/pilot-2026-10/");
}

async function main() {
  const url = process.env.DATABASE_URL_READONLY;
  if (!url) {
    throw new Error("DATABASE_URL_READONLY is required (no DATABASE_URL fallback)");
  }
  const salt = process.env.EXPORT_ID_SALT;
  if (!salt) throw new Error("EXPORT_ID_SALT is required");

  const exportedAt = new Date();
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  if (process.env.PILOT_FINAL === "1" || process.env.PILOT_FINAL === "true") {
    await exportPilotFinal(db, salt, exportedAt);
    await pool.end();
    return;
  }

  loadEra1Vocab();
  const eraDir = path.join(process.cwd(), "data", "era1");
  const sealedDir = path.join(eraDir, "sealed");
  mkdirSync(eraDir, { recursive: true });
  mkdirSync(sealedDir, { recursive: true });

  const frameRows = await db.select().from(canvasState).where(eq(canvasState.id, 1));
  const frameSize = frameRows[0]?.frameSize ?? 5;
  const validDrawings = await db.select().from(drawings).where(eq(drawings.status, "valid"));
  const cells: CanvasCell[] = validDrawings.map((d) => ({
    x: d.x,
    y: d.y,
    pattern: d.pattern,
    kind: d.kind,
  }));

  const canvasTxt = renderCanvasText({ frameSize, cells });
  writeFileSync(path.join(eraDir, "canvas.txt"), canvasTxt + "\n");

  const canvasJson = {
    frame_size: frameSize,
    cells: validDrawings.map((d) => ({
      x: d.x,
      y: d.y,
      pattern: d.pattern,
      seed: d.kind === "seed",
    })),
  };
  writeFileSync(
    path.join(eraDir, "canvas.json"),
    JSON.stringify(canvasJson, null, 2) + "\n",
  );

  const visitRows = await db.select().from(visits);
  const visitorValid = validDrawings.filter((d) => d.kind === "visitor").length;
  const declines = visitRows.filter((v) => v.status === "declined").length;
  const totals = {
    visits: visitRows.length,
    entries: visitorValid,
    declines,
  };
  writeFileSync(
    path.join(eraDir, "totals.json"),
    JSON.stringify(totals, null, 2) + "\n",
  );
  writeFileSync(path.join(eraDir, "exported_at"), exportedAt.toISOString() + "\n");

  // Sealed delta for this UTC day (created or updated)
  const start = dayStartUtc(exportedAt);
  const day = exportedAt.toISOString().slice(0, 10);

  const visitDelta = visitRows.filter(
    (r) => r.issuedAt >= start || r.updatedAt >= start,
  );
  const drawingDelta = (
    await db.select().from(drawings)
  ).filter((r) => r.createdAt >= start || r.updatedAt >= start);
  const censusDelta = (
    await db.select().from(census)
  ).filter((r) => r.answeredAt >= start || r.updatedAt >= start);

  const lines: string[] = [];
  for (const r of visitDelta) {
    lines.push(
      JSON.stringify({
        table: "visits",
        public_id: publicId(r.id, salt),
        era: r.era,
        issued_at: r.issuedAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
        vocab_version: r.vocabVersion,
        ua_rules_version: r.uaRulesVersion,
        ua_class: r.uaClass,
        ua_family: r.uaFamily,
        ua_suspect: r.uaSuspect,
        status: r.status,
        effective_status: era1EffectiveStatus(
          r.status,
          r.expiresAt,
          exportedAt,
          r.swept,
        ),
        swept: r.swept,
        rate_limited: r.rateLimited,
        late_fetches: r.lateFetches,
        inherited_from: r.inheritedFrom,
        completed_at: r.completedAt ? r.completedAt.toISOString() : null,
        updated_at: r.updatedAt.toISOString(),
      }),
    );
  }
  for (const r of drawingDelta) {
    lines.push(
      JSON.stringify({
        table: "drawings",
        id: r.id,
        public_id: r.visitId ? publicId(r.visitId, salt) : null,
        kind: r.kind,
        x: r.x,
        y: r.y,
        pattern: r.pattern,
        path: r.path,
        option_order: r.optionOrder,
        status: r.status,
        excluded_reason: r.excludedReason,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      }),
    );
  }
  for (const r of censusDelta) {
    lines.push(
      JSON.stringify({
        table: "census",
        id: r.id,
        public_id: publicId(r.visitId, salt),
        field: r.field,
        value: r.value,
        answered_at: r.answeredAt.toISOString(),
        path: r.path,
        position: r.position,
        option_order: r.optionOrder,
        superseded: r.superseded,
        updated_at: r.updatedAt.toISOString(),
      }),
    );
  }

  const plaintext = lines.join("\n") + (lines.length ? "\n" : "");
  const deltaHash = sha256Hex(plaintext);

  const recipientPath = path.join(process.cwd(), "seal", "age-recipient.txt");
  const ageOut = path.join(sealedDir, `${day}.jsonl.age`);
  if (!existsSync(recipientPath)) {
    console.warn(
      "seal/age-recipient.txt missing — skipping sealed encrypt (data stays in DB)",
    );
  } else {
    const recipient = readFileSync(recipientPath, "utf8").trim();
    const tmpPlain = path.join(sealedDir, `${day}.jsonl`);
    writeFileSync(tmpPlain, plaintext);
    const age = spawnSync(
      "age",
      ["-r", recipient, "-o", ageOut, tmpPlain],
      { encoding: "utf8" },
    );
    if (age.status !== 0) {
      console.warn("age encrypt failed:", age.stderr || age.error);
    } else {
      console.log("Wrote", ageOut);
    }
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(tmpPlain);
    } catch {
      /* keep plaintext only if age missing — prefer not to leave it */
    }
  }

  const chainPath = path.join(sealedDir, "chain.txt");
  let prev = "0".repeat(64);
  if (existsSync(chainPath)) {
    const existing = readFileSync(chainPath, "utf8").trim().split("\n").filter(Boolean);
    if (existing.length > 0) {
      prev = sha256Hex(existing[existing.length - 1]!);
    }
  }
  const chainLine = `${day}  ${deltaHash}  ${prev}`;
  const chainBody = existsSync(chainPath)
    ? readFileSync(chainPath, "utf8").replace(/\s*$/, "") + "\n" + chainLine + "\n"
    : chainLine + "\n";
  // Avoid duplicate same-day lines on re-run
  if (existsSync(chainPath)) {
    const linesExisting = readFileSync(chainPath, "utf8").trim().split("\n");
    const withoutToday = linesExisting.filter((l) => !l.startsWith(day + " "));
    const rebuilt =
      withoutToday.join("\n") +
      (withoutToday.length ? "\n" : "") +
      chainLine +
      "\n";
    writeFileSync(chainPath, rebuilt);
  } else {
    writeFileSync(chainPath, chainBody);
  }

  const vocabSrc = path.join(process.cwd(), "content", "vocab", "era1.json");
  mkdirSync(path.join(eraDir, "vocab"), { recursive: true });
  copyFileSync(vocabSrc, path.join(eraDir, "vocab", "era1.json"));

  console.log("Era 1 export written to data/era1/");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
