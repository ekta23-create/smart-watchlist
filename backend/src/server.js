import express from "express";
import cors from "cors";
import http from "http";

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
  console.log(`Smart Watchlist API listening on port ${PORT}`);
});