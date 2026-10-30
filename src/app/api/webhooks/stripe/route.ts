import Stripe from "stripe";
import { privilegedPool } from "@/lib/db";
import { planFromPrice, stripe } from "@/lib/stripe";

function idOf(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return new Response("Invalid webhook configuration.", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  const client = await privilegedPool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [event.id, event.type],
    );
    if (!inserted.rowCount) {
      await client.query("ROLLBACK");
      return Response.json({ received: true, duplicate: true });
    }

    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = idOf(subscription.customer);
      if (customerId) {
        const priceId = subscription.items.data[0]?.price.id ?? "";
        await client.query(
          `UPDATE tenants
              SET stripe_subscription_id = $1,
                  plan = $2,
                  subscription_status = $3,
                  current_period_end = CASE WHEN $4::bigint IS NULL THEN NULL ELSE to_timestamp($4::bigint) END
            WHERE stripe_customer_id = $5`,
          [
            event.type === "customer.subscription.deleted" ? null : subscription.id,
            event.type === "customer.subscription.deleted" ? "free" : planFromPrice(priceId),
            subscription.status,
            event.type === "customer.subscription.deleted"
              ? null
              : subscription.items.data[0]?.current_period_end ?? null,
            customerId,
          ],
        );
      }
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = idOf(invoice.customer);
      if (customerId) {
        await client.query(
          `INSERT INTO invoices
            (id, tenant_id, amount_paid, currency, status, hosted_invoice_url, created_at)
           SELECT $1, id, $2, $3, $4, $5, to_timestamp($6)
             FROM tenants WHERE stripe_customer_id = $7
          ON CONFLICT (id) DO UPDATE SET
            amount_paid = EXCLUDED.amount_paid, currency = EXCLUDED.currency,
            status = EXCLUDED.status, hosted_invoice_url = EXCLUDED.hosted_invoice_url`,
          [
            invoice.id,
            invoice.amount_paid,
            invoice.currency,
            invoice.status,
            invoice.hosted_invoice_url,
            invoice.created,
            customerId,
          ],
        );
        if (event.type === "invoice.payment_failed") {
          await client.query(
            "UPDATE tenants SET subscription_status = 'past_due' WHERE stripe_customer_id = $1",
            [customerId],
          );
        }
      }
    }

    await client.query("COMMIT");
    return Response.json({ received: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[stripe-webhook]", error);
    return new Response("Webhook processing failed.", { status: 500 });
  } finally {
    client.release();
  }
}
