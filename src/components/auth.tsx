import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            B
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
        {footer && (
          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        )}
      </div>
    </main>
  );
}

export function TextField({
  label,
  name,
  type = "text",
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 ${
          error
            ? "border-red-400 focus:ring-red-200"
            : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
      {children}
    </div>
  );
}