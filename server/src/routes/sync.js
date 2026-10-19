// ─────────────────────────────────────────────
// Sync Route
// ─────────────────────────────────────────────
//   GET|POST /sync  → runs the chain indexer, returns how far it got
//
// Public on purpose: it only reads the chain and writes what the chain says,
// so calling it can make the database more accurate but never less. The
// client calls it after each transaction; a daily Vercel cron calls it as a
// backstop (crons send GET). Concurrent calls on the same instance share one
// run instead of each starting their own.
// ─────────────────────────────────────────────

import express from "express";
import { syncChain } from "../services/indexer.js";

const router = express.Router();

let inFlight = null;

async function handleSync(req, res, next) {
  try {
    if (!inFlight) {
      inFlight = syncChain().finally(() => {
        inFlight = null;
      });
    }
    res.json({ success: true, ...(await inFlight) });
  } catch (error) {
    next(error);
  }
}

router.get("/", handleSync);
router.post("/", handleSync);

export default router;
