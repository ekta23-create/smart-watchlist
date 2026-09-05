# Ledger — a Smart Market Watchlist

Built for CODE 2026 ("Build a Smart Market Watchlist").

Ledger doesn't just list prices. It decides, per stock, whether the current
number is worth your attention — and remembers what you'd already seen so it
only bothers you with what's new.

## Product pitch (100 words)

> Ledger decides what deserves attention instead of listing prices. A move
> is flagged only when meaningful for that stock, judged against its own
> trailing volatility rather than one fixed percentage for every symbol,
> with each flag naming its reason: unusual for this stock, a 52-week
> crossing, a volume spike, or moved since last checked. That is the core
> mechanic: each row stores what you actually saw last time, so returning
> users see a real diff. The backend fetches each distinct symbol once
> regardless of viewer count, broadcasts per-symbol, and falls back to
> simulated data, honestly labeled, when live data fails.

---

## Running it

Two processes, no external services required.

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm start          # http://localhost:4000

# Frontend (new terminal)
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Sign up with any email/password — it's stored locally in the backend's
SQLite file, nothing external. The watchlist works immediately on **simulated
market data**, so there is nothing to configure before you can use it.

To switch to live quotes, get a free key at finnhub.io and set
`FINNHUB_API_KEY` in `backend/.env`, then restart the backend. The app falls
back to simulated data automatically if the live API fails or rate-limits,
and always tells you which one you're looking at (top-right badge, and per
row in the expanded detail).

---

## What "meaningfully changed" means here

A single fixed threshold ("flag anything that moved >2%") is wrong for a
universe that mixes a utility stock that barely moves with a small-cap that
swings 5% on an average day. So a move is flagged when at least one of these
is true, each shown to the user as a labeled reason, not just a highlight:

1. **It moved since you personally last looked at it** — the headline
   feature. Compared against a per-user, per-symbol snapshot taken the last
   time that user's UI actually displayed the number (see "returning and
   seeing what changed" below), scaled by the symbol's own volatility rather
   than one flat percentage for every stock.
2. **It's moving unusually for *that* stock** — today's move compared
   against that symbol's own trailing standard deviation, so a 1.5% move in
   a sleepy blue-chip counts, while the same 1.5% in a stock that swings 4%
   daily doesn't.
3. **It crossed a 52-week high or low.**
4. **Volume is a multiple of that stock's own average volume.**
5. **It crossed a price alert the user set themselves** — the one signal
   that's explicit rather than inferred.

This lives in `backend/src/market/changeDetector.js`, entirely separate from
data-fetching, so the rules can be tuned or extended (earnings dates, news
sentiment, options flow) without touching how data is sourced or cached.

## How "return later and see what's changed" actually works

Each watchlist row stores a **snapshot of what the user last saw** (price,
day-change%, timestamp) — not just a last-viewed timestamp. On every load,
the current quote is diffed against that snapshot, and the diff is what
gets surfaced as "up 3.1% since you last checked."

The snapshot only updates once the user has actually seen the flagged state
for a few seconds (or the tab is hidden/closed) — see `App.jsx`'s
acknowledge logic. A page refresh half a second after loading doesn't wipe
out what you were about to notice.

## How state persists across sessions and devices

Email/password auth issuing a JWT (`backend/src/auth`). The token is the
only thing the frontend stores locally; every watchlist entry, alert, and
view-snapshot lives server-side in SQLite keyed by user ID, so signing in
from a different browser or device shows the identical watchlist and change
state — there's no per-device local storage of the data itself, only the
session token.

## How stale, delayed, or conflicting data is handled

- **Shared cache with a visible TTL** (`market/cache.js`): every quote
  carries its own age, and the UI marks anything past the TTL as stale
  rather than silently showing an old number as current.
- **Provider fallback with a circuit breaker** (`market/providers/index.js`):
  if the live provider fails repeatedly (rate-limited, outage), the app
  opens a circuit for 60s and serves simulated data instead of erroring out,
  clearly labeled `stale-fallback` in the response so the UI can say so.
- **Missing fields are shown as missing** (`—`), never guessed or
  interpolated — e.g. Finnhub's free tier doesn't return volume, so volume
  reads `—` on live data rather than fabricating a number.
- **Cold-start handling**: if a symbol was just added and the background
  poller hasn't reached it yet, the watchlist endpoint fetches it once
  synchronously rather than showing nothing until the next cycle.

