"use client";

import Link from "next/link";
import { AuthCard, TextField, SubmitButton, Notice } from "@/components/auth";
import { useAuthForm } from "@/lib/useAuthForm";
import { registerSchema } from "@/lib/validation";

export default function RegisterPage() {
  const form = useAuthForm(registerSchema, {
    orgSlug: "",
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join an existing organization"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {form.message && <Notice>{form.message}</Notice>}
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async () => {
          form.setMessage("Validation passed. Server registration is connected in the next step.");
        })}
      >
        <TextField label="Organization" placeholder="glow-salon" {...form.field("orgSlug")} />
        <TextField label="Full name" autoComplete="name" {...form.field("fullName")} />
        <TextField label="Email" type="email" autoComplete="email" {...form.field("email")} />
        <TextField label="Password" type="password" autoComplete="new-password" {...form.field("password")} />
        <TextField label="Confirm password" type="password" autoComplete="new-password" {...form.field("confirmPassword")} />
        <SubmitButton loading={form.loading}>Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}