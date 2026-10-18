/**
 * Apply every /drizzle/*.sql file in order.
 * Files must be additive and safe to re-run (builds apply them on every deploy).
 * Prints the database host only — never the connection string.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export function migrationUrl() {
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
}

function assertNotProductionFromNonProd(url) {
  if (process.env.VERCEL_ENV === "production") return;
  const prod = process.env.PRODUCTION_DATABASE_URL;
  if (!prod) return;
  if (url === prod || process.env.DATABASE_URL === prod) {
    throw new Error(
      "Refusing to migrate: database URL matches PRODUCTION_DATABASE_URL outside production.",
    );
  }
}

export async function applyMigrations(url) {
  assertNotProductionFromNonProd(url);
  const host = new URL(url).host;
  console.log(
    `Applying migrations on ${host} (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`,
  );
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const pool = new Pool({ connectionString: url });
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      await pool.query(sql);
      console.log("Applied", file);
    }
  } finally {
    await pool.end();
  }
}
