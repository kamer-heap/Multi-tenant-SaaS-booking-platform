import { ApiError } from "./api-error";
import { PRICES } from "./stripe";

export type PaidPlan = "pro" | "business";

export function priceForPlan(plan: string): string {
  if (plan !== "pro" && plan !== "business") {
    throw new ApiError("VALIDATION_ERROR", "plan must be pro or business.", 400);
  }
  const price = PRICES[plan];
  if (!price) throw new ApiError("INTERNAL", `Stripe price for ${plan} is not configured.`, 500);
  return price;
}

export function appUrl(): string {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new ApiError("INTERNAL", "APP_URL is not configured.", 500);
  return value.replace(/\/$/, "");
}
