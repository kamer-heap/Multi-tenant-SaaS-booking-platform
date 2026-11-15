import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-md text-center">
        <SearchX className="mx-auto size-12 text-indigo-600" />
        <p className="mt-6 text-sm font-semibold text-indigo-600">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-3 text-slate-500">The page you are looking for does not exist.</p>
        <Link href="/dashboard/bookings" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
