import { mockProvider } from "./mockProvider.js";
import { makeFinnhubProvider } from "./finnhubProvider.js";

const apiKey = process.env.FINNHUB_API_KEY;

// A provider that wraps a real one and falls back to the simulator per-call
// if the live call fails repeatedly (rate limit, outage, bad symbol
// coverage). This is the "conflicting/unreliable data source" story: rather
// than surfacing an error to the user, we degrade to the best data we have
// and label it honestly.
function withFallback(primary, fallback) {
  let recentFailures = 0;
  let circuitOpenUntil = 0;

  return {
    id: primary.id,
    label: primary.label,
    async search(q) {
      try {
        return await primary.search(q);
      } catch {
        return fallback.search(q);
      }
    },
    async quote(symbol) {
      if (Date.now() < circuitOpenUntil) return withSourceTag(await fallback.quote(symbol), "stale-fallback");
      try {
        const result = await primary.quote(symbol);
        recentFailures = 0;
        return result;
      } catch (e) {
        recentFailures++;
        if (recentFailures >= 3) {
          // Open the circuit for 60s so we stop hammering a failing/rate-limited API
          circuitOpenUntil = Date.now() + 60_000;
        }
        return withSourceTag(await fallback.quote(symbol), "stale-fallback");
      }
    },
    async quotes(symbols) {
      if (Date.now() < circuitOpenUntil) {
        const r = await fallback.quotes(symbols);
        return r.map((q) => withSourceTag(q, "stale-fallback"));
      }
      try {
        const result = await primary.quotes(symbols);
        recentFailures = 0;
        return result;
      } catch {
        recentFailures++;
        if (recentFailures >= 3) circuitOpenUntil = Date.now() + 60_000;
        const r = await fallback.quotes(symbols);
        return r.map((q) => withSourceTag(q, "stale-fallback"));
      }
    },
  };
}

function withSourceTag(quote, tag) {
  if (!quote) return quote;
  return { ...quote, source: tag };
}

export function createProvider() {
  if (!apiKey) {
    console.log("[market] No FINNHUB_API_KEY set — running on simulated data. Set FINNHUB_API_KEY in .env for live quotes.");
    return mockProvider;
  }
  console.log("[market] FINNHUB_API_KEY detected — using live Finnhub data with simulated-data fallback.");
  return withFallback(makeFinnhubProvider(apiKey), mockProvider);
}
