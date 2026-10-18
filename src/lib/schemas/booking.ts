import { z } from "zod";

const dateTime = z.string().datetime({ offset: true });

const bookingFields = {
  title: z.string().trim().min(1).max(200),
  clientName: z.string().trim().min(1).max(200),
  clientEmail: z.string().trim().email().max(320),
  startsAt: dateTime,
  endsAt: dateTime,
  notes: z.string().max(5000).optional(),
};

export const createBooking = z
  .object(bookingFields)
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const updateBooking = z
  .object(bookingFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .refine(
    (value) =>
      value.startsAt === undefined ||
      value.endsAt === undefined ||
      new Date(value.endsAt) > new Date(value.startsAt),
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );

export type CreateBooking = z.infer<typeof createBooking>;
export type UpdateBooking = z.infer<typeof updateBooking>;
