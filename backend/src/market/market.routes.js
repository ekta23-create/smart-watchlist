import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { cacheStats } from "./cache.js";

export function marketRouter(provider) {
  const router = Router();

  router.get("/search", requireAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 1) return res.json({ results: [] });
      const results = await provider.search(q);
      res.json({ results });
    } catch (e) {
      next(e);
    }
  });

  router.get("/status", (_req, res) => {
    res.json({ provider: provider.id, label: provider.label, cache: cacheStats() });
  });

  return router;
}
