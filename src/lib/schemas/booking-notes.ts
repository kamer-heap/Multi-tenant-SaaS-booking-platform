import { z } from "zod";

export const updateBookingNotes = z.object({
  notes: z.string().max(5000),
  baseVersion: z.number().int().min(1),
});

export type UpdateBookingNotes = z.infer<typeof updateBookingNotes>;
