import { db } from "../db.js";
import { setCached } from "./cache.js";
import { recordHistory, pruneHistory } from "./changeDetector.js";

const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 15_000);
const HISTORY_SAMPLE_INTERVAL_MS = 5 * 60_000; // don't need per-15s granularity for the volatility baseline

let lastHistorySample = 0;

function distinctWatchedSymbols() {
  return db.prepare("SELECT DISTINCT symbol FROM watchlist_items").all().map((r) => r.symbol);
}

/**
 * Runs on an interval. Fetches every symbol CURRENTLY on someone's
 * watchlist exactly once (not once per user — see cache.js), updates the
 * shared cache, and broadcasts diffs over the given socket.io instance.
 * Symbols nobody is watching are simply never fetched, so cost scales with
 * the size of the distinct symbol universe, not the number of users.
 */
export function startPoller(provider, io) {
  async function tick() {
    const symbols = distinctWatchedSymbols();
    if (symbols.length === 0) return;

    try {
      const quotes = await provider.quotes(symbols);
      const sampleHistory = Date.now() - lastHistorySample > HISTORY_SAMPLE_INTERVAL_MS;
      if (sampleHistory) lastHistorySample = Date.now();

      for (const quote of quotes) {
        setCached(quote.symbol, quote);
        if (sampleHistory) recordHistory(quote.symbol, quote.price, quote.volume);
        io.to(`symbol:${quote.symbol}`).emit("quote", quote);
      }
    } catch (err) {
      console.error("[poller] refresh cycle failed:", err.message);
    }
  }

  tick(); // don't wait a full interval for the first data
  const handle = setInterval(tick, REFRESH_INTERVAL_MS);
  const pruneHandle = setInterval(pruneHistory, 6 * 60 * 60_000);
  return () => {
    clearInterval(handle);
    clearInterval(pruneHandle);
  };
}
