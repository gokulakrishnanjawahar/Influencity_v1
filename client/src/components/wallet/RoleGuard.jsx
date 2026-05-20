// ─────────────────────────────────────────────
// RoleGuard — Wallet connection + role gating
// ─────────────────────────────────────────────
// Wraps a page so it is only reachable by a connected wallet that has
// selected the required role. On first use it prompts the user to choose
// a role; if they land on a page meant for the other role it offers a
// one-click switch. Role is persisted via SIWEProvider.
// ─────────────────────────────────────────────

import { motion } from "framer-motion";
import { Briefcase, Sparkles } from "lucide-react";
import WalletGuard from "./WalletGuard";
import { useSIWE } from "./SIWEProvider";

const BG = "#080808";
const SURFACE = "#111111";
const SURFACE2 = "#161616";
const BORDER = "#1f1f1f";
const BORDER2 = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#888888";

const ROLES = [
  {
    id: "brand",
    label: "I'm a Brand",
    desc: "Post campaigns, fund escrows in USDC, and pick creators to work with.",
    icon: Briefcase,
  },
  {
    id: "creator",
    label: "I'm a Creator",
    desc: "Browse open campaigns, apply, and earn USDC for verified results.",
    icon: Sparkles,
  },
];

function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ maxWidth: 520, width: "100%" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function RoleSelect({ onSelect }) {
  return (
    <Shell>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: TEXT,
            letterSpacing: -0.5,
            marginBottom: 8,
          }}
        >
          How will you use Influencity?
        </h2>
        <p style={{ fontSize: 13, color: MUTED }}>
          Pick a role to continue — you can switch anytime.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {ROLES.map(({ id, label, desc, icon: Icon }) => (
          <motion.button
            key={id}
            whileHover={{ y: -2 }}
            onClick={() => onSelect(id)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: 20,
              borderRadius: 14,
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                background: SURFACE2,
                border: `1px solid ${BORDER2}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={17} style={{ color: TEXT }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 3 }}>
                {label}
              </p>
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>{desc}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </Shell>
  );
}

function RoleMismatch({ current, required, onSwitch }) {
  return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: TEXT,
            letterSpacing: -0.5,
            marginBottom: 8,
          }}
        >
          This page is for {required}s
        </h2>
        <p style={{ fontSize: 13, color: MUTED, marginBottom: 24, lineHeight: 1.6 }}>
          You're currently using Influencity as a {current}. Switch to a {required}{" "}
          to continue.
        </p>
        <button
          onClick={() => onSwitch(required)}
          style={{
            padding: "11px 22px",
            borderRadius: 10,
            background: TEXT,
            color: "#000",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "capitalize",
          }}
        >
          Switch to {required}
        </button>
      </div>
    </Shell>
  );
}

/// @param role The role required to view the wrapped page ("brand" | "creator")
export default function RoleGuard({ role: requiredRole, children }) {
  const { role, setRole } = useSIWE();

  return (
    <WalletGuard>
      {!role ? (
        <RoleSelect onSelect={setRole} />
      ) : role !== requiredRole ? (
        <RoleMismatch current={role} required={requiredRole} onSwitch={setRole} />
      ) : (
        children
      )}
    </WalletGuard>
  );
}
