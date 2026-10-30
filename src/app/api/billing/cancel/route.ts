import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { stripe } from "@/lib/stripe";
import { requireBillingRole, withTenant } from "@/lib/tenant-context";

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const result = await withTenant(request, async (client, session) => {
      requireBillingRole(session);
      const tenant = (await client.query<{ stripe_subscription_id: string | null }>(
        "SELECT stripe_subscription_id FROM tenants WHERE id = $1",
        [session.tenantId],
      )).rows[0];
      if (!tenant?.stripe_subscription_id) {
        throw new ApiError("CONFLICT", "The tenant does not have an active subscription.", 409);
      }
      const subscription = await stripe.subscriptions.update(tenant.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      return { id: subscription.id, cancelAt: subscription.cancel_at };
    });
    return apiSuccess(result, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
