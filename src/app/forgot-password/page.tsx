"use client";

import Link from "next/link";
import { AuthCard, TextField, SubmitButton, Notice } from "@/components/auth";
import { useAuthForm } from "@/lib/useAuthForm";
import { forgotSchema } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const form = useAuthForm(forgotSchema, { orgSlug: "", email: "" });

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your organization and email and we'll send a reset link"
      footer={
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {form.message && <Notice>{form.message}</Notice>}
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async () => {
          form.setMessage("Validation passed. Reset emails will be sent once the server is connected.");
        })}
      >
        <TextField label="Organization" placeholder="glow-salon" {...form.field("orgSlug")} />
        <TextField label="Email" type="email" autoComplete="email" {...form.field("email")} />
        <SubmitButton loading={form.loading}>Send reset link</SubmitButton>
      </form>
    </AuthCard>
  );
}