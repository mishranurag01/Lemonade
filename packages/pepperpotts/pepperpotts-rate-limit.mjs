export function createPepperpottsRateLimiter({ limit = 30, windowMs = 60_000, now = Date.now } = {}) {
  const buckets = new Map();
  return {
    consume(key) {
      const timestamp = now();
      let bucket = buckets.get(key);
      if (!bucket || timestamp >= bucket.resetAt) {
        bucket = { count: 0, resetAt: timestamp + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { allowed: bucket.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)) };
    }
  };
}
