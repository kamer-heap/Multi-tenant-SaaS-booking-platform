import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

const slug = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(30, "At most 30 characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only");

const fullName = z.string().trim().min(2, "Enter your full name");

export const loginSchema = z.object({
  orgSlug: slug,
  email,
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    orgSlug: slug,
    fullName,
    email,
    password,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const onboardingSchema = z
  .object({
    orgName: z.string().trim().min(2, "Enter your organization name"),
    orgSlug: slug,
    fullName,
    email,
    password,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotSchema = z.object({ orgSlug: slug, email });

export const resetSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function getErrors(schema: z.ZodType, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}