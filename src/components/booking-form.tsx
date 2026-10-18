"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller, type FieldErrors } from "react-hook-form";
import { createBooking, type CreateBooking } from "@/lib/schemas/booking";
import type { Booking } from "@/lib/api";
import { ApiClientError, createBooking as postBooking, updateBooking } from "@/lib/api";
import { useState } from "react";

function localValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function validationErrors(error: unknown, setError: (name: keyof CreateBooking, error: { message: string }) => void) {
  if (!(error instanceof ApiClientError) || error.code !== "VALIDATION_ERROR") return;
  for (const issue of error.details ?? []) {
    const path = issue.path?.[0];
    if (typeof path === "string" && path in createBooking.shape) {
      setError(path as keyof CreateBooking, { message: issue.message ?? "Invalid value" });
    }
  }
}

export function BookingForm({
  booking,
  onSaved,
  onCancel,
}: {
  booking?: Booking;
  onSaved: (booking: Booking) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm<CreateBooking>({
    resolver: zodResolver(createBooking),
    defaultValues: {
      title: booking?.title ?? "",
      clientName: booking?.clientName ?? "",
      clientEmail: booking?.clientEmail ?? "",
      startsAt: booking?.startsAt ?? "",
      endsAt: booking?.endsAt ?? "",
      notes: booking?.notes ?? "",
    },
  });
  const submit = async (values: CreateBooking) => {
    setSaving(true);
    try {
      const saved = booking
        ? await updateBooking(booking.id, values)
        : await postBooking(values, idempotencyKey);
      onSaved(saved);
    } catch (error) {
      validationErrors(error, (name, issue) => form.setError(name, issue));
    } finally {
      setSaving(false);
    }
  };
  const error = (name: keyof CreateBooking) => form.formState.errors[name]?.message;
  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
      <Field label="Title" error={error("title")} {...form.register("title")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client name" error={error("clientName")} {...form.register("clientName")} />
        <Field label="Client email" type="email" error={error("clientEmail")} {...form.register("clientEmail")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField label="Starts" name="startsAt" control={form.control} error={error("startsAt")} />
        <DateField label="Ends" name="endsAt" control={form.control} error={error("endsAt")} />
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Notes
        <textarea rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" {...form.register("notes")} />
      </label>
      {error("notes") && <p className="text-xs text-red-600">{error("notes")}</p>}
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "Saving..." : booking ? "Save changes" : "Create booking"}</button>
      </div>
    </form>
  );
}

function Field({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input {...props} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>;
}

function DateField({ label, name, control, error }: { label: string; name: "startsAt" | "endsAt"; control: ReturnType<typeof useForm<CreateBooking>>["control"]; error?: string }) {
  return <Controller name={name} control={control} render={({ field }) => <label className="block text-sm font-medium text-slate-700">{label}<input type="datetime-local" value={localValue(field.value)} onChange={(event) => field.onChange(event.target.value ? new Date(event.target.value).toISOString() : "")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />{error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}</label>} />;
}

export function FormErrorSummary({ errors }: { errors: FieldErrors<CreateBooking> }) {
  return Object.keys(errors).length ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Please correct the highlighted fields.</p> : null;
}
