import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set");

export const stripe = new Stripe(secretKey);

export const PRICES = {
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  business: process.env.STRIPE_PRICE_BUSINESS ?? "",
} as const;

export function planFromPrice(priceId: string): "pro" | "business" | "free" {
  if (PRICES.pro && priceId === PRICES.pro) return "pro";
  if (PRICES.business && priceId === PRICES.business) return "business";
  return "free";
}