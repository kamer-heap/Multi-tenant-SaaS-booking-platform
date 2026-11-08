import { inTransaction } from "./db";
import { getRedis } from "./redis";

export type TenantSettings = {
  displayName: string;
  timezone: string;
  defaultDurationMinutes: number;
  brandColor: string;
};

export type CacheSource = "cache" | "database" | "database-fallback";
export type CacheStatus = "invalidated" | "unavailable";

const TTL_SECONDS = 300;

export function settingsKey(tenantId: string): string {
  return `tenant:${tenantId}:settings`;
}

type Row = {
  display_name: string;
  timezone: string;
  default_duration_minutes: number;
  brand_color: string;
};

function fromRow(row: Row): TenantSettings {
  return {
    displayName: row.display_name,
    timezone: row.timezone,
    defaultDurationMinutes: row.default_duration_minutes,
    brandColor: row.brand_color,
  };
}

async function loadFromDatabase(tenantId: string): Promise<TenantSettings> {
  return inTransaction(tenantId, async (client) => {
    await client.query(
      "INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [tenantId],
    );
    const result = await client.query<Row>(
      `SELECT display_name, timezone, default_duration_minutes, brand_color
       FROM tenant_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    return fromRow(result.rows[0]);
  });
}

export async function getTenantSettings(
  tenantId: string,
): Promise<{ settings: TenantSettings; source: CacheSource }> {
  const redis = getRedis();
  let redisFailed = !redis;

  if (redis) {
    try {
      const cached = await redis.get(settingsKey(tenantId));
      if (cached) {
        return { settings: JSON.parse(cached) as TenantSettings, source: "cache" };
      }
    } catch {
      redisFailed = true;
    }
  }

  const settings = await loadFromDatabase(tenantId);

  if (redis && !redisFailed) {
    try {
      await redis.set(settingsKey(tenantId), JSON.stringify(settings), "EX", TTL_SECONDS);
    } catch {
      redisFailed = true;
    }
  }

  return { settings, source: redisFailed ? "database-fallback" : "database" };
}

export async function saveTenantSettings(
  tenantId: string,
  input: TenantSettings,
): Promise<{ settings: TenantSettings; cacheStatus: CacheStatus }> {
  const settings = await inTransaction(tenantId, async (client) => {
    const result = await client.query<Row>(
      `INSERT INTO tenant_settings
         (tenant_id, display_name, timezone, default_duration_minutes, brand_color, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tenant_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         timezone = EXCLUDED.timezone,
         default_duration_minutes = EXCLUDED.default_duration_minutes,
         brand_color = EXCLUDED.brand_color,
         updated_at = now()
       RETURNING display_name, timezone, default_duration_minutes, brand_color`,
      [
        tenantId,
        input.displayName,
        input.timezone,
        input.defaultDurationMinutes,
        input.brandColor,
      ],
    );
    return fromRow(result.rows[0]);
  });

  let cacheStatus: CacheStatus = "unavailable";
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(settingsKey(tenantId));
      cacheStatus = "invalidated";
    } catch {
      cacheStatus = "unavailable";
    }
  }

  return { settings, cacheStatus };
}