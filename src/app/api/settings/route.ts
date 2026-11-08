import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, apiErrorResponse, apiSuccess } from "@/lib/api-error";
import {
  getTenantSettings,
  saveTenantSettings,
} from "@/lib/tenant-settings";
import { requireBillingRole, withTenant } from "@/lib/tenant-context";
import { tenantSettingsSchema } from "@/lib/schemas/tenant-settings";

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const result = await withTenant(request, async (_client, session) =>
      getTenantSettings(session.tenantId),
    );
    return apiSuccess(result, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PUT(request: NextRequest) {
  const requestId = randomUUID();
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
    }

    const parsed = tenantSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid tenant settings data.", 400, parsed.error.issues);
    }

    const result = await withTenant(request, async (_client, session) => {
      requireBillingRole(session);
      return saveTenantSettings(session.tenantId, parsed.data);
    });
    return apiSuccess(result, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
