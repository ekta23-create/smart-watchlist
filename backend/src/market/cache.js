// One shared cache for the whole process, keyed by symbol. This is the core
// scaling decision: if 500 users all watch AAPL, we fetch AAPL once per
// refresh cycle, not 500 times. Every user's watchlist reads from the same
// entry.
const TTL_MS = Number(process.env.QUOTE_TTL_MS || 15_000);

const store = new Map(); // symbol -> { quote, fetchedAt }

export function getCached(symbol) {
  const entry = store.get(symbol.toUpperCase());
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  return { ...entry.quote, ageMs, stale: ageMs > TTL_MS };
}

export function setCached(symbol, quote) {
  store.set(symbol.toUpperCase(), { quote, fetchedAt: Date.now() });
}

export function isFresh(symbol) {
  const entry = store.get(symbol.toUpperCase());
  if (!entry) return false;
  return Date.now() - entry.fetchedAt <= TTL_MS;
}

export function trackedSymbols() {
  return [...store.keys()];
}

export function cacheStats() {
  return { size: store.size, ttlMs: TTL_MS };
}
