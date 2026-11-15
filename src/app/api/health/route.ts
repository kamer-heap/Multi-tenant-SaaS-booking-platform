import { NextResponse } from "next/server";

const TIMEOUT_MS = 1_000;

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Health check timed out")), TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  let db = "down";
  let redis = "down";

  try {
    const { pool } = await import("@/lib/db");
    await withTimeout(pool.query("SELECT 1"));
    db = "ok";
  } catch {
    db = "down";
  }

  try {
    const { getRedis } = await import("@/lib/redis");
    const client = getRedis();
    if (client) {
      await withTimeout(client.ping());
      redis = "ok";
    }
  } catch {
    redis = "down";
  }

  const status = db === "ok" ? (redis === "ok" ? "ok" : "degraded") : "down";
  return NextResponse.json(
    { status, db, redis, uptime: process.uptime() },
    { status: db === "ok" ? 200 : 503 },
  );
}
