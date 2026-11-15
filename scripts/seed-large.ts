import { privilegedPool } from "../src/lib/db";

const TOTAL_BOOKINGS = 100_000;
const BATCH_SIZE = 5_000;
const HOUR_MS = 60 * 60 * 1_000;

async function main() {
  const tenants = (await privilegedPool.query<{ id: string }>(
    "SELECT id FROM tenants ORDER BY created_at LIMIT 3",
  )).rows;
  if (tenants.length < 3) throw new Error("At least three tenants are required; run db:seed first.");

  const users = await privilegedPool.query<{ tenant_id: string; id: string }>(
    "SELECT DISTINCT ON (tenant_id) tenant_id, id FROM users WHERE tenant_id = ANY($1::uuid[]) ORDER BY tenant_id, created_at",
    [tenants.map((tenant) => tenant.id)],
  );
  const userByTenant = new Map(users.rows.map((user) => [user.tenant_id, user.id]));
  if (userByTenant.size < tenants.length) throw new Error("Each seed tenant must have a user.");

  let inserted = 0;
  const startBase = Date.now() + 30 * 24 * HOUR_MS;
  while (inserted < TOTAL_BOOKINGS) {
    const count = Math.min(BATCH_SIZE, TOTAL_BOOKINGS - inserted);
    const tenantIds: string[] = [];
    const createdBy: string[] = [];
    const titles: string[] = [];
    const clientNames: string[] = [];
    const clientEmails: string[] = [];
    const starts: Date[] = [];
    const ends: Date[] = [];
    const notes: string[] = [];

    for (let offset = 0; offset < count; offset++) {
      const index = inserted + offset;
      const tenant = tenants[index % tenants.length];
      const start = new Date(startBase + Math.floor(index / tenants.length) * HOUR_MS);
      tenantIds.push(tenant.id);
      createdBy.push(userByTenant.get(tenant.id)!);
      titles.push(`Large dataset booking ${index + 1}`);
      clientNames.push(`Client ${index + 1}`);
      clientEmails.push(`client-${index + 1}@example.com`);
      starts.push(start);
      ends.push(new Date(start.getTime() + HOUR_MS));
      notes.push("");
    }

    await privilegedPool.query(
      `INSERT INTO bookings
        (tenant_id, created_by, title, client_name, client_email, starts_at, ends_at, notes)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[],
                            $5::text[], $6::timestamptz[], $7::timestamptz[], $8::text[])`,
      [tenantIds, createdBy, titles, clientNames, clientEmails, starts, ends, notes],
    );
    inserted += count;
    console.log(`seeded ${inserted}/${TOTAL_BOOKINGS} bookings`);
  }
  await privilegedPool.end();
}

main().catch(async (error) => {
  console.error(error);
  await privilegedPool.end().catch(() => undefined);
  process.exit(1);
});
