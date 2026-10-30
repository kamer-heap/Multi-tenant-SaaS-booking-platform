"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Suspense } from "react";
import { toast } from "sonner";
import { cancelBilling, changeBillingPlan, createCheckout, getBillingStatus, listInvoices, type BillingPlan } from "@/lib/api";

const planOrder: BillingPlan[] = ["free", "pro", "business"];

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

function label(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not subscribed";
}

export default function BillingPage() {
  return (
    <Suspense fallback={<section className="mx-auto max-w-6xl p-4 text-sm text-slate-500 sm:p-6 lg:p-8">Loading billing details...</section>}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const statusQuery = useQuery({ queryKey: ["billing-status"], queryFn: getBillingStatus });
  const invoicesQuery = useQuery({ queryKey: ["billing-invoices"], queryFn: listInvoices });
  const [confirming, setConfirming] = useState(false);
  const [busyPlan, setBusyPlan] = useState<Exclude<BillingPlan, "free"> | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const confirmationStarted = useRef(false);
  const status = statusQuery.data;

  const pollForPlan = useCallback(async (expected?: Exclude<BillingPlan, "free">) => {
    setConfirming(true);
    const started = Date.now();
    try {
      while (Date.now() - started <= 30_000) {
        const next = await queryClient.fetchQuery({ queryKey: ["billing-status"], queryFn: getBillingStatus });
        if (!expected ? next.plan !== "free" : next.plan === expected) {
          toast.success("Your billing plan is up to date.");
          setConfirming(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      toast.error("Stripe confirmation is taking longer than expected. Refresh shortly.");
    } catch {
      toast.error("We could not confirm your billing update.");
    } finally {
      setConfirming(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (params.get("checkout") === "success" && !confirmationStarted.current) {
      confirmationStarted.current = true;
      router.replace("/dashboard/billing");
      void pollForPlan();
    }
  }, [params, pollForPlan, router]);

  const changePlan = useMutation({
    mutationFn: changeBillingPlan,
    onSuccess: (_, plan) => {
      setBusyPlan(null);
      void pollForPlan(plan);
    },
    onError: () => setBusyPlan(null),
  });

  const checkout = useMutation({
    mutationFn: createCheckout,
    onSuccess: (result) => {
      if (!result.url) {
        setBusyPlan(null);
        toast.error("Stripe did not return a checkout URL.");
        return;
      }
      window.location.assign(result.url);
    },
    onError: () => setBusyPlan(null),
  });

  const cancel = useMutation({
    mutationFn: cancelBilling,
    onSuccess: () => {
      setCancelBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      toast.success("Your subscription will cancel at the end of the billing period.");
    },
    onError: () => setCancelBusy(false),
  });

  const currentIndex = status ? planOrder.indexOf(status.plan) : 0;
  return (
    <section className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-600">Workspace</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your plan, subscription status, and invoices.</p>
      </div>
      {confirming && <div className="mb-6 flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 ring-1 ring-indigo-100"><LoaderCircle className="size-4 animate-spin" />Confirming with Stripe...</div>}
      {statusQuery.isLoading ? <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">Loading billing details...</div> : statusQuery.isError ? <div className="rounded-xl bg-white p-6 text-sm text-red-600 shadow-sm ring-1 ring-slate-200">Unable to load billing details. Please refresh and try again.</div> : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-sm text-slate-500">Current plan</p><h2 className="mt-1 text-2xl font-bold capitalize">{status?.plan}</h2><p className="mt-2 text-sm text-slate-500">Status: <span className="font-medium capitalize text-slate-700">{label(status?.subscription_status)}</span></p></div>
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize ${status?.subscription_status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}><Check className="size-3.5" />{label(status?.subscription_status)}</span>
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4 text-sm"><span className="text-slate-500">Renews on</span><span className="ml-2 font-semibold">{formatDate(status?.current_period_end ?? null)}</span></div>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="font-bold">Change plan</h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {(["pro", "business"] as const).map((plan) => <button key={plan} disabled={confirming || busyPlan !== null || currentIndex === planOrder.indexOf(plan)} onClick={() => { setBusyPlan(plan); if (status?.subscribed && status.plan !== "free") { changePlan.mutate(plan); } else { checkout.mutate(plan); } }} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold capitalize hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"><span>{plan}</span>{busyPlan === plan ? <LoaderCircle className="size-4 animate-spin" /> : currentIndex === planOrder.indexOf(plan) ? <span className="text-xs font-normal text-slate-400">Current</span> : <span className="text-xs font-normal text-indigo-700">{planOrder.indexOf(plan) > currentIndex ? "Upgrade" : "Downgrade"}</span>}</button>)}
              </div>
              {status?.subscribed && <button disabled={cancelBusy} onClick={() => { if (confirm("Cancel your subscription at the end of the current billing period?")) { setCancelBusy(true); cancel.mutate(); } }} className="mt-4 w-full rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">{cancelBusy ? "Cancelling..." : "Cancel subscription"}</button>}
            </div>
          </div>
          <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="font-bold">Invoices</h2><button onClick={() => void invoicesQuery.refetch()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh invoices"><RefreshCw className="size-4" /></button></div>
            {invoicesQuery.isLoading ? <p className="p-5 text-sm text-slate-500">Loading invoices...</p> : !invoicesQuery.data?.invoices.length ? <p className="p-5 text-sm text-slate-500">No invoices yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3 font-semibold">Date</th><th className="px-5 py-3 font-semibold">Amount</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Invoice</th></tr></thead><tbody>{invoicesQuery.data.invoices.map((invoice) => <tr key={invoice.id} className="border-t border-slate-100"><td className="px-5 py-3">{formatDate(invoice.created_at)}</td><td className="px-5 py-3">{((invoice.amount_paid ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency: invoice.currency?.toUpperCase() ?? "USD" })}</td><td className="px-5 py-3 capitalize">{label(invoice.status)}</td><td className="px-5 py-3">{invoice.hosted_invoice_url ? <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 hover:underline">View invoice</a> : "—"}</td></tr>)}</tbody></table></div>}
          </div>
        </>
      )}
    </section>
  );
}
