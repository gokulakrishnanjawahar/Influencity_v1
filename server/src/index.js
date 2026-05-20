// ─────────────────────────────────────────────
// Influencity Backend — Express Server
// ─────────────────────────────────────────────

import "./loadEnv.js";
import express from "express";
import cors from "cors";
import campaignRoutes from "./routes/campaigns.js";
import creatorRoutes from "./routes/creators.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

app.use(cors({
  origin: [
    "http://localhost:5173",
    process.env.CLIENT_URL,
    /\.vercel\.app$/,
  ].filter(Boolean),
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

app.use("/campaigns", campaignRoutes);
app.use("/creators", creatorRoutes);
app.use("/webhooks", webhookRoutes);

// ─────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Influencity server running on http://localhost:${PORT}`);
});

export default app;