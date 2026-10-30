import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { appUrl, priceForPlan } from "@/lib/billing";
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
      const tenant = (await client.query<{ stripe_customer_id: string | null }>(
        "SELECT stripe_customer_id FROM tenants WHERE id = $1",
        [session.tenantId],
      )).rows[0];
      if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found.", 404);

      let customerId = tenant.stripe_customer_id;
      if (!customerId) {
        const user = (await client.query<{ email: string }>(
          "SELECT email FROM users WHERE id = $1",
          [session.userId],
        )).rows[0];
        const customer = await stripe.customers.create({
          email: user?.email,
          metadata: { tenantId: session.tenantId },
        });
        customerId = customer.id;
        await client.query("UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2", [
          customerId,
          session.tenantId,
        ]);
      }

      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceForPlan(parsed.data.plan), quantity: 1 }],
        subscription_data: { metadata: { tenantId: session.tenantId } },
        metadata: { tenantId: session.tenantId },
        success_url: `${appUrl()}/dashboard/billing?checkout=success`,
        cancel_url: `${appUrl()}/dashboard/billing?checkout=cancelled`,
      });
      return { id: checkout.id, url: checkout.url };
    });
    return apiSuccess(result, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
