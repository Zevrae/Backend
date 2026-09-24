import Redis from "ioredis";

const TTL_DEFAULT = 60;

let redis = null;
let usingRedis = false;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  redis.on("connect", () => {
    usingRedis = true;
    console.log("Redis cache connected");
  });
  redis.on("error", (err) => {
    usingRedis = false;
    console.error(
      "Redis error (falling back to no-cache for this op):",
      err.message,
    );
  });
} else {
  console.warn(
    "REDIS_URL not set — using an in-memory cache fallback. This is fine for local dev, " +
      "but is per-process: it will NOT share/invalidate correctly across multiple Node " +
      "instances/containers in production. Set REDIS_URL before deploying with >1 instance.",
  );
}

// ---- In-memory fallback (Map<key, { value, expiresAt }>) ----
const memoryStore = new Map();

const memGet = (key) => {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
};

const memSet = (key, value, ttlSeconds) => {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

const memDelPattern = (prefix) => {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
};

export const getCache = async (key) => {
  if (redis && usingRedis) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error(`Cache GET failed for "${key}":`, err.message);
      return null;
    }
  }
  return memGet(key);
};

export const setCache = async (key, value, ttlSeconds = TTL_DEFAULT) => {
  if (redis && usingRedis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return;
    } catch (err) {
      console.error(`Cache SET failed for "${key}":`, err.message);
      return;
    }
  }
  memSet(key, value, ttlSeconds);
};

export const delCache = async (key) => {
  if (redis && usingRedis) {
    try {
      await redis.del(key);
      return;
    } catch (err) {
      console.error(`Cache DEL failed for "${key}":`, err.message);
      return;
    }
  }
  memoryStore.delete(key);
};

export const delPattern = async (prefix) => {
  if (redis && usingRedis) {
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== "0");
      return;
    } catch (err) {
      console.error(`Cache delPattern failed for "${prefix}":`, err.message);
      return;
    }
  }
  memDelPattern(prefix);
};
