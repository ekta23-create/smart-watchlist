import { db } from "../db.js";

// --- What counts as a "meaningful" change -----------------------------
//
// A fixed "±2%" rule is wrong for a universe that includes both a utility
// stock that moves 0.3% on a normal day and a small-cap that moves 4% on a
// normal day. So instead of one absolute threshold, each rule below judges
// a move against that SYMBOL's own recent behaviour where possible, and
// falls back to sane absolute defaults when there isn't enough history yet
// (a symbol just added to the universe).
//
// Every reason is returned with a severity (1-3) and a short human label so
// the UI can show *why* something was flagged, not just that it was.

const HISTORY_LOOKBACK_HOURS = 24 * 14; // two weeks of samples for a volatility baseline

function recentVolatility(symbol) {
  const rows = db
    .prepare(
      `SELECT price FROM symbol_history
       WHERE symbol = ? AND ts >= datetime('now', ?)
       ORDER BY ts ASC`
    )
    .all(symbol, `-${HISTORY_LOOKBACK_HOURS} hours`);

  if (rows.length < 6) return null; // not enough samples yet — caller uses a default

  const returns = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].price;
    const cur = rows[i].price;
    if (prev > 0) returns.push((cur - prev) / prev);
  }
  if (returns.length === 0) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance); // stdev of per-sample returns, as a fraction
}

/**
 * @param {object} quote current quote from the provider/cache
 * @param {object|null} lastViewedSnapshot what the user's UI last showed for this symbol (JSON, or null if never viewed)
 * @param {object|null} alerts { alert_high, alert_low } user-set price alerts, or null
 */
export function detectChanges(symbol, quote, lastViewedSnapshot, alerts) {
  const reasons = [];
  const stdev = recentVolatility(symbol);
  const normalMoveThreshold = stdev ? Math.max(stdev * 2.5, 0.004) : 0.02; // 2.5 sigma, floor at 0.4%; default 2% with no history

  // 1. Meaningful move since the user last actually looked at this symbol —
  //    this is the headline feature ("what changed since I last checked").
  if (lastViewedSnapshot && typeof lastViewedSnapshot.price === "number" && lastViewedSnapshot.price > 0) {
    const pct = (quote.price - lastViewedSnapshot.price) / lastViewedSnapshot.price;
    if (Math.abs(pct) >= normalMoveThreshold) {
      reasons.push({
        code: "since_last_view",
        label: `${pct >= 0 ? "Up" : "Down"} ${Math.abs(pct * 100).toFixed(1)}% since you last checked`,
        severity: Math.abs(pct) >= normalMoveThreshold * 2 ? 3 : 2,
      });
    }
  }

  // 2. Move relative to the symbol's own typical volatility, regardless of
  //    when the user last looked — catches a stock moving unusually even on
  //    someone's very first visit.
  if (stdev && Math.abs(quote.dayChangePct) / 100 >= stdev * 3) {
    reasons.push({
      code: "unusual_for_symbol",
      label: `Unusually large move for this stock (${quote.dayChangePct >= 0 ? "+" : ""}${quote.dayChangePct.toFixed(2)}% vs its typical daily swing)`,
      severity: 3,
    });
  }

  // 3. Plain today's-move fallback so low-history symbols still surface
  //    something obviously large.
  if (!stdev && Math.abs(quote.dayChangePct) >= 3) {
    reasons.push({
      code: "large_day_move",
      label: `${quote.dayChangePct >= 0 ? "Up" : "Down"} ${Math.abs(quote.dayChangePct).toFixed(1)}% today`,
      severity: Math.abs(quote.dayChangePct) >= 6 ? 3 : 2,
    });
  }

  // 4. 52-week band crossing.
  if (typeof quote.weekHigh === "number" && quote.price >= quote.weekHigh) {
    reasons.push({ code: "week_high", label: "New 52-week high", severity: 2 });
  }
  if (typeof quote.weekLow === "number" && quote.price <= quote.weekLow) {
    reasons.push({ code: "week_low", label: "New 52-week low", severity: 2 });
  }

  // 5. Volume spike vs. the symbol's own average volume.
  if (quote.volume && quote.avgVolume && quote.volume >= quote.avgVolume * 2) {
    reasons.push({
      code: "volume_spike",
      label: `Volume ${(quote.volume / quote.avgVolume).toFixed(1)}x average`,
      severity: quote.volume >= quote.avgVolume * 3 ? 3 : 2,
    });
  }

  // 6. User-defined price alerts — the one form of "meaningful" the user
  //    gets to define explicitly rather than inferred.
  if (alerts?.alert_high != null && quote.price >= alerts.alert_high) {
    reasons.push({ code: "alert_high", label: `Crossed your alert of ${alerts.alert_high}`, severity: 3 });
  }
  if (alerts?.alert_low != null && quote.price <= alerts.alert_low) {
    reasons.push({ code: "alert_low", label: `Fell below your alert of ${alerts.alert_low}`, severity: 3 });
  }

  reasons.sort((a, b) => b.severity - a.severity);
  return {
    isMeaningful: reasons.length > 0,
    severity: reasons.length ? reasons[0].severity : 0,
    reasons,
  };
}

export function recordHistory(symbol, price, volume) {
  db.prepare("INSERT INTO symbol_history (symbol, price, volume) VALUES (?, ?, ?)").run(symbol, price, volume ?? null);
}

// Keep the history table from growing forever — called periodically by the poller.
export function pruneHistory() {
  db.prepare(`DELETE FROM symbol_history WHERE ts < datetime('now', ?)`).run(`-${HISTORY_LOOKBACK_HOURS + 24} hours`);
}
