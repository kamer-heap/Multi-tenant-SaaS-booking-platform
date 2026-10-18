"use client";

import Link from "next/link";
import { Menu, X, CalendarDays, LayoutDashboard, Settings, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <Link href="/dashboard/bookings" className="flex items-center gap-2 font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">P</span>
          Parallax
        </Link>
        <button onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 hover:bg-slate-100">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <button className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white p-5 transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center justify-between">
          <Link href="/dashboard/bookings" className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">P</span>
            Parallax
          </Link>
          <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 md:hidden" aria-label="Close navigation"><X className="size-5" /></button>
        </div>
        <nav className="space-y-1 text-sm font-medium">
          <Link href="/dashboard/bookings" className="flex items-center gap-3 rounded-lg bg-indigo-50 px-3 py-2.5 text-indigo-700"><CalendarDays className="size-4" />Bookings</Link>
          <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-400"><LayoutDashboard className="size-4" />Overview</span>
          <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-400"><Settings className="size-4" />Settings</span>
        </nav>
        <div className="absolute bottom-5 left-5 right-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs text-slate-500">Workspace admin</p>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            <LogOut className="size-4" />Log out
          </button>
        </div>
      </aside>
      <main className="md:pl-64">{children}</main>
    </div>
  );
}
