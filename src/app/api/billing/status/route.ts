import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { withTenant } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const result = await withTenant(request, async (client) => (await client.query(
      `SELECT plan, subscription_status, current_period_end,
              stripe_subscription_id IS NOT NULL AS subscribed
         FROM tenants WHERE id = current_tenant_id()`,
    )).rows[0]);
    return apiSuccess(result, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
