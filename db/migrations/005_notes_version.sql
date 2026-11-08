ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS notes_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes_updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz;
