"use client";

import Link from "next/link";
import { AuthCard, TextField, SubmitButton, Notice } from "@/components/auth";
import { useAuthForm } from "@/lib/useAuthForm";
import { loginSchema } from "@/lib/validation";
import { apiRequest } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const form = useAuthForm(loginSchema, { orgSlug: "", email: "", password: "" });

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your organization"
      footer={
        <>
          New organization?{" "}
          <Link href="/onboarding" className="font-medium text-indigo-600 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {form.message && <Notice>{form.message}</Notice>}
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async () => {
          try {
            await apiRequest("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({
                organization: form.values.orgSlug,
                email: form.values.email,
                password: form.values.password,
              }),
            });
            router.push("/dashboard/bookings");
            router.refresh();
          } catch (error) {
            if (!(error instanceof Error)) {
              form.setMessage("Unable to sign in.");
            }
          }
        })}
      >
        <TextField label="Organization" placeholder="glow-salon" autoComplete="organization" {...form.field("orgSlug")} />
        <TextField label="Email" type="email" placeholder="owner@glow-salon.test" autoComplete="email" {...form.field("email")} />
        <TextField label="Password" type="password" autoComplete="current-password" {...form.field("password")} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-indigo-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton loading={form.loading}>Sign in</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Joining an existing organization?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">
          Register
        </Link>
      </p>
    </AuthCard>
  );
}