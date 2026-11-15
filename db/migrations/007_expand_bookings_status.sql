ALTER TABLE bookings
  ADD COLUMN status_v2 text DEFAULT 'confirmed';

CREATE INDEX CONCURRENTLY idx_bookings_tenant_status_v2
  ON bookings (tenant_id, status_v2);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_v2_valid
  CHECK (status_v2 IN ('pending', 'confirmed', 'cancelled'))
  NOT VALID;
