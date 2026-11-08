import { z } from "zod";

const ianaTimezone = z.string().refine(
  (timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  },
  { message: "timezone must be a valid IANA timezone name." },
);

export const tenantSettingsSchema = z.object({
  displayName: z.string().min(1).max(100),
  timezone: ianaTimezone,
  defaultDurationMinutes: z.number().int().min(5).max(480),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "brandColor must be a hex color."),
});

export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;
