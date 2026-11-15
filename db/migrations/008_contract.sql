ALTER TABLE bookings
  VALIDATE CONSTRAINT bookings_status_v2_valid;

ALTER TABLE bookings
  ALTER COLUMN status_v2 SET NOT NULL;
