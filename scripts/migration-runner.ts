import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

export async function applyMigration(pool: Pool, file: string, transactional = true): Promise<boolean> {
  const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
  if (existing.rowCount) {
    console.log("skip", file);
    return false;
  }

  const sql = fs.readFileSync(path.join(process.cwd(), "db", "migrations", file), "utf8");
  if (transactional) await pool.query("BEGIN");
  try {
    const statements = transactional
      ? [sql]
      : sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await pool.query(statement);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    if (transactional) await pool.query("COMMIT");
    console.log("applied", file);
    return true;
  } catch (error) {
    if (transactional) await pool.query("ROLLBACK");
    throw error;
  }
}
