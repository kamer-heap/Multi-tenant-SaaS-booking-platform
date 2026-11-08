import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { saveBookingNotes } from "@/lib/booking-notes";
import { updateBookingNotes } from "@/lib/schemas/booking-notes";
import { withTenant } from "@/lib/tenant-context";

const idSchema = z.string().uuid();

async function getId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid booking id.", 400);
  return parsed.data;
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

    const parsed = updateBookingNotes.safeParse(input);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid booking notes data.", 400, parsed.error.issues);
    }

    const body = await withTenant(request, async (client, session) => {
      return saveBookingNotes(client, id, session.userId, parsed.data.notes, parsed.data.baseVersion);
    });

    return apiSuccess(body, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
