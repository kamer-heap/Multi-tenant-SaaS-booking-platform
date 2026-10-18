import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { serializeBooking, type BookingRow } from "@/lib/booking-response";
import { updateBooking } from "@/lib/schemas/booking";
import { databaseCode, withTenant } from "@/lib/tenant-context";

const idSchema = z.string().uuid();

async function getId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid booking id.", 400);
  return parsed.data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  try {
    const id = await getId(params);
    const body = await withTenant(_request, async (client) => {
      const result = await client.query<BookingRow>(
        `SELECT id, tenant_id, created_by, title, client_name, client_email,
                starts_at, ends_at, status, notes, created_at
           FROM bookings WHERE id = $1`,
        [id],
      );
      if (!result.rows[0]) throw new ApiError("NOT_FOUND", "Booking not found.", 404);
      return serializeBooking(result.rows[0]);
    });
    return apiSuccess(body, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  try {
    const id = await getId(params);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
    }
    const parsed = updateBooking.safeParse(input);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid booking data.", 400, parsed.error.issues);
    }

    const body = await withTenant(request, async (client) => {
      const columns: Record<string, string> = {
        title: "title",
        clientName: "client_name",
        clientEmail: "client_email",
        startsAt: "starts_at",
        endsAt: "ends_at",
        notes: "notes",
      };
      const values: unknown[] = [];
      const assignments = Object.entries(parsed.data).map(([key, value]) => {
        values.push(value);
        return `${columns[key]} = $${values.length}`;
      });
      values.push(id);
      const result = await client.query<BookingRow>(
        `UPDATE bookings SET ${assignments.join(", ")}
          WHERE id = $${values.length}
          RETURNING id, tenant_id, created_by, title, client_name, client_email,
                    starts_at, ends_at, status, notes, created_at`,
        values,
      );
      if (!result.rows[0]) throw new ApiError("NOT_FOUND", "Booking not found.", 404);
      return serializeBooking(result.rows[0]);
    });
    return apiSuccess(body, 200, requestId);
  } catch (error) {
    if (databaseCode(error) === "23P01") {
      return apiErrorResponse(new ApiError("CONFLICT", "The booking overlaps an existing booking.", 409), requestId);
    }
    if (databaseCode(error) === "23514") {
      return apiErrorResponse(new ApiError("VALIDATION_ERROR", "endsAt must be after startsAt.", 400), requestId);
    }
    return apiErrorResponse(error, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  try {
    const id = await getId(params);
    const body = await withTenant(request, async (client) => {
      const result = await client.query("DELETE FROM bookings WHERE id = $1", [id]);
      if (!result.rowCount) throw new ApiError("NOT_FOUND", "Booking not found.", 404);
      return { deleted: true };
    });
    return apiSuccess(body, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
