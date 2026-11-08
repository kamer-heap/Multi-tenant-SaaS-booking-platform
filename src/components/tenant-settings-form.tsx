"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  tenantSettingsSchema,
  type TenantSettingsInput,
} from "@/lib/schemas/tenant-settings";
import type { CacheSource, CacheStatus, TenantSettings } from "@/lib/tenant-settings";

type SettingsResponse = {
  settings: TenantSettings;
  source: CacheSource;
};

type SaveResponse = {
  settings: TenantSettings;
  cacheStatus: CacheStatus;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const defaultSettings: TenantSettingsInput = {
  displayName: "",
  timezone: "UTC",
  defaultDurationMinutes: 60,
  brandColor: "#2563eb",
};

const timezoneOptions = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function toFormValues(settings: TenantSettings): TenantSettingsInput {
  return {
    displayName: settings.displayName,
    timezone: settings.timezone,
    defaultDurationMinutes: settings.defaultDurationMinutes,
    brandColor: settings.brandColor,
  };
}

async function requestWithTimeout<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Something went wrong.");
    }
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function TenantSettingsForm() {
  const [lastKnownValues, setLastKnownValues] = useState<TenantSettingsInput>(defaultSettings);
  const [source, setSource] = useState<CacheSource>();
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loadWarning, setLoadWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const form = useForm<TenantSettingsInput>({
    resolver: zodResolver(tenantSettingsSchema),
    defaultValues: defaultSettings,
  });
  const brandColor = useWatch({ control: form.control, name: "brandColor" });
  const lastKnownValuesRef = useRef(lastKnownValues);
  const mounted = useRef(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestWithTimeout<SettingsResponse>("/api/settings");
      if (!mounted.current) return;
      const values = toFormValues(result.settings);
      setLastKnownValues(values);
      lastKnownValuesRef.current = values;
      form.reset(values);
      setSource(result.source);
      setLoadWarning(false);
    } catch {
      if (mounted.current) {
        form.reset(lastKnownValuesRef.current);
        setLoadWarning(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadSettings(), 0);
    return () => {
      window.clearTimeout(task);
      mounted.current = false;
    };
  }, [loadSettings]);

  const submit = async (values: TenantSettingsInput) => {
    setSaveStatus("saving");
    setCacheStatus(undefined);
    try {
      const result = await requestWithTimeout<SaveResponse>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      const savedValues = toFormValues(result.settings);
      setLastKnownValues(savedValues);
      lastKnownValuesRef.current = savedValues;
      form.reset(savedValues);
      setCacheStatus(result.cacheStatus);
      setSaveStatus("saved");
      toast.success("Settings saved.");
    } catch (error) {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : "Unable to save settings.");
    }
  };

  const fieldError = (name: keyof TenantSettingsInput) =>
    form.formState.errors[name]?.message;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      {loadWarning && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          We could not load the latest settings. You can edit the last known values and try again.
        </div>
      )}
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">Tenant settings</h2>
          <p className="mt-1 text-sm text-slate-500">These settings apply to your workspace.</p>
        </div>
        {source && <CacheBadge source={source} />}
      </div>
      {/* react-hook-form's submit handler manages its internal refs. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
        <Field label="Display name" error={fieldError("displayName")}>
          <input {...form.register("displayName")} className={inputClass(fieldError("displayName"))} />
        </Field>
        <Field label="Timezone" error={fieldError("timezone")}>
          <input list="timezone-options" {...form.register("timezone")} className={inputClass(fieldError("timezone"))} />
          <datalist id="timezone-options">
            {timezoneOptions.map((timezone) => <option key={timezone} value={timezone} />)}
          </datalist>
        </Field>
        <Field label="Default duration (minutes)" error={fieldError("defaultDurationMinutes")}>
          <input
            type="number"
            min={5}
            max={480}
            step={1}
            {...form.register("defaultDurationMinutes", { valueAsNumber: true })}
            className={inputClass(fieldError("defaultDurationMinutes"))}
          />
        </Field>
        <Field label="Brand color" error={fieldError("brandColor")}>
          <div className="flex gap-3">
            <input type="color" value={brandColor} onChange={(event) => form.setValue("brandColor", event.target.value, { shouldValidate: true })} className="h-10 w-14 rounded-lg border border-slate-300 bg-white p-1" aria-label="Choose brand color" />
            <input {...form.register("brandColor")} className={inputClass(fieldError("brandColor"))} />
          </div>
        </Field>
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={saveStatus === "error" ? "font-medium text-red-600" : "text-slate-500"}>
              Save status: {saveStatus}
            </span>
            {saveStatus === "error" && (
              <button type="button" onClick={() => void form.handleSubmit(submit)()} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700">
                <RefreshCw className="size-3.5" />Retry
              </button>
            )}
            {saveStatus === "saved" && (
              <span className="text-slate-500">
                {cacheStatus === "invalidated" ? "Cache invalidated" : "Cache unavailable"}
              </span>
            )}
          </div>
          <button type="submit" disabled={loading || saveStatus === "saving"} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saveStatus === "saving" ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CacheBadge({ source }: { source: CacheSource }) {
  const label = source === "cache"
    ? "Cache: hit"
    : source === "database"
      ? "Cache: miss"
      : "Cache: offline, using database";
  return <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{label}</span>;
}

function inputClass(error?: string) {
  return `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${error ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}
    </label>
  );
}
