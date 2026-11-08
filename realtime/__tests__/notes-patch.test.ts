import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveBookingNotes } from "../../src/lib/booking-notes";
import { privilegedPool, pool } from "../../src/lib/db";
import { ApiError } from "../../src/lib/api-error";

describe("booking notes optimistic concurrency", () => {
  let tenantId: string;
  let userId: string;
  let bookingId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    tenantId = (await privilegedPool.query<{ id: string }>(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
      [`Notes test ${suffix}`, `notes-test-${suffix}`],
    )).rows[0].id;
    const role = (await privilegedPool.query<{ id: number }>("SELECT id FROM roles WHERE name = 'member'")).rows[0];
    userId = (await privilegedPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role_id)
       VALUES ($1, $2, 'test', 'Notes Tester', $3) RETURNING id`,
      [tenantId, `${suffix}@example.test`, role.id],
    )).rows[0].id;
    bookingId = (await privilegedPool.query<{ id: string }>(
      `INSERT INTO bookings
        (tenant_id, created_by, title, client_name, client_email, starts_at, ends_at, notes)
       VALUES ($1, $2, 'Notes booking', 'Client', 'client@example.test', now() + interval '2 days',
               now() + interval '2 days 1 hour', '') RETURNING id`,
      [tenantId, userId],
    )).rows[0].id;
  });

  afterAll(async () => {
    await privilegedPool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  });

  it("allows one save and rejects the second save using the stale version", async () => {
    const save = async (notes: string) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
        const result = await saveBookingNotes(client, bookingId, userId, notes, 1);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };

    const results = await Promise.allSettled([save("first"), save("second")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT", status: 409 });

    const current = await privilegedPool.query<{ notes: string; notes_version: number }>(
      "SELECT notes, notes_version FROM bookings WHERE id = $1",
      [bookingId],
    );
    expect(current.rows[0].notes_version).toBe(2);
    expect(["first", "second"]).toContain(current.rows[0].notes);
  });
});
