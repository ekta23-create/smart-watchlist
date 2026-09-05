import { useCallback, useEffect, useRef, useState } from "react";
import { api, getEmail, getToken, setToken, setEmail } from "./api.js";
import { useLiveQuotes } from "./hooks/useLiveQuotes.js";
import AuthScreen from "./components/AuthScreen.jsx";
import AddSymbol from "./components/AddSymbol.jsx";
import WatchlistRow from "./components/WatchlistRow.jsx";
import EmptyState from "./components/EmptyState.jsx";

const POLL_MS = 20_000;
const ACK_DELAY_MS = 4_000; // how long a flagged row must be visible before we reset its "since last checked" baseline

export default function App() {
  const [authedEmail, setAuthedEmail] = useState(getEmail());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const ackTimerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getWatchlist();
      setItems(res.items);
      setError("");
    } catch (err) {
      if (err.status === 401) {
        setToken(null);
        setEmail(null);
        setAuthedEmail(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authedEmail) return;
    refresh();
    api.status().then(setProviderStatus).catch(() => {});
    const handle = setInterval(refresh, POLL_MS);
    return () => clearInterval(handle);
  }, [authedEmail, refresh]);

  // Merge live socket pushes into state instantly, without waiting for the
  // next full poll — the poll still runs periodically to recompute *why*
  // something is flagged (that logic lives server-side).
  const symbols = items.map((i) => i.symbol);
  useLiveQuotes(symbols, (quote) => {
    setItems((prev) => prev.map((it) => (it.symbol === quote.symbol ? { ...it, quote: { ...it.quote, ...quote }, dataAvailable: true } : it)));
  });

  // After a flagged row has been visible for a few seconds, acknowledge it
  // so the next visit compares against today's numbers, not yesterday's.
  useEffect(() => {
    const flaggedSymbols = items.filter((i) => i.change?.isMeaningful).map((i) => i.symbol);
    if (flaggedSymbols.length === 0) return;
    clearTimeout(ackTimerRef.current);
    ackTimerRef.current = setTimeout(() => {
      api.acknowledge(flaggedSymbols).catch(() => {});
    }, ACK_DELAY_MS);
    return () => clearTimeout(ackTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.symbol}:${i.change?.isMeaningful}`).join(",")]);

  // Also acknowledge on tab hide / unload so a quick glance still counts as "checked".
  useEffect(() => {
    function onHide() {
      const flaggedSymbols = items.filter((i) => i.change?.isMeaningful).map((i) => i.symbol);
      if (flaggedSymbols.length) api.acknowledge(flaggedSymbols).catch(() => {});
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
    };
  }, [items]);

  async function handleAdd(symbol) {
    try {
      await api.addSymbol(symbol);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(symbol) {
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    try {
      await api.removeSymbol(symbol);
    } catch (err) {
      setError(err.message);
      refresh();
    }
  }

  function handleLogout() {
    setToken(null);
    setEmail(null);
    setAuthedEmail(null);
    setItems([]);
  }

  if (!authedEmail) {
    return (
      <div className="app-shell">
        <AuthScreen onAuthed={(email) => setAuthedEmail(email)} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">§</span> Ledger
          <span className="brand-tag">SMART MARKET WATCHLIST</span>
        </div>
        <div className="topbar-right">
          {providerStatus && (
            <div className={`data-source${providerStatus.provider === "mock" ? " simulated" : ""}`}>
              <span className="dot" />
              {providerStatus.label}
            </div>
          )}
          <span className="user-chip">{authedEmail}</span>
          <button className="link-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        <div className="toolbar">
          <AddSymbol existingSymbols={symbols} onAdd={handleAdd} />
        </div>

        {error && <div className="banner error">{error}</div>}

        {loading ? (
          <div className="loading-row">Loading your watchlist…</div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="ledger">
            {items.map((item) => (
              <WatchlistRow
                key={item.symbol}
                item={item}
                expanded={expandedSymbol === item.symbol}
                onToggle={() => setExpandedSymbol((s) => (s === item.symbol ? null : item.symbol))}
                onRemove={handleRemove}
                onAlertsSaved={refresh}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
