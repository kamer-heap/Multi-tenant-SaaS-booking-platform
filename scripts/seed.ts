import { Client } from "pg";
import bcrypt from "bcryptjs";

const tenants = [
  {
    name: "Glow Salon",
    slug: "glow-salon",
    bookings: [
      ["Haircut & Styling", "Sara Malik"],
      ["Bridal Makeup Trial", "Hina Raza"],
      ["Hair Colouring", "Ayesha Noor"],
    ],
  },
  {
    name: "Bright Dental Clinic",
    slug: "bright-dental",
    bookings: [
      ["Teeth Cleaning", "Ali Hassan"],
      ["Root Canal Consultation", "Usman Tariq"],
      ["Braces Check-up", "Maham Fatima"],
    ],
  },
  {
    name: "Peak Fitness Studio",
    slug: "peak-fitness",
    bookings: [
      ["Personal Training", "Bilal Ahmed"],
      ["Yoga Class", "Zainab Khan"],
      ["Nutrition Session", "Hamza Sheikh"],
    ],
  },
];

const people: [string, string][] = [
  ["owner", "Owner"],
  ["admin", "Admin"],
  ["member", "Staff"],
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const hash = await bcrypt.hash("Password123!", 10);

  await client.query("BEGIN");
  await client.query("TRUNCATE idempotency_keys, bookings, users, tenants CASCADE");
  const roles = (await client.query("SELECT id, name FROM roles")).rows;
  const roleId = (n: string) => roles.find((r) => r.name === n).id;

  for (const t of tenants) {
    const { rows: [tenant] } = await client.query(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
      [t.name, t.slug]
    );

    const userIds: string[] = [];
    for (const [role, label] of people) {
      const { rows: [u] } = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, full_name, role_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenant.id, `${role}@${t.slug}.test`, hash, `${t.name} ${label}`, roleId(role)]
      );
      userIds.push(u.id);
    }

    for (let i = 0; i < t.bookings.length; i++) {
      const [title, client_name] = t.bookings[i];
      const start = new Date(Date.now() + (i + 1) * 24 * 3600 * 1000);
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await client.query(
        `INSERT INTO bookings
         (tenant_id, created_by, title, client_name, client_email, starts_at, ends_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenant.id,
          userIds[1],
          title,
          client_name,
          `${client_name.toLowerCase().replace(" ", ".")}@example.com`,
          start,
          end,
          "Seeded test booking",
        ]
      );
    }
  }

  await client.query("COMMIT");
  await client.end();
  console.log("Seeded 3 tenants (login: owner@<slug>.test / Password123!)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});