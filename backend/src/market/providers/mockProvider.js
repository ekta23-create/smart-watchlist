// Simulated provider. Ships with the app so it runs with zero setup — no API
// key, no signup, no rate-limit surprises during a demo. Every provider
// implements the same three methods (search, quote, quotes) so the poller
// and routes never know which one is behind the interface.
//
// Prices follow a simple mean-reverting random walk seeded per symbol so the
// same symbol behaves consistently within a run, but still moves in a way
// that occasionally crosses the "meaningful change" thresholds — otherwise a
// demo of a change-detection feature would have nothing to show.

const UNIVERSE = [
  { symbol: "AAPL", name: "Apple Inc.", base: 227.5, vol: 0.012 },
  { symbol: "MSFT", name: "Microsoft Corp.", base: 421.3, vol: 0.011 },
  { symbol: "GOOGL", name: "Alphabet Inc.", base: 172.8, vol: 0.014 },
  { symbol: "AMZN", name: "Amazon.com Inc.", base: 186.4, vol: 0.016 },
  { symbol: "NVDA", name: "NVIDIA Corp.", base: 118.6, vol: 0.028 },
  { symbol: "META", name: "Meta Platforms Inc.", base: 512.2, vol: 0.019 },
  { symbol: "TSLA", name: "Tesla Inc.", base: 248.9, vol: 0.035 },
  { symbol: "NFLX", name: "Netflix Inc.", base: 688.1, vol: 0.017 },
  { symbol: "AMD", name: "Advanced Micro Devices", base: 152.3, vol: 0.026 },
  { symbol: "INTC", name: "Intel Corp.", base: 22.8, vol: 0.024 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", base: 214.5, vol: 0.009 },
  { symbol: "BAC", name: "Bank of America Corp.", base: 41.2, vol: 0.011 },
  { symbol: "V", name: "Visa Inc.", base: 289.7, vol: 0.008 },
  { symbol: "WMT", name: "Walmart Inc.", base: 91.4, vol: 0.007 },
  { symbol: "PG", name: "Procter & Gamble Co.", base: 168.9, vol: 0.006 },
  { symbol: "KO", name: "Coca-Cola Co.", base: 63.2, vol: 0.006 },
  { symbol: "XOM", name: "Exxon Mobil Corp.", base: 115.8, vol: 0.013 },
  { symbol: "DIS", name: "Walt Disney Co.", base: 96.5, vol: 0.015 },
  { symbol: "BA", name: "Boeing Co.", base: 178.3, vol: 0.022 },
  { symbol: "COIN", name: "Coinbase Global Inc.", base: 214.6, vol: 0.045 },
  { symbol: "PLTR", name: "Palantir Technologies", base: 41.7, vol: 0.038 },
  { symbol: "SOFI", name: "SoFi Technologies", base: 11.4, vol: 0.032 },
  { symbol: "RELIANCE", name: "Reliance Industries", base: 2945.0, vol: 0.013 },
  { symbol: "TCS", name: "Tata Consultancy Services", base: 4120.0, vol: 0.01 },
  { symbol: "INFY", name: "Infosys Ltd.", base: 1875.0, vol: 0.012 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", base: 1710.0, vol: 0.009 },
];

// Per-symbol mutable state for the random walk, plus the previous close and
// a rolling 52-week band so the mock data can genuinely cross those markers.
const state = new Map();
for (const s of UNIVERSE) {
  state.set(s.symbol, {
    ...s,
    price: s.base,
    prevClose: s.base * (1 + (Math.random() - 0.5) * 0.01),
    weekLow: s.base * (1 - Math.random() * 0.18 - 0.05),
    weekHigh: s.base * (1 + Math.random() * 0.18 + 0.05),
    avgVolume: Math.round(1_000_000 + Math.random() * 20_000_000),
    lastVolume: 0,
  });
}

function stepPrice(s) {
  // Mean-reverting geometric walk: drifts back toward prevClose slightly,
  // with per-symbol volatility, plus an occasional "shock" so demos see a
  // meaningful move without waiting a long time.
  const reversion = (s.prevClose - s.price) * 0.02;
  const shock = Math.random() < 0.06 ? (Math.random() - 0.5) * s.vol * 6 : 0;
  const noise = (Math.random() - 0.5) * s.vol * 2;
  const pctMove = reversion / s.price + noise + shock;
  s.price = Math.max(0.5, s.price * (1 + pctMove));
  s.weekLow = Math.min(s.weekLow, s.price);
  s.weekHigh = Math.max(s.weekHigh, s.price);
  s.lastVolume = Math.round(s.avgVolume * (0.4 + Math.random() * 1.6));
  return s;
}

function toQuote(s) {
  const dayChangePct = ((s.price - s.prevClose) / s.prevClose) * 100;
  return {
    symbol: s.symbol,
    name: s.name,
    price: Number(s.price.toFixed(2)),
    prevClose: Number(s.prevClose.toFixed(2)),
    dayChangePct: Number(dayChangePct.toFixed(3)),
    volume: s.lastVolume,
    avgVolume: s.avgVolume,
    weekLow: Number(s.weekLow.toFixed(2)),
    weekHigh: Number(s.weekHigh.toFixed(2)),
    ts: new Date().toISOString(),
    source: "simulated",
  };
}

export const mockProvider = {
  id: "mock",
  label: "Simulated data",

  async search(query) {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return UNIVERSE.filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)).slice(0, 10);
  },

  async quote(symbol) {
    const s = state.get(symbol.toUpperCase());
    if (!s) return null;
    stepPrice(s);
    return toQuote(s);
  },

  async quotes(symbols) {
    const out = [];
    for (const sym of symbols) {
      const q = await this.quote(sym);
      if (q) out.push(q);
    }
    return out;
  },
};
