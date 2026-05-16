import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Zap } from "lucide-react";

const BG = "#080808";
const SURFACE = "#111111";
const BORDER = "#1f1f1f";
const TEXT = "#f5f5f5";
const MUTED = "#888888";
const VERY_MUTED = "#444444";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translateX(-50%) translateY(-50%)",
          width: 500,
          height: 300,
          background: "radial-gradient(ellipse, rgba(255,255,255,0.02) 0%, transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      {/* Grid */}
      <div
        style={{
          position: "absolute", inset: 0, opacity: 0.015,
          backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ textAlign: "center", position: "relative", zIndex: 1 }}
      >
        {/* Logo */}
        <motion.div
          animate={{ rotate: [0, 6, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ display: "inline-flex", marginBottom: 32 }}
        >
          <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
            <polygon
              points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5"
              stroke="white"
              strokeWidth="1.5"
              fill="none"
              opacity="0.3"
            />
            <circle cx="18" cy="18" r="3" fill="white" opacity="0.3" />
          </svg>
        </motion.div>

        {/* 404 */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: TEXT,
            letterSpacing: -6,
            lineHeight: 1,
            fontFamily: "monospace",
            marginBottom: 16,
            opacity: 0.08,
          }}
        >
          404
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: TEXT,
            letterSpacing: -1,
            marginBottom: 12,
            marginTop: -24,
          }}
        >
          Page not found
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            fontSize: 14,
            color: MUTED,
            marginBottom: 36,
            maxWidth: 320,
            lineHeight: 1.7,
          }}
        >
          This page doesn't exist or has been moved.
          Head back to the dashboard to continue.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{ display: "flex", gap: 10, justifyContent: "center" }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(-1)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: 10,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: MUTED, fontSize: 13, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} /> Go back
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: 10,
              background: TEXT, color: "#000",
              fontWeight: 700, fontSize: 13,
              border: "none", cursor: "pointer",
            }}
          >
            <Zap size={14} /> Go home
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}