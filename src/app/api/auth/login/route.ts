import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiErrorResponse, apiSuccess, ApiError } from "@/lib/api-error";
import { pool } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { signSession } from "@/lib/session-core";

const loginSchema = z.object({
  organization: z.string().trim().min(3).max(30).regex(/^[a-z0-9-]+$/),
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const requestId = randomUUID();
  const client = await pool.connect();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid login data.", 400, parsed.error.issues);
    }

    await client.query("BEGIN");
    const tenantResult = await client.query<{ id: string }>(
      "SELECT resolve_tenant($1) AS id",
      [parsed.data.organization],
    );
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) throw new ApiError("UNAUTHORIZED", "Invalid organization or credentials.", 401);

    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const userResult = await client.query<{ id: string; password_hash: string; role: string }>(
      `SELECT u.id, u.password_hash, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.tenant_id = $1 AND lower(u.email) = lower($2)`,
      [tenantId, parsed.data.email],
    );
    const user = userResult.rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      throw new ApiError("UNAUTHORIZED", "Invalid organization or credentials.", 401);
    }

    const token = await signSession({ userId: user.id, tenantId, role: user.role });
    await client.query("COMMIT");
    const response = apiSuccess({ authenticated: true }, 200, requestId);
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return apiErrorResponse(error, requestId);
  } finally {
    client.release();
  }
}
