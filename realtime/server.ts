import { createServer } from "node:http";
import { parse as parseCookie } from "node:querystring";
import { pathToFileURL } from "node:url";
import { Server as SocketIOServer, type ServerOptions } from "socket.io";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../src/lib/db";
import { SESSION_COOKIE, verifySessionToken, type Session } from "../src/lib/session-core";

type PresenceUser = { userId: string; name: string; color: string };
type RealtimeOptions = {
  port?: number;
  appUrl?: string;
  socketOptions?: Partial<ServerOptions>;
};

const bookingIdSchema = z.string().uuid();
const typingSchema = z.object({ isTyping: z.boolean() });
const notesSavedSchema = z.object({
  version: z.number().int().min(1),
  notes: z.string().max(5000),
  userId: z.string().uuid().optional(),
});

function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const cookies = parseCookie(header.replace(/; */g, "&"));
  const value = cookies[name];
  return typeof value === "string" ? value : undefined;
}

function colorForUser(userId: string): string {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 50%)`;
}

function roomName(tenantId: string, bookingId: string): string {
  return `t:${tenantId}:b:${bookingId}`;
}

async function withTenant<T>(session: Session, callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [session.tenantId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function presence(io: SocketIOServer, room: string): Promise<PresenceUser[]> {
  const sockets = await io.in(room).fetchSockets();
  const users = new Map<string, PresenceUser>();
  for (const socket of sockets) {
    const user = socket.data.user as PresenceUser | undefined;
    if (user) users.set(user.userId, user);
  }
  return [...users.values()];
}

function emitPresence(io: SocketIOServer, room: string): void {
  void presence(io, room).then((users) => io.to(room).emit("presence", users));
}

export function createRealtimeServer(options: RealtimeOptions = {}) {
  const httpServer = createServer();
  const appUrl = options.appUrl ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const io = new SocketIOServer(httpServer, {
    cors: { origin: appUrl, credentials: true },
    ...options.socketOptions,
  });

  io.use(async (socket, next) => {
    const session = await verifySessionToken(getCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    if (!session) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    socket.data.session = session;
    next();
  });

  io.on("connection", (socket) => {
    const session = socket.data.session as Session;
    const joinedRooms = new Set<string>();

    socket.on("join_booking", async (input: unknown, acknowledge?: (response: unknown) => void) => {
      const parsed = bookingIdSchema.safeParse(
        typeof input === "object" && input !== null && "bookingId" in input
          ? (input as { bookingId: unknown }).bookingId
          : undefined,
      );
      if (!parsed.success) {
        acknowledge?.({ error: "Invalid booking id." });
        return;
      }

      const bookingId = parsed.data;
      try {
        const exists = await withTenant(session, async (client) => {
          const result = await client.query("SELECT 1 FROM bookings WHERE id = $1", [bookingId]);
          return Boolean(result.rows[0]);
        });
        if (!exists) {
          acknowledge?.({ error: "Booking not found." });
          return;
        }

        for (const room of joinedRooms) {
          socket.leave(room);
          joinedRooms.delete(room);
          emitPresence(io, room);
        }
        const room = roomName(session.tenantId, bookingId);
        const user = await withTenant(session, async (client) => {
          const result = await client.query<{ full_name: string }>(
            "SELECT full_name FROM users WHERE id = $1",
            [session.userId],
          );
          return result.rows[0];
        });
        if (!user) {
          acknowledge?.({ error: "User not found." });
          return;
        }

        socket.data.user = {
          userId: session.userId,
          name: user.full_name,
          color: colorForUser(session.userId),
        } satisfies PresenceUser;
        socket.join(room);
        joinedRooms.add(room);
        io.to(room).emit("presence", await presence(io, room));
        acknowledge?.({ joined: true, userId: session.userId, name: user.full_name, color: colorForUser(session.userId) });
      } catch (error) {
        console.error("[realtime] unable to join booking", error);
        acknowledge?.({ error: "Unable to join booking." });
      }
    });

    socket.on("typing", (input: unknown) => {
      const parsed = typingSchema.safeParse(input);
      if (!parsed.success) return;
      const user = socket.data.user as PresenceUser | undefined;
      if (!user) return;
      for (const room of joinedRooms) {
        socket.to(room).emit("typing", {
          isTyping: parsed.data.isTyping,
          userId: user.userId,
          name: user.name,
        });
      }
    });

    socket.on("notes_saved", (input: unknown) => {
      const parsed = notesSavedSchema.safeParse(input);
      if (!parsed.success) return;
      for (const room of joinedRooms) {
        socket.to(room).emit("notes_saved", {
          version: parsed.data.version,
          notes: parsed.data.notes,
          userId: session.userId,
        });
      }
    });

    socket.on("disconnecting", () => {
      for (const room of joinedRooms) {
        socket.leave(room);
        emitPresence(io, room);
      }
      joinedRooms.clear();
    });
  });

  return {
    io,
    httpServer,
    start: (port = options.port ?? 4000) =>
      new Promise<number>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, () => {
          httpServer.off("error", reject);
          const address = httpServer.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        io.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRealtimeServer();
  void server.start().then((port) => console.log(`Realtime server listening on port ${port}`));
}
