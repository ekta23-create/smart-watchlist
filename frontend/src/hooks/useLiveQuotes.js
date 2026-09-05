import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE, getToken } from "../api.js";

// Subscribes to the given symbols over one shared socket connection and
// calls onQuote whenever the server pushes a fresh quote for any of them.
// Re-subscribes automatically when the symbol list changes (e.g. after
// adding/removing a watchlist entry) without reconnecting the socket.
export function useLiveQuotes(symbols, onQuote) {
  const socketRef = useRef(null);
  const watchedRef = useRef([]);
  const callbackRef = useRef(onQuote);
  callbackRef.current = onQuote;

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(API_BASE, { auth: { token } });
    socketRef.current = socket;

    socket.on("quote", (quote) => callbackRef.current(quote));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const apply = () => {
      const prev = watchedRef.current;
      const next = symbols;
      const toUnwatch = prev.filter((s) => !next.includes(s));
      const toWatch = next.filter((s) => !prev.includes(s));
      if (toUnwatch.length) socket.emit("unwatch", toUnwatch);
      if (toWatch.length) socket.emit("watch", toWatch);
      watchedRef.current = next;
    };

    if (socket.connected) apply();
    else socket.once("connect", apply);
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
}
