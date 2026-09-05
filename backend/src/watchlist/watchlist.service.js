import { db, nowIso } from "../db.js";
import { getCached, setCached, isFresh } from "../market/cache.js";
import { detectChanges } from "../market/changeDetector.js";

const MAX_ITEMS_PER_USER = Number(process.env.MAX_WATCHLIST_ITEMS || 200);

export function listWatchlist(userId, provider) {
  const items = db
    .prepare("SELECT * FROM watchlist_items WHERE user_id = ? ORDER BY sort_order ASC, added_at ASC")
    .all(userId);

  return Promise.all(
    items.map(async (item) => {
      let quote = getCached(item.symbol);
      if (!quote) {
        // Cold start: nobody has fetched this symbol yet this run (e.g. right
        // after a restart). Fetch synchronously just this once instead of
        // making the user wait for the next poller tick.
        const fresh = await provider.quote(item.symbol);
        if (fresh) {
          setCached(item.symbol, fresh);
          quote = { ...fresh, ageMs: 0, stale: false };
        }
      }

      const lastSnapshot = item.last_viewed_snapshot ? JSON.parse(item.last_viewed_snapshot) : null;
      const change = quote
        ? detectChanges(item.symbol, quote, lastSnapshot, {
            alert_high: item.alert_high,
            alert_low: item.alert_low,
          })
        : { isMeaningful: false, severity: 0, reasons: [] };

      return {
        id: item.id,
        symbol: item.symbol,
        addedAt: item.added_at,
        lastViewedAt: item.last_viewed_at,
        alertHigh: item.alert_high,
        alertLow: item.alert_low,
        quote: quote || null,
        dataAvailable: Boolean(quote),
        change,
      };
    })
  );
}

export function addSymbol(userId, symbol, meta) {
  const sym = symbol.trim().toUpperCase();
  if (!sym) throw badRequest("Enter a symbol.");

  const count = db.prepare("SELECT COUNT(*) c FROM watchlist_items WHERE user_id = ?").get(userId).c;
  if (count >= MAX_ITEMS_PER_USER) {
    throw badRequest(`Watchlists are capped at ${MAX_ITEMS_PER_USER} symbols to keep things fast — remove one first.`);
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) m FROM watchlist_items WHERE user_id = ?").get(userId).m;

  try {
    db.prepare(
      `INSERT INTO watchlist_items (user_id, symbol, sort_order) VALUES (?, ?, ?)`
    ).run(userId, sym, maxOrder + 1);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw badRequest(`${sym} is already on your watchlist.`);
    throw e;
  }
  return sym;
}

export function removeSymbol(userId, symbol) {
  const info = db
    .prepare("DELETE FROM watchlist_items WHERE user_id = ? AND symbol = ?")
    .run(userId, symbol.trim().toUpperCase());
  if (info.changes === 0) throw notFound("That symbol isn't on your watchlist.");
}

export function setAlerts(userId, symbol, { alertHigh, alertLow }) {
  const info = db
    .prepare(
      `UPDATE watchlist_items SET alert_high = ?, alert_low = ? WHERE user_id = ? AND symbol = ?`
    )
    .run(alertHigh ?? null, alertLow ?? null, userId, symbol.trim().toUpperCase());
  if (info.changes === 0) throw notFound("That symbol isn't on your watchlist.");
}

export function reorder(userId, orderedSymbols) {
  const tx = db.transaction((symbols) => {
    symbols.forEach((sym, idx) => {
      db.prepare("UPDATE watchlist_items SET sort_order = ? WHERE user_id = ? AND symbol = ?").run(
        idx,
        userId,
        sym.toUpperCase()
      );
    });
  });
  tx(orderedSymbols);
}

// Called once the frontend has actually shown the current numbers to the
// user for a moment — resets the diff baseline so the NEXT visit is what
// gets compared against. This is what makes "what changed since you last
// checked" mean something real rather than resetting on every page load.
export function acknowledge(userId, symbols) {
  const tx = db.transaction((syms) => {
    for (const sym of syms) {
      const quote = getCached(sym);
      if (!quote) continue;
      const snapshot = JSON.stringify({ price: quote.price, dayChangePct: quote.dayChangePct, ts: quote.ts });
      db.prepare(
        `UPDATE watchlist_items SET last_viewed_at = ?, last_viewed_snapshot = ? WHERE user_id = ? AND symbol = ?`
      ).run(nowIso(), snapshot, userId, sym.toUpperCase());
    }
  });
  tx(symbols);
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}
function notFound(message) {
  const e = new Error(message);
  e.status = 404;
  return e;
}
