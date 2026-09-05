import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function AddSymbol({ existingSymbols, onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query.trim());
        setResults(res.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(symbol) {
    onAdd(symbol);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="search-box" ref={boxRef}>
      <input
        type="text"
        placeholder="Search a symbol or company to add…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="Search for a symbol to add to your watchlist"
      />
      {open && query.trim() && (
        <div className="search-results">
          {loading && <div className="search-empty">Searching…</div>}
          {!loading && results.length === 0 && <div className="search-empty">No matches for "{query}".</div>}
          {!loading &&
            results.map((r) => {
              const already = existingSymbols.includes(r.symbol);
              return (
                <button key={r.symbol} onClick={() => !already && pick(r.symbol)} disabled={already}>
                  <span>
                    <span className="sym">{r.symbol}</span>
                    <span className="nm">{r.name}</span>
                  </span>
                  <span className="nm">{already ? "Added" : "Add"}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
