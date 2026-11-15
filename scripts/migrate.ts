import { privilegedPool } from "../src/lib/db";
import { applyMigration } from "./migration-runner";

async function main() {
  await privilegedPool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = ["001_init.sql", "002_rls.sql", "003_billing.sql", "003_bookings_api.sql", "004_billing.sql", "005_notes_version.sql", "006_tenant_settings.sql"];
  for (const file of files) {
    await applyMigration(privilegedPool, file);
  }
  await privilegedPool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});