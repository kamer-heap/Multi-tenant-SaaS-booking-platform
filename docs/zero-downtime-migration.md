# Zero-downtime booking status migration

This migration expands `bookings` with `status_v2`, backfills it in small batches, and
only then contracts the column to `NOT NULL`. The old `status` column remains available
through the rollout so existing application versions can continue serving traffic.

## Steps

1. Start PostgreSQL, Redis, and the application:

   ```bash
   docker compose up --build
   ```

2. Seed the normal tenants and users:

   ```bash
   npm run db:seed
   ```

3. Optionally add a large test dataset. This inserts 100,000 rows in 5,000-row batches:

   ```bash
   npm run db:seed:large
   ```

4. Run the zero-downtime migration:

   ```bash
   npm run db:migrate:zero
   ```

   Migration 007 adds the nullable column, creates its tenant/status index with
   `CREATE INDEX CONCURRENTLY`, and adds a `NOT VALID` check constraint. The backfill
   updates at most 5,000 rows per transaction and pauses briefly between batches.
   Migration 008 validates the constraint and then sets `status_v2` to `NOT NULL`.

5. To exercise the migration while traffic is flowing, start the app and run:

   ```bash
   npm run test:zero-downtime
   ```

   The test starts the migration runner, calls `/api/health` and an authenticated
   bookings read every 100ms, and fails if a request errors or exceeds one second.
   It prints total requests, errors, and maximum latency.
