import { Pool, type PoolClient, type QueryResultRow } from "pg";

const connectionString = process.env.APP_DATABASE_URL;

if (!connectionString) {
  throw new Error("APP_DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString });

export async function inTransaction<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function rows<T extends QueryResultRow>(result: { rows: T[] }): T[] {
  return result.rows;
}
