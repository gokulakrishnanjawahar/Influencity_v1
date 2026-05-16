// ─────────────────────────────────────────────
// Influencity Backend — Express Server
// ─────────────────────────────────────────────

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import campaignRoutes from "./routes/campaigns.js";

dotenv.config();

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