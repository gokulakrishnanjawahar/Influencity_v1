import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { Menu, X, LayoutDashboard, Plus, User } from "lucide-react";
import ConnectButton from "@/components/wallet/ConnectButton";

export function HexMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <polygon points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5" stroke="white" strokeWidth="1.5" fill="none" />
      <polygon points="18,10 25,14.5 25,21.5 18,26 11,21.5 11,14.5" fill="white" opacity="0.08" stroke="white" strokeWidth="0.75" />
      <circle cx="18" cy="18" r="3.5" fill="white" />
      <line x1="18" y1="3" x2="18" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="31" y1="10.5" x2="27.6" y2="12.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="31" y1="25.5" x2="27.6" y2="23.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const publicLinks = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "For Brands", href: "/campaigns/new" },
  { label: "For Creators", href: "/campaigns/browse" },
];

const appLinks = [
  { label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
  { label: "New Campaign", href: "/campaigns/new", Icon: Plus },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState(null);
  const { address, isConnected } = useAccount();
  const location = useLocation();

  const isActive = (href) => location.pathname === href;

  return (
    <>
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "rgba(8,8,8,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            height: 60,
          }}
        >
          {/* Logo */}
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <HexMark size={26} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff", letterSpacing: -0.5 }}>
              Influencity
            </span>
          </Link>

          {/* Center nav — hidden below 768px, where the hamburger takes over */}
          <div className="r-nav-links" style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {publicLinks.map((item) => {
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  style={{
                    padding: "7px 13px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    color: hoveredLink === item.label ? "#bbb" : "#666",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={() => setHoveredLink(item.label)}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  {item.label}
                </Link>
              );
            })}

            {isConnected && appLinks.map((item) => {
              const NavIcon = item.Icon;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 13px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    color: isActive(item.href) ? "#fff" : "#666",
                    background: isActive(item.href) ? "rgba(255,255,255,0.07)" : "transparent",
                    border: isActive(item.href) ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <NavIcon size={13} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isConnected && address && (
              <Link
                to={`/profile/${address}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "7px 12px",
                  borderRadius: 8,
                  color: "#666",
                  textDecoration: "none",
                }}
              >
                <User size={13} />
              </Link>
            )}
            <ConnectButton />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="mobile-menu-btn"
              style={{
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#888",
                cursor: "pointer",
              }}
            >
              {mobileOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "fixed",
              top: 60,
              left: 0,
              right: 0,
              zIndex: 40,
              background: "rgba(8,8,8,0.97)",
              backdropFilter: "blur(16px)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              padding: 16,
            }}
          >
            {publicLinks.map((item) => {
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    display: "block",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#888",
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}

            {isConnected && appLinks.map((item) => {
              const NavIcon = item.Icon;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    color: isActive(item.href) ? "#fff" : "#888",
                    textDecoration: "none",
                  }}
                >
                  <NavIcon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}