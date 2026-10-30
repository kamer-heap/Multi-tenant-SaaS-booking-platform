import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { priceForPlan } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { requireBillingRole, withTenant } from "@/lib/tenant-context";

const inputSchema = z.object({ plan: z.enum(["pro", "business"]) });

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "plan must be pro or business.", 400);
    const result = await withTenant(request, async (client, session) => {
      requireBillingRole(session);
      const tenant = (await client.query<{ stripe_subscription_id: string | null }>(
        "SELECT stripe_subscription_id FROM tenants WHERE id = $1",
        [session.tenantId],
      )).rows[0];
      if (!tenant?.stripe_subscription_id) {
        throw new ApiError("CONFLICT", "The tenant does not have an active subscription.", 409);
      }
      const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
      const item = subscription.items.data[0];
      if (!item) throw new ApiError("CONFLICT", "The subscription has no price.", 409);
      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: priceForPlan(parsed.data.plan) }],
        proration_behavior: "create_prorations",
      });
      return { id: updated.id, status: updated.status };
    });
    return apiSuccess(result, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
