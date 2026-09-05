// Real market data via Finnhub's free tier. Only used when FINNHUB_API_KEY
// is set (see providers/index.js) — the app degrades to mockProvider
// otherwise instead of failing to start.
//
// Finnhub's free tier has no batch quote endpoint, so `quotes()` fans out
// with a small concurrency cap rather than one request per symbol in serial
// (slow) or all at once (trips the per-second rate limit).

const BASE = "https://finnhub.io/api/v1";

async function fetchJson(path, apiKey) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Finnhub request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function makeFinnhubProvider(apiKey) {
  const nameCache = new Map();

  return {
    id: "finnhub",
    label: "Live data (Finnhub)",

    async search(query) {
      const data = await fetchJson(`/search?q=${encodeURIComponent(query)}`, apiKey);
      return (data.result || [])
        .filter((r) => r.type === "Common Stock")
        .slice(0, 10)
        .map((r) => ({ symbol: r.symbol, name: r.description }));
    },

    async quote(symbol) {
      try {
        const [q, profile] = await Promise.all([
          fetchJson(`/quote?symbol=${encodeURIComponent(symbol)}`, apiKey),
          nameCache.has(symbol)
            ? Promise.resolve(nameCache.get(symbol))
            : fetchJson(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`, apiKey).catch(() => ({})),
        ]);
        if (!nameCache.has(symbol)) nameCache.set(symbol, profile);

        if (q.c === 0 && q.pc === 0) return null; // Finnhub returns all-zero for unknown symbols instead of a 404

        return {
          symbol,
          name: profile.name || symbol,
          price: q.c,
          prevClose: q.pc,
          dayChangePct: q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0,
          dayHigh: q.h,
          dayLow: q.l,
          volume: null, // not included in Finnhub's free /quote — surfaced as "—" in the UI rather than guessed
          avgVolume: null,
          weekLow: null,
          weekHigh: null,
          ts: new Date().toISOString(),
          source: "finnhub",
        };
      } catch (e) {
        if (e.status === 429) throw e; // let the caller back off
        return null;
      }
    },

    async quotes(symbols) {
      const out = await mapWithConcurrency(symbols, 5, (sym) => this.quote(sym));
      return out.filter(Boolean);
    },
  };
}
