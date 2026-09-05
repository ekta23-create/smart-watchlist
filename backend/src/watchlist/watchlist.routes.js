import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import * as svc from "./watchlist.service.js";

export function watchlistRouter(provider) {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      const items = await svc.listWatchlist(req.userId, provider);
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  router.post("/", (req, res, next) => {
    try {
      const { symbol } = req.body || {};
      const added = svc.addSymbol(req.userId, symbol || "");
      res.status(201).json({ symbol: added });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/:symbol", (req, res, next) => {
    try {
      svc.removeSymbol(req.userId, req.params.symbol);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  router.patch("/:symbol/alerts", (req, res, next) => {
    try {
      const { alertHigh, alertLow } = req.body || {};
      svc.setAlerts(req.userId, req.params.symbol, { alertHigh, alertLow });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  router.post("/reorder", (req, res, next) => {
    try {
      const { symbols } = req.body || {};
      if (!Array.isArray(symbols)) throw Object.assign(new Error("symbols must be an array"), { status: 400 });
      svc.reorder(req.userId, symbols);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  // Acknowledge that the user has seen the current numbers — resets the
  // "since you last checked" baseline for these symbols.
  router.post("/ack", (req, res, next) => {
    try {
      const { symbols } = req.body || {};
      if (!Array.isArray(symbols)) throw Object.assign(new Error("symbols must be an array"), { status: 400 });
      svc.acknowledge(req.userId, symbols);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
