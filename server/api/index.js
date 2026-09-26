// ─────────────────────────────────────────────
// Vercel entry point
// ─────────────────────────────────────────────
// Vercel serves functions from api/. The whole Express app is exposed as a
// single function, and vercel.json rewrites every path to it, so routing stays
// in Express rather than being split across per-route files.
//
// This works because the server is pure request/response: no background
// listeners, no in-memory state between requests. On-chain events arrive via
// POST /webhooks/* rather than a persistent chain subscription, which is what
// makes it serverless-compatible at all.
// ─────────────────────────────────────────────

import app from "../src/index.js";

export default app;
