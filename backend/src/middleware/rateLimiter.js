// Minimal in-memory fixed-window limiter — enough to stop one client from
// hammering /search or /login. Keyed by IP + route so one heavy user on one
// endpoint doesn't block others. Deliberately not Redis-backed: with a
// single Node process this is simpler and correct; the moment this app runs
// on more than one instance, this map needs to move to a shared store
// (noted in the README rather than built pre-emptively).
const WINDOW_MS = 60_000;
const buckets = new Map();

export function rateLimit({ max = 60 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + WINDOW_MS;
    }
    bucket.count++;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests — slow down a little and try again shortly." });
    }
    next();
  };
}
