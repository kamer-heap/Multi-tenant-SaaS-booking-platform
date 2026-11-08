import { TenantSettingsForm } from "@/components/tenant-settings-form";

export default function SettingsPage() {
  return (
    <section className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-600">Workspace</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customize how your workspace appears and how bookings are created.
        </p>
      </div>
      <TenantSettingsForm />
    </section>
  );
}
