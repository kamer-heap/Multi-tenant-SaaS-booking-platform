"use client";

import Link from "next/link";
import { AuthCard, TextField, SubmitButton, Notice } from "@/components/auth";
import { useAuthForm } from "@/lib/useAuthForm";
import { onboardingSchema } from "@/lib/validation";

export default function OnboardingPage() {
  const form = useAuthForm(onboardingSchema, {
    orgName: "",
    orgSlug: "",
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  return (
    <AuthCard
      title="Set up your organization"
      subtitle="Create a workspace and your owner account"
      footer={
        <>
          Already have a workspace?{" "}
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
        onSubmit={form.handleSubmit(async (v) => {
          form.setMessage(
            `Validation passed. Workspace "${v.orgSlug}" will be created once the server is connected.`
          );
        })}
      >
        <TextField label="Organization name" placeholder="Glow Salon" autoComplete="organization" {...form.field("orgName")} />
        <TextField label="Workspace URL" placeholder="glow-salon" {...form.field("orgSlug")} />
        <TextField label="Your full name" autoComplete="name" {...form.field("fullName")} />
        <TextField label="Work email" type="email" autoComplete="email" {...form.field("email")} />
        <TextField label="Password" type="password" autoComplete="new-password" {...form.field("password")} />
        <TextField label="Confirm password" type="password" autoComplete="new-password" {...form.field("confirmPassword")} />
        <SubmitButton loading={form.loading}>Create organization</SubmitButton>
      </form>
    </AuthCard>
  );
}