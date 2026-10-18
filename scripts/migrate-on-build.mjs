/**
 * Vercel build step: after check-prod-config, before `next build`.
 * Uses DATABASE_URL_UNPOOLED, then DATABASE_URL.
 * Skips when neither is set (local builds). A migration error fails the build.
 */
import { applyMigrations, migrationUrl } from "./apply-migrations.mjs";

const url = migrationUrl();
if (!url) {
  console.log(
    "migrate-on-build: no DATABASE_URL_UNPOOLED or DATABASE_URL, skipping",
  );
  process.exit(0);
}

try {
  await applyMigrations(url);
} catch (err) {
  console.error("migrate-on-build: migration failed");
  console.error(err);
  process.exit(1);
}
