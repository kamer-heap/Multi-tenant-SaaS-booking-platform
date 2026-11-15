import { privilegedPool } from "../src/lib/db";
import { applyMigration } from "./migration-runner";
import { runBackfill } from "./backfill";

async function main() {
  await privilegedPool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const baseMigrations = ["001_init.sql", "002_rls.sql", "003_billing.sql", "003_bookings_api.sql", "004_billing.sql", "005_notes_version.sql", "006_tenant_settings.sql"];
  for (const file of baseMigrations) await applyMigration(privilegedPool, file);
  await applyMigration(privilegedPool, "007_expand_bookings_status.sql", false);
  await runBackfill(privilegedPool);
  await applyMigration(privilegedPool, "008_contract.sql");
  await privilegedPool.end();
}

main().catch(async (error) => {
  console.error(error);
  await privilegedPool.end().catch(() => undefined);
  process.exit(1);
});
