import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";

import "./db.js";
import authRoutes from "./auth/auth.routes.js";
import { watchlistRouter } from "./watchlist/watchlist.routes.js";
import { marketRouter } from "./market/market.routes.js";
import { createProvider } from "./market/providers/index.js";
import { startPoller } from "./market/poller.js";
import { createSocketServer } from "./ws/socket.js";
import { rateLimit } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

const provider = createProvider();

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", rateLimit({ max: 20 }), authRoutes);
app.use("/api/watchlist", watchlistRouter(provider));
app.use("/api/market", rateLimit({ max: 120 }), marketRouter(provider));

app.use(errorHandler);

const httpServer = http.createServer(app);
const io = createSocketServer(httpServer, CORS_ORIGIN);
startPoller(provider, io);

httpServer.listen(PORT, () => {
  console.log(`Smart Watchlist API listening on http://localhost:${PORT}`);
});
