import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../auth/auth.routes.js";

// Rooms are per-SYMBOL, not per-user: when the poller has a fresh quote for
// AAPL it emits once to room "symbol:AAPL", and socket.io fans it out to
// every connected client watching AAPL. This is the realtime half of the
// same scaling idea as the shared cache — one broadcast serves everyone.
export function createSocketServer(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("unauthorized"));
      jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("watch", (symbols) => {
      if (!Array.isArray(symbols)) return;
      for (const sym of symbols.slice(0, 200)) {
        socket.join(`symbol:${String(sym).toUpperCase()}`);
      }
    });

    socket.on("unwatch", (symbols) => {
      if (!Array.isArray(symbols)) return;
      for (const sym of symbols) socket.leave(`symbol:${String(sym).toUpperCase()}`);
    });
  });

  return io;
}
