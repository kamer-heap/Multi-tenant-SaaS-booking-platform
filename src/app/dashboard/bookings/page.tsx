"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, CalendarDays, ChevronRight, List, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { deleteBooking, listBookings, type Booking } from "@/lib/api";
import { BookingForm } from "@/components/booking-form";

import { enUS } from "date-fns/locale/en-US";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function BookingsPage() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selected, setSelected] = useState<Booking | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const bookingsQuery = useQuery({ queryKey: ["bookings"], queryFn: listBookings });
  const remove = useMutation({
    mutationFn: deleteBooking,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["bookings"] }); setSelected(undefined); },
  });
  const bookings = useMemo(() => (bookingsQuery.data?.bookings ?? []).filter((booking) =>
    `${booking.title} ${booking.clientName} ${booking.clientEmail}`.toLowerCase().includes(query.toLowerCase())), [bookingsQuery.data, query]);
  const save = () => { void queryClient.invalidateQueries({ queryKey: ["bookings"] }); setFormOpen(false); };
  return (
    <section className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Bookings</h1><p className="mt-1 text-sm text-slate-500">Manage upcoming appointments and availability.</p></div>
        <button onClick={() => { setSelected(undefined); setFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"><Plus className="size-4" />Create booking</button>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block max-w-sm flex-1"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bookings..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" /></label>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          <button onClick={() => setView("list")} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 ${view === "list" ? "bg-slate-100 font-semibold" : "text-slate-500"}`}><List className="size-4" />List</button>
          <button onClick={() => setView("calendar")} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 ${view === "calendar" ? "bg-slate-100 font-semibold" : "text-slate-500"}`}><Calendar className="size-4" />Calendar</button>
        </div>
      </div>
      {bookingsQuery.isLoading ? <BookingSkeleton /> : bookingsQuery.isError ? <EmptyState title="Unable to load bookings" text="Please refresh and try again." /> : !bookings.length ? <EmptyState title="No bookings yet" text="Create your first booking to get started." action={() => setFormOpen(true)} /> : view === "calendar" ? <CalendarView bookings={bookings} onSelect={setSelected} /> : <BookingList bookings={bookings} onSelect={setSelected} />}
      {selected && <Drawer title="Booking details" onClose={() => setSelected(undefined)}><BookingDetail booking={selected} onEdit={() => setFormOpen(true)} onDelete={() => { if (confirm("Delete this booking?")) remove.mutate(selected.id); }} /></Drawer>}
      {formOpen && <Drawer title={selected ? "Edit booking" : "Create booking"} onClose={() => { setFormOpen(false); setSelected(undefined); }}><BookingForm booking={selected} onSaved={() => { save(); setSelected(undefined); }} onCancel={() => { setFormOpen(false); setSelected(undefined); }} /></Drawer>}
    </section>
  );
}

function BookingList({ bookings, onSelect }: { bookings: Booking[]; onSelect: (booking: Booking) => void }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{bookings.map((booking) => <button key={booking.id} onClick={() => onSelect(booking)} className="flex w-full items-center gap-4 border-b border-slate-100 p-4 text-left last:border-0 hover:bg-slate-50"><div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><span className="text-xs font-semibold uppercase">{new Date(booking.startsAt).toLocaleDateString(undefined, { month: "short" })}</span><span className="text-lg font-bold">{new Date(booking.startsAt).getDate()}</span></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{booking.title}</p><p className="truncate text-sm text-slate-500">{booking.clientName} · {new Date(booking.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div><span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:block">{booking.status}</span><ChevronRight className="size-4 text-slate-400" /></button>)}</div>;
}

function CalendarView({ bookings, onSelect }: { bookings: Booking[]; onSelect: (booking: Booking) => void }) {
  return <div className="h-[650px] rounded-xl border border-slate-200 bg-white p-2 shadow-sm"><BigCalendar localizer={localizer} events={bookings.map((booking) => ({ ...booking, title: booking.title, start: new Date(booking.startsAt), end: new Date(booking.endsAt) }))} startAccessor="start" endAccessor="end" onSelectEvent={(event) => onSelect(event as unknown as Booking)} views={["month", "week", "day"]} defaultView="month" /></div>;
}

function BookingDetail({ booking, onEdit, onDelete }: { booking: Booking; onEdit: () => void; onDelete: () => void }) {
  return <div className="space-y-6"><div><h2 className="text-xl font-bold">{booking.title}</h2><p className="mt-1 text-sm text-slate-500">{booking.clientName} · {booking.clientEmail}</p></div><dl className="space-y-4 text-sm"><div><dt className="text-slate-500">When</dt><dd className="font-medium">{new Date(booking.startsAt).toLocaleString()} – {new Date(booking.endsAt).toLocaleTimeString()}</dd></div>{booking.notes && <div><dt className="text-slate-500">Notes</dt><dd className="whitespace-pre-wrap font-medium">{booking.notes}</dd></div>}</dl><div className="flex gap-3 border-t border-slate-100 pt-5"><button onClick={onEdit} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Edit</button><button onClick={onDelete} className="rounded-lg border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50" aria-label="Delete booking"><Trash2 className="size-4" /></button></div></div>;
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex justify-end"><button onClick={onClose} className="absolute inset-0 bg-slate-950/30" aria-label="Close dialog" /><div className="relative h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="size-5" /></button></div>{children}</div></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><CalendarDays className="mx-auto size-10 text-slate-300" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p>{action && <button onClick={action} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Create booking</button>}</div>;
}

function BookingSkeleton() {
  return <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="flex animate-pulse gap-4 border-b border-slate-100 py-3 last:border-0"><div className="size-11 rounded-lg bg-slate-200" /><div className="flex-1 space-y-2"><div className="h-4 w-1/3 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-100" /></div></div>)}</div>;
}
