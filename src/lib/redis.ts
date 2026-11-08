import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      commandTimeout: 300,
      connectTimeout: 500,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    client.on("error", () => {
      // Ignore errors here. The code that uses Redis falls back to the database.
    });
  }
  return client;
}