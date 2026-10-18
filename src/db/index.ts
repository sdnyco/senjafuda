import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { assertNonProdDbNotProduction } from "@/lib/env-guards";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;

function getPool() {
  assertNonProdDbNotProduction();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;
