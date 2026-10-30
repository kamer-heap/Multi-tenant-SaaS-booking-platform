"use client";

import Link from "next/link";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { createCheckout, type BillingPlan } from "@/lib/api";

const plans: Array<{
  name: Exclude<BillingPlan, "free"> | "free";
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
}> = [
  {
    name: "free",
    price: "$0",
    description: "For trying out a simple workspace.",
    features: ["Manage bookings", "Shared workspace calendar", "Email support"],
  },
  {
    name: "pro",
    price: "$29",
    description: "For growing teams that need more.",
    features: ["Everything in Free", "Priority support", "Advanced billing controls"],
    featured: true,
  },
  {
    name: "business",
    price: "$79",
    description: "For established teams with higher volume.",
    features: ["Everything in Pro", "Multiple team admins", "Dedicated support"],
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<BillingPlan | null>(null);

  async function subscribe(plan: Exclude<BillingPlan, "free">) {
    setLoading(plan);
    try {
      const checkout = await createCheckout(plan);
      if (!checkout.url) throw new Error("Stripe did not return a checkout URL.");
      window.location.assign(checkout.url);
    } catch {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Link href="/dashboard/bookings" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-indigo-700">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">P</span>
            Parallax
          </Link>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Simple, transparent pricing</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Choose the plan for your workspace</h1>
          <p className="mt-3 text-slate-500">Start free and upgrade when your team is ready.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className={`flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ${plan.featured ? "ring-2 ring-indigo-500" : "ring-slate-200"}`}>
              {(() => {
                const paidPlan = plan.name === "free" ? undefined : plan.name;
                return (
                  <>
              {plan.featured && <div className="mb-4 inline-flex w-fit items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"><Sparkles className="size-3" />Most popular</div>}
              <h2 className="text-xl font-bold capitalize">{plan.name}</h2>
              <p className="mt-2 min-h-10 text-sm text-slate-500">{plan.description}</p>
              <p className="mt-5 text-4xl font-bold">{plan.price}<span className="text-sm font-medium text-slate-500"> / month</span></p>
              <ul className="my-6 flex-1 space-y-3 text-sm text-slate-600">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{feature}</li>)}
              </ul>
              {!paidPlan ? (
                <Link href="/login" className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Get started</Link>
              ) : (
                <button onClick={() => subscribe(paidPlan)} disabled={loading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading === paidPlan && <LoaderCircle className="size-4 animate-spin" />}
                  {loading === paidPlan ? "Opening checkout..." : "Subscribe"}
                </button>
              )}
                  </>
                );
              })()}
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500"><Link href="/dashboard/billing" className="font-semibold text-indigo-700 hover:underline">Already subscribed?</Link> Manage billing from your dashboard.</p>
      </div>
    </main>
  );
}
