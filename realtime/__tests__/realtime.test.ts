import { randomUUID } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRealtimeServer } from "../server";
import { privilegedPool } from "../../src/lib/db";
import { signSession } from "../../src/lib/session-core";

type Fixture = {
  tenantA: string;
  tenantB: string;
  bookingA: string;
  usersA: [string, string];
  userB: string;
};

function waitFor<T>(socket: Socket, event: string, predicate: (value: T) => boolean, timeout = 5_000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const onEvent = (value: T) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(value);
    };
    socket.on(event, onEvent);
  });
}

async function createClient(userId: string, tenantId: string, port: number) {
  const token = await signSession({ userId, tenantId, role: "member" });
  const socket = connect(`http://localhost:${port}`, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Cookie: `session=${token}` },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

async function join(socket: Socket, bookingId: string) {
  return new Promise<Record<string, unknown>>((resolve) => {
    socket.emit("join_booking", { bookingId }, (ack: Record<string, unknown>) => resolve(ack));
  });
}

describe("realtime booking collaboration", () => {
  let fixture: Fixture | undefined;
  let port: number;
  let server: ReturnType<typeof createRealtimeServer> | undefined;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const suffix = randomUUID();
    const tenantAResult = await privilegedPool.query<{ id: string }>(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
      [`Realtime A ${suffix}`, `realtime-a-${suffix}`],
    );
    const tenantBResult = await privilegedPool.query<{ id: string }>(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
      [`Realtime B ${suffix}`, `realtime-b-${suffix}`],
    );
    const tenantA = tenantAResult.rows[0].id;
    const tenantB = tenantBResult.rows[0].id;
    const roles = await privilegedPool.query<{ id: number; name: string }>("SELECT id, name FROM roles");
    const memberRole = roles.rows.find((role) => role.name === "member")?.id;
    if (!memberRole) throw new Error("member role is missing");

    const userA1 = (await privilegedPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role_id)
       VALUES ($1, $2, 'test', 'Ayesha One', $3) RETURNING id`,
      [tenantA, `${suffix}-a1@example.test`, memberRole],
    )).rows[0].id;
    const userA2 = (await privilegedPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role_id)
       VALUES ($1, $2, 'test', 'Bilal Two', $3) RETURNING id`,
      [tenantA, `${suffix}-a2@example.test`, memberRole],
    )).rows[0].id;
    const userB = (await privilegedPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role_id)
       VALUES ($1, $2, 'test', 'Tenant B', $3) RETURNING id`,
      [tenantB, `${suffix}-b@example.test`, memberRole],
    )).rows[0].id;
    const bookingA = (await privilegedPool.query<{ id: string }>(
      `INSERT INTO bookings
        (tenant_id, created_by, title, client_name, client_email, starts_at, ends_at, notes)
       VALUES ($1, $2, 'Realtime booking', 'Client', 'client@example.test', now() + interval '1 day',
               now() + interval '1 day 1 hour', '') RETURNING id`,
      [tenantA, userA1],
    )).rows[0].id;

    fixture = { tenantA, tenantB, bookingA, usersA: [userA1, userA2], userB };
    server = createRealtimeServer({ appUrl: "http://localhost:3000" });
    port = await server.start(0);
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    if (server) await server.close();
    if (fixture) {
      await privilegedPool.query("DELETE FROM tenants WHERE id IN ($1, $2)", [
        fixture.tenantA,
        fixture.tenantB,
      ]);
    }
  });

  it("isolates rooms and broadcasts presence, typing, saves, and disconnects", async () => {
    if (!fixture || !server) throw new Error("Realtime test fixture was not created");
    const [a1, a2, b] = await Promise.all([
      createClient(fixture.usersA[0], fixture.tenantA, port),
      createClient(fixture.usersA[1], fixture.tenantA, port),
      createClient(fixture.userB, fixture.tenantB, port),
    ]);
    clients.push(a1, a2, b);

    const a1Presence = waitFor<Array<{ userId: string }>>(a1, "presence", (users) => users.length === 2);
    const a2Presence = waitFor<Array<{ userId: string }>>(a2, "presence", (users) => users.length === 2);
    expect((await join(a1, fixture.bookingA)).joined).toBe(true);
    expect((await join(a2, fixture.bookingA)).joined).toBe(true);
    await expect(a1Presence).resolves.toHaveLength(2);
    await expect(a2Presence).resolves.toHaveLength(2);

    const bJoin = await join(b, fixture.bookingA);
    expect(bJoin.error).toBe("Booking not found.");

    const typing = waitFor<{ isTyping: boolean; userId: string; name: string }>(
      a2,
      "typing",
      (payload) => payload.isTyping === true,
    );
    let bReceivedTyping = false;
    b.once("typing", () => { bReceivedTyping = true; });
    a1.emit("typing", { isTyping: true });
    await expect(typing).resolves.toMatchObject({ isTyping: true, name: "Ayesha One" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bReceivedTyping).toBe(false);

    const saved = waitFor<{ version: number; notes: string; userId: string }>(
      a2,
      "notes_saved",
      (payload) => payload.version === 2,
    );
    a1.emit("notes_saved", { version: 2, notes: "Shared update" });
    await expect(saved).resolves.toMatchObject({ version: 2, notes: "Shared update" });

    const afterDisconnect = waitFor<Array<{ userId: string }>>(a1, "presence", (users) => users.length === 1);
    a2.disconnect();
    await expect(afterDisconnect).resolves.toHaveLength(1);
  });
});
