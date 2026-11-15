import { privilegedPool } from "../src/lib/db";
import type { Pool } from "pg";

const BATCH_SIZE = 5_000;
const PAUSE_MS = 50;

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

export async function runBackfill(pool: Pool = privilegedPool): Promise<number> {
  let total = 0;
  while (true) {
    const result = await pool.query<{ count: number }>(
      `WITH batch AS (
         SELECT id
           FROM bookings
          WHERE status_v2 IS NULL
          ORDER BY id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE bookings AS bookings
          SET status_v2 = bookings.status
         FROM batch
        WHERE bookings.id = batch.id
       RETURNING bookings.id`,
      [BATCH_SIZE],
    );
    total += result.rowCount ?? 0;
    if (!result.rowCount) break;
    console.log(`backfilled ${total} bookings`);
    await pause();
  }
  console.log(`backfill complete: ${total} bookings`);
  return total;
}

if (process.argv[1]?.endsWith("backfill.ts")) {
  runBackfill().then(() => privilegedPool.end()).catch(async (error) => {
    console.error(error);
    await privilegedPool.end().catch(() => undefined);
    process.exit(1);
  });
}
