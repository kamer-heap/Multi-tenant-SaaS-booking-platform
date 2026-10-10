import { Client } from "pg";

let failed = false;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) failed = true;
}

// Runs fn inside a transaction with the tenant set, then always rolls back
async function asTenant<T>(app: Client, tenantId: string | null, fn: () => Promise<T>) {
  await app.query("BEGIN");
  try {
    if (tenantId) {
      await app.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    }
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

async function main() {
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  const app = new Client({ connectionString: process.env.APP_DATABASE_URL });
  await admin.connect();
  await app.connect();

  const { rows: tenants } = await admin.query("SELECT id, slug FROM tenants ORDER BY slug");
  const [a, b] = tenants;

  const who = await app.query(
    "SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su"
  );
  check("app connects as non-superuser app_user", who.rows[0].u === "app_user" && !who.rows[0].su);

  const none = await asTenant(app, null, () =>
    app.query("SELECT count(*)::int AS n FROM bookings")
  );
  check("no tenant set -> 0 bookings visible", none.rows[0].n === 0);

  for (const t of tenants) {
    const r = await asTenant(app, t.id, () =>
      app.query(
        "SELECT count(*)::int AS n, count(DISTINCT tenant_id)::int AS d, min(tenant_id::text) AS tid FROM bookings"
      )
    );
    const row = r.rows[0];
    check(`${t.slug}: sees only its own 3 bookings`, row.n === 3 && row.d === 1 && row.tid === t.id);
  }

  const del = await asTenant(app, a.id, () =>
    app.query("DELETE FROM bookings WHERE tenant_id = $1", [b.id])
  );
  check("tenant A cannot delete tenant B's bookings", del.rowCount === 0);

  let blocked = false;
  try {
    await asTenant(app, a.id, () =>
      app.query(
        `INSERT INTO bookings (tenant_id, title, client_name, client_email, starts_at, ends_at)
         VALUES ($1, 'x', 'x', 'x@x.com', now(), now() + interval '1 hour')`,
        [b.id]
      )
    );
  } catch {
    blocked = true;
  }
  check("tenant A cannot insert a booking into tenant B", blocked);

  await admin.end();
  await app.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
