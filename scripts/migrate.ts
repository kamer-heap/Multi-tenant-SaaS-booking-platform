import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (done.rowCount) {
      console.log("skip", file);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});