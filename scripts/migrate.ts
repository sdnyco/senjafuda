/**
 * Local/dev only. Loads `.env` and applies /drizzle/*.sql.
 * Production and Preview migrate during the Vercel build
 * (`scripts/migrate-on-build.mjs`), not from a laptop.
 * Usage: pnpm db:migrate
 */
import "dotenv/config";
import { applyMigrations, migrationUrl } from "./apply-migrations.mjs";

const url = migrationUrl();
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}

applyMigrations(url).catch((err) => {
  console.error(err);
  process.exit(1);
});
