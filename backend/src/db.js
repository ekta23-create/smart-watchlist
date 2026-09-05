// Uses Node's built-in SQLite (node:sqlite, stable since Node 22+) instead
// of better-sqlite3. Same synchronous, prepared-statement API for our
// purposes, but ships compiled into Node itself — no native build step, so
// no Visual Studio / build-tools requirement on Windows, no prebuilt-binary
// lottery on any platform.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL"); // concurrent readers while a write is in flight — matters once the poller and API requests hit the DB at the same time

// Thin shim so the rest of the codebase can keep using db.transaction(fn),
// the better-sqlite3-style API, on top of node:sqlite (which only gives you
// raw BEGIN/COMMIT/ROLLBACK).
db.transaction = function (fn) {
  return function (...args) {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per (user, symbol). last_viewed_snapshot holds the price/metrics
  -- captured the last time this user actually looked at the watchlist, so we
  -- can compute "what changed since you last checked" per user, independent
  -- of the shared, global market cache other users are also reading from.
  CREATE TABLE IF NOT EXISTS watchlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_viewed_at TEXT,
    last_viewed_snapshot TEXT, -- JSON blob: {price, dayChangePct, volume, ts}
    alert_high REAL,
    alert_low REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, symbol)
  );

  CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist_items(symbol);

  -- Rolling history used to judge whether a move is "meaningful" relative to
  -- a symbol's OWN normal behaviour, not a single fixed threshold for every
  -- stock. Pruned periodically by the poller.
  CREATE TABLE IF NOT EXISTS symbol_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    volume REAL,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_history_symbol_ts ON symbol_history(symbol, ts);
`);

export function nowIso() {
  return new Date().toISOString();
}
