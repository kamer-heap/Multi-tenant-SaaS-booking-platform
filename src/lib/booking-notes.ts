import type { PoolClient } from "pg";
import { ApiError } from "./api-error";

export async function saveBookingNotes(
  client: PoolClient,
  bookingId: string,
  userId: string,
  notes: string,
  baseVersion: number,
) {
  const updated = await client.query<{ notes: string; notes_version: number }>(
    `UPDATE bookings
        SET notes = $2, notes_version = notes_version + 1,
            notes_updated_by = $3, notes_updated_at = now()
      WHERE id = $1 AND notes_version = $4
      RETURNING notes, notes_version`,
    [bookingId, notes, userId, baseVersion],
  );
  if (updated.rows[0]) {
    return { notes: updated.rows[0].notes, version: updated.rows[0].notes_version };
  }

  const current = await client.query<{ notes: string; notes_version: number }>(
    "SELECT notes, notes_version FROM bookings WHERE id = $1",
    [bookingId],
  );
  if (!current.rows[0]) throw new ApiError("NOT_FOUND", "Booking not found.", 404);
  throw new ApiError("CONFLICT", "The booking notes were updated by someone else.", 409, {
    notes: current.rows[0].notes,
    version: current.rows[0].notes_version,
  });
}
