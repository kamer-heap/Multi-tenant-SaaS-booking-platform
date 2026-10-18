import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "./api-error";
import { pool } from "./db";

type Session = { tenantId: string; userId?: string };

function readSession(value: string | undefined): Session | undefined {
  if (!value) return undefined;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return undefined;

  const expected = createHmac("sha256", process.env.AUTH_SECRET ?? "")
    .update(encoded)
    .digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Session).tenantId !== "string"
    ) {
      return undefined;
    }
    return parsed as Session;
  } catch {
    return undefined;
  }
}

function subdomainFromHost(host: string | null): string | undefined {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  const appHost = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").hostname;
  if (hostname === appHost) return undefined;
  if (hostname.endsWith(`.${appHost}`)) {
    return hostname.slice(0, -(appHost.length + 1)).split(".")[0];
  }
  return undefined;
}

export async function withTenant<T>(
  request: Request,
  callback: (client: import("pg").PoolClient, session: Session | undefined) => Promise<T>,
): Promise<T> {
  const session = readSession((await cookies()).get("session")?.value);
  const slug = request.headers.get("x-tenant-slug") ?? subdomainFromHost(request.headers.get("host"));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let tenantId = session?.tenantId;
    if (!tenantId && slug) {
      const result = await client.query<{ id: string }>("SELECT resolve_tenant($1) AS id", [slug]);
      tenantId = result.rows[0]?.id;
    }
    if (!tenantId) throw new ApiError("UNAUTHORIZED", "A valid tenant session is required.", 401);

    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
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
