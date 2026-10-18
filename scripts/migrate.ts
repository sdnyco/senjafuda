import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { assertNonProdDbNotProduction } from "../src/lib/env-guards";

neonConfig.webSocketConstructor = ws;

async function main() {
  assertNonProdDbNotProduction();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sqlPath = path.join(process.cwd(), "drizzle", "0000_init.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString: url });
  await pool.query(sql);
  await pool.end();
  console.log("Applied", sqlPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
