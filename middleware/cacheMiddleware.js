import { getCache, setCache } from "../utils/cache.js";

export const cacheRoute = (prefix, ttlSeconds) => {
  return async (req, res, next) => {
    const key = `${prefix}:${req.originalUrl}`;

    try {
      const cached = await getCache(key);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    } catch {}

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400 && body && body.success !== false) {
        setCache(key, body, ttlSeconds).catch(() => {});
      }
      res.set("X-Cache", "MISS");
      return originalJson(body);
    };

    next();
  };
};
