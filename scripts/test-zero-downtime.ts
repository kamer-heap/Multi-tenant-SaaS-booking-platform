import { spawn } from "node:child_process";
import path from "node:path";
import { privilegedPool } from "../src/lib/db";
import { signSession } from "../src/lib/session-core";

const baseUrl = process.env.ZERO_DOWNTIME_BASE_URL ?? "http://localhost:3000";
const intervalMs = 100;
const requestTimeoutMs = 1_000;

type Stats = { requests: number; errors: number; maxLatency: number };

async function request(url: string, cookie: string, stats: Stats) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Cookie: cookie } });
    if (!response.ok) stats.errors++;
    await response.arrayBuffer();
  } catch {
    stats.errors++;
  } finally {
    clearTimeout(timeout);
    stats.requests++;
    stats.maxLatency = Math.max(stats.maxLatency, performance.now() - started);
  }
}

async function main() {
  const user = (await privilegedPool.query<{ id: string; tenant_id: string; role: string }>(
    "SELECT users.id, users.tenant_id, role.name AS role FROM users JOIN roles role ON role.id = users.role_id ORDER BY users.created_at LIMIT 1",
  )).rows[0];
  if (!user) throw new Error("Run db:seed before the zero-downtime test.");
  const token = await signSession({ userId: user.id, tenantId: user.tenant_id, role: user.role });
  const cookie = `session=${token}`;
  const stats: Stats = { requests: 0, errors: 0, maxLatency: 0 };
  const migration = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/migrate-zero.ts"], {
    env: { ...process.env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const migrationClosed = new Promise<number | null>((resolve) => {
    migration.once("close", resolve);
  });
  let running = true;
  let migrationCode: number | null = null;
  migration.once("exit", (code) => {
    migrationCode = code;
    running = false;
  });

  do {
    await Promise.all([
      request(`${baseUrl}/api/health`, cookie, stats),
      request(`${baseUrl}/api/bookings?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString())}`, cookie, stats),
    ]);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (running);

  migrationCode = await migrationClosed;
  await privilegedPool.end();
  console.log(`requests: ${stats.requests}`);
  console.log(`errors: ${stats.errors}`);
  console.log(`max latency: ${stats.maxLatency.toFixed(2)}ms`);
  if (migrationCode !== 0 || stats.errors || stats.maxLatency > requestTimeoutMs) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await privilegedPool.end().catch(() => undefined);
  process.exit(1);
});
