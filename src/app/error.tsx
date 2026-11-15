"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-md text-center">
        <CircleAlert className="mx-auto size-12 text-red-500" />
        <p className="mt-6 text-sm font-semibold text-red-600">500</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-slate-500">We could not load this page. Please try again.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            Try again
          </button>
          <Link href="/dashboard/bookings" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
