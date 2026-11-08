import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const redisControl = vi.hoisted(() => ({
  client: null as Redis | null,
}));

vi.mock("../redis", () => ({
  getRedis: () => redisControl.client,
}));

import { privilegedPool } from "../db";
import {
  getTenantSettings,
  saveTenantSettings,
  settingsKey,
  type TenantSettings,
} from "../tenant-settings";

describe("tenant settings cache", () => {
  let redis: Redis;
  let tenantA: string;
  let tenantB: string;

  const settingsA: TenantSettings = {
    displayName: "Tenant A",
    timezone: "UTC",
    defaultDurationMinutes: 45,
    brandColor: "#2563eb",
  };
  const settingsB: TenantSettings = {
    displayName: "Tenant B",
    timezone: "Asia/Karachi",
    defaultDurationMinutes: 90,
    brandColor: "#16a34a",
  };

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    await redis.ping();
    redisControl.client = redis;

    const suffix = randomUUID();
    tenantA = (await privilegedPool.query<{ id: string }>(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
      [`Settings A ${suffix}`, `settings-a-${suffix}`],
    )).rows[0].id;
    tenantB = (await privilegedPool.query<{ id: string }>(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
      [`Settings B ${suffix}`, `settings-b-${suffix}`],
    )).rows[0].id;
  });

  afterAll(async () => {
    if (tenantA && tenantB) {
      await redis.del(settingsKey(tenantA), settingsKey(tenantB));
      await privilegedPool.query("DELETE FROM tenants WHERE id IN ($1, $2)", [tenantA, tenantB]);
    }
    redisControl.client = null;
    await redis.quit();
    await privilegedPool.end();
  });

  it("loads the first read from the database and caches it", async () => {
    await redis.del(settingsKey(tenantA));
    await saveTenantSettings(tenantA, settingsA);
    await redis.del(settingsKey(tenantA));

    const result = await getTenantSettings(tenantA);

    expect(result).toEqual({ settings: settingsA, source: "database" });
    expect(await redis.get(settingsKey(tenantA))).toBe(JSON.stringify(settingsA));
  });

  it("loads the second read from the cache", async () => {
    const result = await getTenantSettings(tenantA);

    expect(result).toEqual({ settings: settingsA, source: "cache" });
  });

  it("invalidates the cache before returning new settings", async () => {
    await getTenantSettings(tenantA);
    expect(await redis.get(settingsKey(tenantA))).not.toBeNull();

    const updated = { ...settingsA, displayName: "Tenant A Updated" };
    const saved = await saveTenantSettings(tenantA, updated);

    expect(saved).toEqual({ settings: updated, cacheStatus: "invalidated" });
    expect(await redis.get(settingsKey(tenantA))).toBeNull();
    expect(await getTenantSettings(tenantA)).toEqual({
      settings: updated,
      source: "database",
    });
  });

  it("keeps tenant keys and values isolated", async () => {
    await saveTenantSettings(tenantA, settingsA);
    await saveTenantSettings(tenantB, settingsB);
    await Promise.all([getTenantSettings(tenantA), getTenantSettings(tenantB)]);

    expect(settingsKey(tenantA)).not.toBe(settingsKey(tenantB));
    expect(await redis.get(settingsKey(tenantA))).toBe(JSON.stringify(settingsA));
    expect(await redis.get(settingsKey(tenantB))).toBe(JSON.stringify(settingsB));
    expect(await getTenantSettings(tenantA)).toEqual({ settings: settingsA, source: "cache" });
    expect(await getTenantSettings(tenantB)).toEqual({ settings: settingsB, source: "cache" });
  });

  it("falls back to the database when Redis is down", async () => {
    const failingRedis = {
      get: vi.fn(async () => { throw new Error("Redis unavailable"); }),
      set: vi.fn(async () => { throw new Error("Redis unavailable"); }),
      del: vi.fn(async () => { throw new Error("Redis unavailable"); }),
    } as unknown as Redis;
    redisControl.client = failingRedis;

    const read = await getTenantSettings(tenantA);
    const saved = await saveTenantSettings(tenantA, settingsA);

    expect(read).toEqual({ settings: settingsA, source: "database-fallback" });
    expect(saved).toEqual({ settings: settingsA, cacheStatus: "unavailable" });
    redisControl.client = redis;
  });

  it("sets a positive TTL on cached settings", async () => {
    await saveTenantSettings(tenantB, settingsB);
    await getTenantSettings(tenantB);

    expect(await redis.ttl(settingsKey(tenantB))).toBeGreaterThan(0);
  });
});
