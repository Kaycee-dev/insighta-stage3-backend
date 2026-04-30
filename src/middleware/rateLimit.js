const { error } = require('../lib/respond');

function memoryStore() {
  const buckets = new Map();
  return {
    hit(key, windowMs, now = Date.now()) {
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        const bucket = { count: 1, resetAt: now + windowMs };
        buckets.set(key, bucket);
        return bucket;
      }
      existing.count += 1;
      return existing;
    },
    reset() {
      buckets.clear();
    },
  };
}

function rateLimit({ limit, windowMs = 60_000, key, scope, store = memoryStore(), skip, signalOnly }) {
  return (req, res, next) => {
    if (typeof skip === 'function' && skip(req)) return next();
    const keyValue = key(req);
    const bucket = store.hit(`${scope}:${keyValue}`, windowMs);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      if (signalOnly && bucket.tripped) return next();
      bucket.tripped = true;
      return error(res, 429, 'Too many requests');
    }
    next();
  };
}

module.exports = { memoryStore, rateLimit };
