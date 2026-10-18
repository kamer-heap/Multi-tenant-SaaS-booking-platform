import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { ApiError } from "./api-error";
import { pool } from "./db";
import { getSession, SESSION_COOKIE, verifySessionToken, type Session } from "./session";

export async function withTenant<T>(
  _request: Request,
  callback: (client: PoolClient, session: Session) => Promise<T>,
): Promise<T> {
  const session = await getSession();
  if (!session) throw new ApiError("UNAUTHORIZED", "A valid tenant session is required.", 401);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [session.tenantId]);
    const result = await callback(client, session);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

export { cookies, SESSION_COOKIE, verifySessionToken };