## How this scales past one user and a handful of symbols

The design choice that matters most: **the system tracks distinct symbols,
not distinct (user, symbol) pairs.**

- The poller fetches each symbol that *anyone* is watching exactly once per
  cycle, however many users are watching it (`market/poller.js` queries
  `DISTINCT symbol`). 500 users watching AAPL costs the same as one.
- Live updates broadcast over a **per-symbol socket.io room**
  (`ws/socket.js`) — one push per symbol reaches every subscribed client,
  instead of polling per user.
- The change-detection volatility baseline is computed once per symbol
  (`symbol_history` table), not once per user.
- A capped, indexed SQLite table with `WAL` mode handles concurrent reads
  from API requests alongside writes from the poller without locking
  contention at hackathon scale; the query patterns (fetch by user,
  distinct symbols, prune old history) are the ones that would carry over
  directly to Postgres if this needed to grow past a single SQLite file.
  It runs on Node's built-in `node:sqlite` rather than a native-addon
  driver, so it needs no C++ build toolchain on any platform — a real
  reliability property, not just a convenience: one less thing that can be
  broken or missing on whatever machine runs this.
- Per-user watchlists are capped (`MAX_WATCHLIST_ITEMS`, default 200) so one
  account can't force unbounded fetch/compute cost.

## Where complexity was deliberately left out

- **No Redis, no message queue, no multi-instance coordination.** The
  in-memory cache and rate limiter are correct for one Node process; the
  README says explicitly where that assumption would need to change (the
  shared cache and rate-limit buckets would move to Redis) rather than
  building that abstraction pre-emptively for a scale this app doesn't have
  yet.
- **No brokerage integration, portfolio math, or order execution** — the
  brief asks for a watchlist, not a trading platform. Price alerts exist
  because they're a natural, explicit "meaningful to me" signal; anything
  further (options chains, fundamentals, analyst ratings) would be scope
  creep for what's being judged here.
- **Auth is plain email/password + JWT**, not OAuth or magic links — enough
  to prove cross-device persistence without pulling in a third-party auth
  dependency for a hackathon judge to configure.

## Edge cases specifically handled

- Duplicate symbol add → rejected with a clear message, not a silent no-op.
- Removing a symbol that's mid-flag → optimistic UI removal, rolled back
  with an error if the server call fails.
- Unknown/invalid ticker search → empty state, not an error.
- Provider returns "quote" for a symbol that doesn't exist (Finnhub returns
  all-zeroes rather than a 404) → detected and treated as no data.
- Expired/invalid JWT → frontend detects the 401 and drops back to the
  login screen rather than showing a broken watchlist.
- Symbol history table is pruned on a schedule so long-running instances
  don't grow the DB unbounded.
- Reduced-motion and keyboard navigation (rows are focusable/expandable via
  keyboard, not just click) are respected in the UI.

## Project structure

```
backend/
  src/
    db.js                     SQLite schema + migrations
    server.js                 Express app + socket.io + poller wiring
    auth/                     signup/login, JWT middleware
    watchlist/                CRUD, alerts, acknowledge/diff logic
    market/
      providers/               mock provider, Finnhub provider, fallback factory
      cache.js                 shared TTL cache (the scaling decision)
      changeDetector.js        "what counts as meaningful"
      poller.js                background refresh, symbol-deduped
      market.routes.js         search + status endpoints
    ws/socket.js               per-symbol broadcast rooms
    middleware/                rate limiting, error handling
frontend/
  src/
    App.jsx                    state, polling, live-merge, acknowledge timing
    api.js                     REST client
    hooks/useLiveQuotes.js      socket subscription management
    components/                 auth screen, search, watchlist row, empty state
    styles.css                  design tokens ("Ledger" visual concept)
```

## Design concept

The visual identity ("Ledger") treats the watchlist as literally a ledger:
ink-navy background, hairline rules as actual row boundaries rather than
decoration, a serif display face (Fraunces) for anything editorial, and a
monospaced face (IBM Plex Mono) for every number so columns genuinely align
— which is also just the correct typographic choice for tabular financial
data. The accent is a brass/gold rather than the usual fintech
neon-green-on-black or a generic SaaS palette, used only for what's flagged
as meaningful, so it stays meaningful rather than decorative.
