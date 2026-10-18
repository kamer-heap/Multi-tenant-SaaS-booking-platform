import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, apiSuccess, logApiError } from "@/lib/api-error";
import { serializeBooking, type BookingRow } from "@/lib/booking-response";
import { createBooking } from "@/lib/schemas/booking";
import { databaseCode, withTenant } from "@/lib/tenant-context";

const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const range = rangeSchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
    });
    if (!range.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid date range.", 400, range.error.issues);
    }
    if (range.data.from && range.data.to && new Date(range.data.to) < new Date(range.data.from)) {
      throw new ApiError("VALIDATION_ERROR", "to must be after from.", 400);
    }

    const body = await withTenant(request, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (range.data.from) {
        values.push(range.data.from);
        filters.push(`starts_at >= $${values.length}`);
      }
      if (range.data.to) {
        values.push(range.data.to);
        filters.push(`ends_at <= $${values.length}`);
      }
      const where = filters.length ? `AND ${filters.join(" AND ")}` : "";
      const result = await client.query<BookingRow>(
        `SELECT id, tenant_id, created_by, title, client_name, client_email,
                starts_at, ends_at, status, notes, created_at
           FROM bookings
          WHERE true ${where}
          ORDER BY starts_at ASC`,
        values,
      );
      return { bookings: result.rows.map(serializeBooking) };
    });
    return apiSuccess(body, 200, requestId);
  } catch (error) {
    logApiError(error, requestId);
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiError("VALIDATION_ERROR", "Idempotency-Key header is required.", 400);
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
    }
    const parsed = createBooking.safeParse(input);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid booking data.", 400, parsed.error.issues);
    }
    const requestHash = createHash("sha256")
      .update(JSON.stringify(parsed.data))
      .digest("hex");

    const body = await withTenant(request, async (client, session) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        idempotencyKey,
      ]);
      const existing = await client.query<{ request_hash: string; response_status: number; response_body: unknown }>(
        "SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1",
        [idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) {
          throw new ApiError(
            "IDEMPOTENCY_MISMATCH",
            "The Idempotency-Key was already used with a different request body.",
            422,
          );
        }
        return {
          status: existing.rows[0].response_status,
          body: existing.rows[0].response_body,
        };
      }

      const result = await client.query<BookingRow>(
        `INSERT INTO bookings
          (tenant_id, created_by, title, client_name, client_email, starts_at, ends_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
         RETURNING id, tenant_id, created_by, title, client_name, client_email,
                   starts_at, ends_at, status, notes, created_at`,
        [
          session.tenantId,
          session.userId,
          parsed.data.title,
          parsed.data.clientName,
          parsed.data.clientEmail,
          parsed.data.startsAt,
          parsed.data.endsAt,
          parsed.data.notes ?? "",
        ],
      );
      const responseBody = serializeBooking(result.rows[0]);
      await client.query(
        `INSERT INTO idempotency_keys
          (tenant_id, key, request_hash, response_status, response_body)
         VALUES (current_tenant_id(), $1, $2, 201, $3::jsonb)`,
        [idempotencyKey, requestHash, JSON.stringify(responseBody)],
      );
      return { status: 201, body: responseBody };
    });
    return apiSuccess(body.body, body.status, requestId);
  } catch (error) {
    logApiError(error, requestId);
    if (databaseCode(error) === "23P01") {
      return apiErrorResponse(new ApiError("CONFLICT", "The booking overlaps an existing booking.", 409), requestId);
    }
    if (databaseCode(error) === "23514") {
      return apiErrorResponse(new ApiError("VALIDATION_ERROR", "endsAt must be after startsAt.", 400), requestId);
    }
    return apiErrorResponse(error, requestId);
  }
}
