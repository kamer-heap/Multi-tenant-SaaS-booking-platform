"use client";

import Link from "next/link";
import { AuthCard, TextField, SubmitButton, Notice } from "@/components/auth";
import { useAuthForm } from "@/lib/useAuthForm";
import { resetSchema } from "@/lib/validation";

export default function ResetPasswordPage() {
  const form = useAuthForm(resetSchema, { password: "", confirmPassword: "" });

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Use at least 8 characters, with an uppercase letter and a number"
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
          form.setMessage("Validation passed. Password updates will work once the server is connected.");
        })}
      >
        <TextField label="New password" type="password" autoComplete="new-password" {...form.field("password")} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" {...form.field("confirmPassword")} />
        <SubmitButton loading={form.loading}>Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}