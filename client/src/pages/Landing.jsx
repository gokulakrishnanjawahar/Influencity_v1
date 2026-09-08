import { useNavigate } from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  AnimatePresence,
  useMotionValue,
  useAnimationFrame,
} from "framer-motion";
import { useAccount } from "wagmi";
import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import {
  ArrowRight, Zap, Lock, Globe, Coins,
  CheckCircle, ChevronRight, Activity,
  Cpu, Database, Layers, Star,
  BarChart3, Shield,
} from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Navbar, { HexMark } from "@/components/layout/Navbar";

// ─────────────────────────────────────────────
// MONOCHROME TOKENS
// ─────────────────────────────────────────────
const BG = "#080808";
const SURFACE = "#111111";
const SURFACE2 = "#161616";
const BORDER = "#1f1f1f";
const BORDER2 = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#888888";
const VERY_MUTED = "#444444";
const WHITE = "#ffffff";
const SUCCESS = "#4ade80";
const DANGER = "#f87171";
const WARNING = "#fb923c";

// ─────────────────────────────────────────────
// LOGO INTRO ANIMATION
// ─────────────────────────────────────────────
function LogoIntro({ onComplete }) {
  const [phase, setPhase] = useState(0);
  // 0: fade in, 1: hex animates, 2: fade out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 2000);
    const t3 = setTimeout(() => onComplete(), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
      animate={{ opacity: phase === 2 ? 0 : 1 }}
      transition={{ duration: 0.5 }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        {/* Hex mark — animates vertices one by one */}
        <svg width="72" height="72" viewBox="0 0 36 36" fill="none">
          <motion.polygon
            points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5"
            stroke="white"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: phase >= 1 ? 1 : 0, opacity: 1 }}
            transition={{ duration: 1.0, ease: "easeInOut" }}
          />
          <motion.polygon
            points="18,10 25,14.5 25,21.5 18,26 11,21.5 11,14.5"
            fill="white"
            stroke="white"
            strokeWidth="0.75"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? 0.08 : 0 }}
            transition={{ delay: 0.5 }}
          />
          <motion.circle
            cx="18" cy="18" r="3.5"
            fill="white"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: phase >= 1 ? 1 : 0, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
          />
          {[
            { x: 18, y: 3 }, { x: 31, y: 10.5 }, { x: 31, y: 25.5 },
            { x: 18, y: 33 }, { x: 5, y: 25.5 }, { x: 5, y: 10.5 },
          ].map(({ x, y }, i) => (
            <motion.circle
              key={i}
              cx={x} cy={y} r="1.5"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: phase >= 1 ? 1 : 0, opacity: phase >= 1 ? 1 : 0 }}
              transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 400 }}
            />
          ))}
        </svg>

        {/* Wordmark fades in after hex */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 8 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          style={{ fontSize: 28, fontWeight: 900, color: WHITE, letterSpacing: -1 }}
        >
          Influencity
        </motion.span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// CURSOR GLOW
// ─────────────────────────────────────────────
function CursorGlow() {
  const [pos, setPos] = useState({ x: -999, y: -999 });

  useEffect(() => {
    const move = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <motion.div
      className="pointer-events-none fixed z-0"
      animate={{ x: pos.x - 150, y: pos.y - 150 }}
      transition={{ type: "spring", damping: 40, stiffness: 300 }}
      style={{
        width: 300, height: 300,
        background: "radial-gradient(circle, rgba(255,255,255,0.015) 0%, transparent 70%)",
        borderRadius: "50%",
      }}
    />
  );
}

// ─────────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────────
function Particles() {
  const dots = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1.5 + 0.5,
    dur: Math.random() * 14 + 8,
    delay: Math.random() * 8,
    opacity: Math.random() * 0.15 + 0.03,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map(({ id, x, y, size, dur, delay, opacity }) => (
        <motion.div
          key={id}
          className="absolute rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: WHITE, opacity }}
          animate={{ y: [0, -30, 0], opacity: [opacity, opacity * 3, opacity] }}
          transition={{ duration: dur, delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCROLL MARQUEE
// ─────────────────────────────────────────────
function Marquee({ items, speed = 35, reverse = false }) {
  const x = useMotionValue(0);
  const ref = useRef(null);

  useAnimationFrame((_, delta) => {
    const dir = reverse ? 1 : -1;
    const next = x.get() + (dir * speed * delta) / 1000;
    const el = ref.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (!reverse && next < -half) x.set(0);
    else if (reverse && next > 0) x.set(-half);
    else x.set(next);
  });

  return (
    <div style={{ overflow: "hidden" }}>
      <motion.div
        ref={ref}
        style={{ x, display: "flex", gap: "2.5rem", whiteSpace: "nowrap" }}
      >
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            style={{ fontSize: 12, color: VERY_MUTED, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}
          >
            <span style={{ color: BORDER2, fontSize: 8 }}>◆</span>
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ANIMATED COUNTER
// ─────────────────────────────────────────────
function Counter({ to, prefix = "", suffix = "", duration = 2.2 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / (duration * 1000), 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(e * to));
      if (p < 1) requestAnimationFrame(step);
      else setVal(to);
    };
    requestAnimationFrame(step);
  }, [inView, to, duration]);

  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ─────────────────────────────────────────────
// REVEAL
// ─────────────────────────────────────────────
function Reveal({ children, delay = 0, direction = "up", className, style }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{
        opacity: 0,
        y: direction === "up" ? 28 : direction === "down" ? -28 : 0,
        x: direction === "left" ? 28 : direction === "right" ? -28 : 0,
      }}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// DEAL FLOW TIMELINE — hero right panel
// ─────────────────────────────────────────────
const TIMELINE_EVENTS = [
  {
    id: 1,
    type: "created",
    title: "Campaign created",
    detail: "Brand locked $1,500 USDC into escrow",
    meta: "0xA3f...8B2c · contract deployed",
    time: "2 days ago",
    color: WHITE,
    dotColor: WHITE,
  },
  {
    id: 2,
    type: "proof",
    title: "Content published",
    detail: "Creator posted YouTube video & submitted proof",
    meta: "ipfs/bafybei...XYZ · pinned to Filecoin",
    time: "1 day ago",
    color: MUTED,
    dotColor: MUTED,
  },
  {
    id: 3,
    type: "oracle",
    title: "Chainlink oracle verified",
    detail: "52,341 views ≥ 50,000 threshold",
    meta: "5 nodes · consensus reached · no human input",
    time: "6 hours ago",
    color: MUTED,
    dotColor: MUTED,
  },
  {
    id: 4,
    type: "payout",
    title: "500 USDC released automatically",
    detail: "Transferred to 0x71C7...8Fa3",
    meta: "Reputation token minted · tx: 0xab3f...",
    time: "just now",
    color: SUCCESS,
    dotColor: SUCCESS,
  },
];

function DealFlowTimeline() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    TIMELINE_EVENTS.forEach((_, i) => {
      setTimeout(() => setVisibleCount(i + 1), i * 500 + 200);
    });
  }, [inView]);

  return (
    <div
      ref={ref}
      style={{
        borderRadius: 16,
        border: `1px solid ${BORDER}`,
        background: SURFACE,
        overflow: "hidden",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 40px 80px -20px rgba(0,0,0,0.8)`,
      }}
    >
      {/* Window chrome */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${BORDER}`,
        background: `${SURFACE2}`,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#333", "#333", "#333"].map((c, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "3px 12px", borderRadius: 5,
          background: BORDER, border: `1px solid ${BORDER2}`,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: SUCCESS, animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 11, color: VERY_MUTED, fontFamily: "monospace" }}>
            influencity.app/campaigns/1
          </span>
        </div>
        <div style={{ width: 48 }} />
      </div>

      {/* Header */}
      <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>TechReview Q2 Campaign</p>
            <p style={{ fontSize: 11, color: VERY_MUTED, marginTop: 2 }}>YouTube · 3 milestones · $1,500 USDC locked</p>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 100,
            background: `rgba(74,222,128,0.1)`, color: SUCCESS,
            border: `1px solid rgba(74,222,128,0.2)`,
          }}>
            ● Active
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: VERY_MUTED }}>Milestone 1 of 3</span>
            <span style={{ fontSize: 10, color: MUTED }}>104%</span>
          </div>
          <div style={{ height: 3, background: BORDER, borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              style={{ height: "100%", background: WHITE, borderRadius: 2 }}
              initial={{ width: 0 }}
              animate={inView ? { width: "100%" } : {}}
              transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ padding: "16px 20px" }}>
        <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, color: VERY_MUTED, marginBottom: 16 }}>
          Campaign activity
        </p>

        <div style={{ position: "relative" }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute", left: 7, top: 8, bottom: 8,
            width: 1, background: BORDER,
          }} />

          {TIMELINE_EVENTS.map((event, i) => (
            <AnimatePresence key={event.id}>
              {visibleCount > i && (
                <motion.div
                  initial={{ opacity: 0, x: 16, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  style={{ display: "flex", gap: 14, marginBottom: i < 3 ? 16 : 0, position: "relative" }}
                >
                  {/* Dot */}
                  <div style={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                      style={{
                        width: 15, height: 15, borderRadius: "50%",
                        background: event.type === "payout" ? `rgba(74,222,128,0.15)` : SURFACE2,
                        border: `1.5px solid ${event.dotColor}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: event.type === "payout" ? `0 0 12px rgba(74,222,128,0.4)` : "none",
                      }}
                    >
                      {event.type === "payout" && (
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: SUCCESS }} />
                      )}
                    </motion.div>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, paddingBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: event.color, lineHeight: 1.3 }}>
                        {event.title}
                      </p>
                      <span style={{ fontSize: 10, color: VERY_MUTED, flexShrink: 0, marginTop: 1 }}>
                        {event.time}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                      {event.detail}
                    </p>
                    <p style={{ fontSize: 10, color: VERY_MUTED, marginTop: 2, fontFamily: "monospace" }}>
                      {event.meta}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          ))}
        </div>

        {/* Payout confirmation */}
        <AnimatePresence>
          {visibleCount >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              style={{
                marginTop: 16, padding: "12px 14px", borderRadius: 10,
                background: `rgba(74,222,128,0.04)`,
                border: `1px solid rgba(74,222,128,0.18)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: `rgba(74,222,128,0.15)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CheckCircle size={11} style={{ color: SUCCESS }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: SUCCESS }}>
                    Milestone 1 complete · Payout confirmed on-chain
                  </p>
                  <p style={{ fontSize: 10, color: VERY_MUTED, marginTop: 2 }}>
                    Next: milestone 2 · 100k views · $500 USDC
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ORACLE ANIMATION
// ─────────────────────────────────────────────
function OracleLoop() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const cycle = () => {
      setPhase(0);
      setTimeout(() => setPhase(1), 800);
      setTimeout(() => setPhase(2), 2200);
      setTimeout(() => setPhase(3), 3600);
      setTimeout(() => setPhase(4), 5000);
    };
    cycle();
    const interval = setInterval(cycle, 7000);
    return () => clearInterval(interval);
  }, []);

  const nodes = ["Node 1", "Node 2", "Node 3", "Node 4", "Node 5"];

  return (
    <div style={{ padding: "24px", borderRadius: 14, background: SURFACE, border: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: VERY_MUTED }}>
          Chainlink Oracle
        </p>
        <motion.span
          animate={{
            background: phase >= 4 ? `rgba(74,222,128,0.12)` : phase >= 1 ? `rgba(255,255,255,0.06)` : `rgba(255,255,255,0.03)`,
            color: phase >= 4 ? SUCCESS : phase >= 1 ? MUTED : VERY_MUTED,
          }}
          style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, border: `1px solid transparent` }}
        >
          {phase === 0 && "Waiting"}
          {phase === 1 && "Requesting API..."}
          {phase === 2 && "Nodes verifying..."}
          {phase === 3 && "Consensus reached"}
          {phase >= 4 && "✓ Verified · Payout released"}
        </motion.span>
      </div>

      {/* Nodes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 16 }}>
        {nodes.map((node, i) => (
          <motion.div
            key={node}
            animate={{
              background: phase >= 2 ? `rgba(255,255,255,0.06)` : SURFACE2,
              borderColor: phase >= 2 ? `rgba(255,255,255,0.2)` : BORDER,
            }}
            transition={{ delay: i * 0.1 }}
            style={{
              padding: "8px 4px", borderRadius: 8, border: `1px solid ${BORDER}`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}
          >
            <motion.div
              animate={{
                background: phase >= 3 ? WHITE : phase >= 2 ? `rgba(255,255,255,0.4)` : VERY_MUTED,
                boxShadow: phase >= 3 ? `0 0 8px rgba(255,255,255,0.4)` : "none",
              }}
              transition={{ delay: i * 0.1 }}
              style={{ width: 6, height: 6, borderRadius: "50%" }}
            />
            <span style={{ fontSize: 9, color: VERY_MUTED }}>{node}</span>
          </motion.div>
        ))}
      </div>

      {/* Result */}
      <div style={{ padding: "12px 14px", borderRadius: 10, background: SURFACE2, border: `1px solid ${BORDER}`, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: VERY_MUTED }}>YouTube API result</span>
          <span style={{ fontSize: 10, color: VERY_MUTED, fontFamily: "monospace" }}>views · milestone 1</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <motion.span
            animate={{ color: phase >= 3 ? WHITE : MUTED }}
            style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", letterSpacing: -1 }}
          >
            52,341
          </motion.span>
          <span style={{ fontSize: 12, color: VERY_MUTED }}>views</span>
          {phase >= 3 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                marginLeft: "auto", fontSize: 10, fontWeight: 700,
                padding: "2px 8px", borderRadius: 4,
                background: `rgba(74,222,128,0.12)`, color: SUCCESS,
              }}
            >
              ≥ 50k ✓
            </motion.span>
          )}
        </div>
        <div style={{ marginTop: 8, height: 2, background: BORDER, borderRadius: 1, overflow: "hidden" }}>
          <motion.div
            animate={{ width: phase >= 1 ? "100%" : "0%" }}
            transition={{ duration: 1, delay: 0.3 }}
            style={{ height: "100%", background: WHITE, borderRadius: 1 }}
          />
        </div>
        <p style={{ fontSize: 9, color: VERY_MUTED, marginTop: 4 }}>Threshold: 50,000 views</p>
      </div>

      {/* Payout */}
      <AnimatePresence>
        {phase >= 4 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              padding: "10px 12px", borderRadius: 8,
              background: `rgba(74,222,128,0.04)`,
              border: `1px solid rgba(74,222,128,0.2)`,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: SUCCESS }}>Payout released automatically</p>
            <p style={{ fontSize: 10, color: VERY_MUTED, marginTop: 2 }}>
              500 USDC → 0x71C7...8Fa3 · Reputation token #1 minted
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// TYPEWRITER
// ─────────────────────────────────────────────
function Typewriter({ phrases }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const current = phrases[idx];
    if (typing) {
      if (text.length < current.length) {
        const t = setTimeout(() => setText(current.slice(0, text.length + 1)), 55);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setTyping(false), 2000);
        return () => clearTimeout(t);
      }
    } else {
      if (text.length > 0) {
        const t = setTimeout(() => setText(text.slice(0, -1)), 30);
        return () => clearTimeout(t);
      } else {
        setIdx((i) => (i + 1) % phrases.length);
        setTyping(true);
      }
    }
  }, [text, typing, idx]);

  return (
    <span style={{ color: MUTED, fontWeight: 500 }}>
      {text}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        style={{ color: WHITE, marginLeft: 1 }}
      >|</motion.span>
    </span>
  );
}

// ─────────────────────────────────────────────
// HORIZONTAL SCROLL
// ─────────────────────────────────────────────
function HorizontalScroll({ children }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["0%", "-62%"]);

  return (
    <div ref={ref} style={{ height: "280vh", position: "relative" }}>
      <div style={{ position: "sticky", top: 0, overflow: "hidden", height: "100vh", display: "flex", alignItems: "center" }}>
        <motion.div style={{ x, display: "flex", gap: "1.5rem", paddingLeft: "8vw", paddingRight: "4vw" }}>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TERMINAL LOG
// ─────────────────────────────────────────────
function TerminalLog() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [lines, setLines] = useState([]);

  const LOG = [
    { text: "$ influencity deploy --network polygon-amoy", color: VERY_MUTED },
    { text: "  Compiling contracts...", color: VERY_MUTED },
    { text: "  ✓ CampaignFactory deployed → 0xA3f7...8B2c", color: MUTED },
    { text: "  ✓ ReputationToken deployed → 0xF2c1...4A9d", color: MUTED },
    { text: "$ influencity campaign create --brief ipfs/bafybei...XYZ", color: VERY_MUTED },
    { text: "  ✓ CampaignEscrow deployed → 0x9Bc3...2D5e", color: MUTED },
    { text: "  ✓ 1500 USDC locked · 3 milestones set", color: MUTED },
    { text: "$ chainlink verify --campaign 1 --milestone 0", color: VERY_MUTED },
    { text: "  oracle → YouTube API → 52,341 views", color: MUTED },
    { text: "  consensus: 5/5 nodes agreed", color: MUTED },
    { text: "  ✓ threshold met · releasing 500 USDC", color: WHITE },
    { text: "  ✓ tx confirmed · reputation token minted", color: SUCCESS },
    { text: "  █", color: WHITE },
  ];

  useEffect(() => {
    if (!inView) return;
    LOG.forEach((line, i) => {
      setTimeout(() => setLines((prev) => [...prev, line]), i * 180);
    });
  }, [inView]);

  return (
    <div
      ref={ref}
      style={{
        padding: 20, borderRadius: 12,
        background: "#050505",
        border: `1px solid ${BORDER}`,
        fontFamily: "monospace",
        minHeight: 260,
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["#333", "#333", "#333"].map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ fontSize: 11, color: VERY_MUTED, marginLeft: 8 }}>influencity-cli</span>
      </div>
      {lines.map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          style={{ fontSize: 11, color: line.color, lineHeight: 1.7 }}
        >
          {line.text}
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// FEATURE CARD
// ─────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, delay = 0 }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Reveal delay={delay}>
      <motion.div
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        whileHover={{ y: -5 }}
        style={{
          padding: "24px",
          borderRadius: 14,
          background: hovered ? SURFACE2 : SURFACE,
          border: `1px solid ${hovered ? BORDER2 : BORDER}`,
          transition: "background 0.2s, border-color 0.2s",
          cursor: "default",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <motion.div
          animate={{ opacity: hovered ? 1 : 0 }}
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.025), transparent 60%)",
          }}
        />
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${hovered ? BORDER2 : BORDER}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16, transition: "all 0.2s",
        }}>
          <Icon size={16} style={{ color: hovered ? WHITE : MUTED }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{title}</p>
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.65 }}>{desc}</p>
        <motion.div
          animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -4 }}
          style={{ position: "absolute", bottom: 20, right: 20 }}
        >
          <ArrowRight size={13} style={{ color: MUTED }} />
        </motion.div>
      </motion.div>
    </Reveal>
  );
}

// ─────────────────────────────────────────────
// TIMELINE STEP (how it works)
// ─────────────────────────────────────────────
function Step({ step, title, desc, icon: Icon, isLast, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} style={{ display: "flex", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={inView ? { scale: 1, opacity: 1 } : {}}
          transition={{ delay: index * 0.12, duration: 0.35, type: "spring", stiffness: 350 }}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: SURFACE2,
            border: `1px solid ${BORDER2}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1, position: "relative",
          }}
        >
          <Icon size={15} style={{ color: MUTED }} />
        </motion.div>
        {!isLast && (
          <motion.div
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ delay: index * 0.12 + 0.25, duration: 0.5 }}
            style={{
              width: 1, flex: 1, minHeight: 40,
              background: `linear-gradient(to bottom, ${BORDER2}, transparent)`,
              transformOrigin: "top",
              marginTop: 4,
            }}
          />
        )}
      </div>
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: index * 0.12 + 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ paddingBottom: 36 }}
      >
        <span style={{ fontSize: 10, color: VERY_MUTED, fontFamily: "monospace", display: "block", marginBottom: 6 }}>
          {step}
        </span>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: TEXT, marginBottom: 8, letterSpacing: -0.3 }}>{title}</h3>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>{desc}</p>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function Landing() {
  const { isConnected } = useAccount();
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const [introComplete, setIntroComplete] = useState(false);

  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(heroScroll, [0, 0.7], [1, 0]);
  const heroY = useTransform(heroScroll, [0, 1], [0, -80]);
  const smoothY = useSpring(heroY, { damping: 20, stiffness: 120 });

  return (
    <div style={{ background: BG, color: TEXT, minHeight: "100vh", overflowX: "hidden" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>

      {/* Logo intro */}
      {!introComplete && <LogoIntro onComplete={() => setIntroComplete(true)} />}

      <CursorGlow />

      {/* Navbar — only shows after intro */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: introComplete ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      >
        <Navbar />
      </motion.div>

      {/* ══ HERO ══ */}
      <section
        ref={heroRef}
        style={{
          minHeight: "100vh",
          position: "relative",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        {/* Background */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)",
            width: 700, height: 400,
            background: "radial-gradient(ellipse, rgba(255,255,255,0.025) 0%, transparent 65%)",
            borderRadius: "50%",
          }} />
          <div style={{
            position: "absolute", inset: 0, opacity: 0.018,
            backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }} />
          {/* Scanline */}
          <motion.div
            style={{
              position: "absolute", left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)`,
            }}
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
          />
          <Particles />
        </div>

        <motion.div
          style={{ y: smoothY, opacity: heroOpacity, position: "relative", zIndex: 1, width: "100%", maxWidth: 1200, margin: "0 auto", padding: "100px 24px 60px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>

            {/* Left */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: introComplete ? 1 : 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: introComplete ? 1 : 0, y: introComplete ? 0 : 10 }}
                transition={{ delay: 0.3 }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "5px 14px", borderRadius: 100,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${BORDER2}`,
                  marginBottom: 28,
                }}
              >
                <motion.div
                  style={{ width: 5, height: 5, borderRadius: "50%", background: SUCCESS }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span style={{ fontSize: 11, color: MUTED }}>Live on Polygon Amoy · Chainlink · IPFS</span>
              </motion.div>

              {/* Headline */}
              <div style={{ marginBottom: 20, overflow: "hidden" }}>
                {["Influencer", "Sponsorships,", "Trustlessly."].map((word, i) => (
                  <div key={word} style={{ overflow: "hidden" }}>
                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: introComplete ? "0%" : "100%" }}
                      transition={{ duration: 0.7, delay: 0.35 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        fontSize: 72, fontWeight: 900, lineHeight: 1,
                        letterSpacing: -3, color: i === 1 ? WHITE : TEXT,
                        opacity: i === 2 ? 0.4 : 1,
                      }}
                    >
                      {word}
                    </motion.div>
                  </div>
                ))}
              </div>

              {/* Typewriter */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: introComplete ? 1 : 0 }}
                transition={{ delay: 0.8 }}
                style={{ height: 26, marginBottom: 24, fontSize: 17 }}
              >
                <Typewriter phrases={[
                  "No trust required.",
                  "No middlemen.",
                  "No disputes.",
                  "Just verified code.",
                ]} />
              </motion.div>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: introComplete ? 1 : 0 }}
                transition={{ delay: 0.85 }}
                style={{ fontSize: 15, color: MUTED, lineHeight: 1.75, marginBottom: 32, maxWidth: 440 }}
              >
                Smart contract escrow locks campaign funds. Chainlink oracles verify real
                platform metrics on-chain. Payments release{" "}
                <span style={{ color: TEXT, fontWeight: 600 }}>automatically</span> when
                milestones are hit — zero humans in the loop.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: introComplete ? 1 : 0, y: introComplete ? 0 : 12 }}
                transition={{ delay: 0.9 }}
                style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}
              >
                {isConnected ? (
                  <motion.button
                    whileHover={{ scale: 1.02, background: "#e5e5e5" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate("/dashboard")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "12px 24px", borderRadius: 10,
                      background: WHITE, color: "#000",
                      fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer",
                    }}
                  >
                    Open Dashboard <ArrowRight size={15} />
                  </motion.button>
                ) : (
                  <RainbowConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <motion.button
                        whileHover={{ scale: 1.02, background: "#e5e5e5" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={openConnectModal}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "12px 24px", borderRadius: 10,
                          background: WHITE, color: "#000",
                          fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer",
                        }}
                      >
                        Connect Wallet <ArrowRight size={15} />
                      </motion.button>
                    )}
                  </RainbowConnectButton.Custom>
                )}
                <motion.button
                  whileHover={{ scale: 1.02, borderColor: BORDER2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "12px 24px", borderRadius: 10,
                    background: "transparent", color: MUTED,
                    fontWeight: 600, fontSize: 14,
                    border: `1px solid ${BORDER}`, cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  How it works
                </motion.button>
              </motion.div>

              {/* Trust signals */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: introComplete ? 1 : 0 }}
                transition={{ delay: 1 }}
                style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
              >
                {["0% fees", "Non-custodial", "Open source", "Audited contracts"].map((t) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle size={11} style={{ color: VERY_MUTED }} />
                    <span style={{ fontSize: 11, color: VERY_MUTED }}>{t}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right — Deal flow timeline */}
            <motion.div
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: introComplete ? 1 : 0, x: introComplete ? 0 : 32 }}
              transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <DealFlowTimeline />
            </motion.div>

          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)" }}
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, color: VERY_MUTED, letterSpacing: 2, textTransform: "uppercase" }}>Scroll</span>
            <div style={{ width: 1, height: 28, background: `linear-gradient(to bottom, ${VERY_MUTED}, transparent)` }} />
          </div>
        </motion.div>
      </section>

      {/* ══ MARQUEE ══ */}
      <div style={{ padding: "16px 0", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, overflow: "hidden" }}>
        <Marquee items={[
          "Smart Contract Escrow", "Chainlink Oracle Verification", "IPFS Content Proofs",
          "Soulbound Reputation Tokens", "Zero Platform Fees", "Automatic Payouts",
          "YouTube · Twitch · LinkedIn", "Non-Custodial", "Polygon PoS", "Filecoin Storage",
        ]} speed={38} />
      </div>

      {/* ══ STATS ══ */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: BORDER, borderRadius: 14, overflow: "hidden" }}>
          {[
            { to: 0, suffix: "%", label: "Platform fee", desc: "We take nothing" },
            { to: 100, suffix: "%", label: "On-chain verified", desc: "Real API metrics" },
            { to: 3, suffix: "", label: "Platforms in V1", desc: "YT · Twitch · LinkedIn" },
            { to: 1, prefix: "<", suffix: "s", label: "Avg payout speed", desc: "Instant on threshold" },
          ].map(({ to, suffix, label, desc, prefix = "" }, i) => (
            <motion.div
              key={label}
              whileHover={{ background: SURFACE2 }}
              style={{ padding: "40px 28px", background: BG, textAlign: "center", cursor: "default" }}
            >
              <div style={{ fontSize: 44, fontWeight: 900, color: WHITE, letterSpacing: -2, fontFamily: "monospace", marginBottom: 6 }}>
                <Counter to={to} prefix={prefix} suffix={suffix} />
              </div>
              <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: VERY_MUTED }}>{desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section id="how-it-works" style={{ padding: "60px 24px 80px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>

          {/* Left sticky */}
          <div style={{ position: "sticky", top: 100 }}>
            <Reveal>
              <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }}>
                How it works
              </p>
              <h2 style={{ fontSize: 44, fontWeight: 900, color: TEXT, letterSpacing: -2, lineHeight: 1.05, marginBottom: 20 }}>
                Deal to payout.<br />
                <span style={{ color: VERY_MUTED }}>Entirely on-chain.</span>
              </h2>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.75, marginBottom: 32 }}>
                No emails. No invoices. No payment processors.
                Smart contracts execute exactly when on-chain conditions are met.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <OracleLoop />
            </Reveal>
          </div>

          {/* Right steps */}
          <div style={{ paddingTop: 8 }}>
            {[
              { step: "01 ·", icon: Lock, title: "Brand deposits into escrow", desc: "USDC locked into an isolated CampaignEscrow smart contract. Funds are cryptographically locked — no unilateral access by brand, creator, or Influencity." },
              { step: "02 ·", icon: Globe, title: "Creator delivers and submits proof", desc: "Creator posts content and submits cryptographic proof via IPFS. The CID is permanently and immutably written to the contract." },
              { step: "03 ·", icon: Activity, title: "Chainlink verifies in real time", desc: "Chainlink Functions nodes independently fetch real API data from YouTube, Twitch, or LinkedIn. They reach consensus without any human entering numbers." },
              { step: "04 ·", icon: Coins, title: "Funds release — no human needed", desc: "Threshold met → instant USDC payout + soulbound reputation token minted. Threshold missed → funds returned to brand. Fully automatic." },
            ].map((step, i) => (
              <Step key={step.step} {...step} isLast={i === 3} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ HORIZONTAL SCROLL ══ */}
      <section style={{ borderTop: `1px solid ${BORDER}` }}>
        <div style={{ padding: "60px 0 0 8vw" }}>
          <Reveal>
            <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>
              On-chain audit trail
            </p>
            <p style={{ fontSize: 32, fontWeight: 900, color: TEXT, letterSpacing: -1.5, marginBottom: 6 }}>
              Every action. Permanently recorded.
            </p>
            <p style={{ fontSize: 13, color: VERY_MUTED, marginBottom: 32 }}>Scroll to explore →</p>
          </Reveal>
        </div>
        <HorizontalScroll>
          {[
            {
              title: "Campaign deployed",
              time: "Jan 15, 2026 · 14:23 UTC",
              lines: [
                { k: "contract", v: "0xA3f7...8B2c" },
                { k: "brand", v: "0x44aB...2C19" },
                { k: "creator", v: "0x71C7...8Fa3" },
                { k: "usdc locked", v: "1,500.00" },
                { k: "milestones", v: "3" },
                { k: "brief", v: "ipfs/bafybei...XYZ" },
              ],
            },
            {
              title: "Proof submitted",
              time: "Jan 16, 2026 · 09:11 UTC",
              lines: [
                { k: "milestone", v: "#0" },
                { k: "platform", v: "YouTube" },
                { k: "content id", v: "dQw4w9WgXcQ" },
                { k: "proof cid", v: "ipfs/bafybeic...ABC" },
                { k: "submitted by", v: "0x71C7...8Fa3" },
                { k: "status", v: "pending verification" },
              ],
              highlight: false,
            },
            {
              title: "Oracle verified",
              time: "Jan 16, 2026 · 15:44 UTC",
              lines: [
                { k: "chainlink nodes", v: "5 / 5 agreed" },
                { k: "api called", v: "YouTube Data v3" },
                { k: "reported value", v: "52,341 views" },
                { k: "threshold", v: "50,000 views" },
                { k: "result", v: "✓ THRESHOLD MET" },
                { k: "tx hash", v: "0xab3f...C891" },
              ],
              success: true,
            },
            {
              title: "Payout released",
              time: "Jan 16, 2026 · 15:44 UTC",
              lines: [
                { k: "amount", v: "500.00 USDC" },
                { k: "recipient", v: "0x71C7...8Fa3" },
                { k: "token minted", v: "IREP #1" },
                { k: "campaign id", v: "1" },
                { k: "milestone", v: "#0 → MET" },
                { k: "block", v: "12,847,329" },
              ],
              success: true,
            },
            {
              title: "Reputation minted",
              time: "Jan 16, 2026 · 15:44 UTC",
              lines: [
                { k: "token id", v: "keccak256(1,0)" },
                { k: "standard", v: "ERC-1155" },
                { k: "transferable", v: "false (soulbound)" },
                { k: "metadata", v: "ipfs/bafybeimeta...XYZ" },
                { k: "campaign", v: "TechReview Q2" },
                { k: "metric achieved", v: "52,341 views" },
              ],
            },
          ].map((block, i) => (
            <Reveal key={block.title} delay={i * 0.05}>
              <motion.div
                whileHover={{ y: -6, borderColor: BORDER2 }}
                style={{
                  width: 300, padding: 20, borderRadius: 14,
                  background: block.success ? `rgba(74,222,128,0.02)` : SURFACE,
                  border: `1px solid ${block.success ? "rgba(74,222,128,0.15)" : BORDER}`,
                  flexShrink: 0,
                  transition: "border-color 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: block.success ? SUCCESS : TEXT }}>{block.title}</p>
                  {block.success && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: `rgba(74,222,128,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCircle size={10} style={{ color: SUCCESS }} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {block.lines.map(({ k, v }) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 10, color: VERY_MUTED, textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>{k}</span>
                      <span style={{ fontSize: 10, color: v.includes("✓") ? SUCCESS : MUTED, fontFamily: "monospace", textAlign: "right", wordBreak: "break-all" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 9, color: VERY_MUTED, marginTop: 14, fontFamily: "monospace" }}>{block.time}</p>
              </motion.div>
            </Reveal>
          ))}
        </HorizontalScroll>
      </section>

      {/* ══ FEATURES ══ */}
      <section style={{ padding: "80px 24px", maxWidth: 1200, margin: "0 auto", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
          <div>
            <Reveal>
              <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>
                Built different
              </p>
              <h2 style={{ fontSize: 40, fontWeight: 900, color: TEXT, letterSpacing: -1.5, lineHeight: 1.05 }}>
                Everything the industry<br />refused to build
              </h2>
            </Reveal>
          </div>
          <Reveal direction="left">
            <p style={{ fontSize: 13, color: MUTED, maxWidth: 260, lineHeight: 1.7, textAlign: "right" }}>
              Six primitives that make trustless influencer campaigns possible for the first time.
            </p>
          </Reveal>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <FeatureCard icon={Lock} title="Isolated escrow per campaign" desc="Each campaign deploys its own CampaignEscrow contract. A bug or dispute in one campaign is completely isolated from all others." delay={0} />
          <FeatureCard icon={BarChart3} title="Oracle-verified metrics" desc="Chainlink nodes independently fetch real YouTube, Twitch, and LinkedIn API data. Not self-reported. Not fakeable." delay={0.06} />
          <FeatureCard icon={Star} title="Soulbound reputation tokens" desc="Every milestone mints a non-transferable ERC-1155 token to the creator wallet. Impossible to fake. Permanent track record." delay={0.12} />
          <FeatureCard icon={Database} title="IPFS + Filecoin storage" desc="Campaign briefs and content proofs stored with cryptographic receipts. Immutable. Not just a link — verifiable forever." delay={0.18} />
          <FeatureCard icon={Cpu} title="Chainlink Automation" desc="Metric checks trigger on schedule without manual calls. Fully trustless payout loop — no cron job, no human." delay={0.24} />
          <FeatureCard icon={Layers} title="B2B LinkedIn campaigns" desc="First protocol to support LinkedIn thought-leadership on-chain. Completely underserved — no other protocol touches it." delay={0.30} />
        </div>
      </section>

      {/* ══ TERMINAL ══ */}
      <section style={{ padding: "60px 24px 80px", maxWidth: 1200, margin: "0 auto", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <Reveal>
              <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }}>
                Developer first
              </p>
              <h2 style={{ fontSize: 40, fontWeight: 900, color: TEXT, letterSpacing: -1.5, lineHeight: 1.05, marginBottom: 20 }}>
                Deploy in minutes.<br />
                <span style={{ color: VERY_MUTED }}>Not weeks.</span>
              </h2>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.75, marginBottom: 28 }}>
                Influencity ships with a full CLI, smart contract SDK, and REST API.
                Create a campaign, set milestones, and deploy escrow — all from the terminal.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon: Shield, text: "OpenZeppelin-based contracts with full test suite" },
                  { icon: Activity, text: "Hardhat deployment scripts for Polygon + Polygon Amoy" },
                  { icon: Globe, text: "REST API for all campaign and proof operations" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: SURFACE2, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <Icon size={11} style={{ color: MUTED }} />
                    </div>
                    <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{text}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
          <Reveal direction="left">
            <TerminalLog />
          </Reveal>
        </div>
      </section>

      {/* ══ FOR BRANDS / CREATORS ══ */}
      <section style={{ padding: "60px 24px 80px", maxWidth: 1200, margin: "0 auto", borderTop: `1px solid ${BORDER}` }}>
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>
            Two sides. One protocol.
          </p>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: TEXT, letterSpacing: -1.5 }}>
            Built for both sides of the deal
          </h2>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              role: "For Brands",
              headline: "Pay for results.\nNot promises.",
              desc: "Set milestones with real numeric thresholds. Your budget stays locked until verified metrics hit. If a creator underdelivers — you get it back automatically.",
              points: [
                "Define milestones: 50k views, 500 clicks, 10k followers",
                "Chainlink fetches real API data — no creator can inflate",
                "Automatic refund if milestones aren't met on time",
                "IPFS brief creates an immutable record of agreed terms",
              ],
            },
            {
              role: "For Creators",
              headline: "Get paid instantly.\nBuild your record.",
              desc: "Funds are locked before you start. The moment you hit a milestone, USDC hits your wallet — no invoice, no waiting, no ghosting.",
              points: [
                "Funds locked on-chain before you publish anything",
                "Instant USDC payout the moment threshold is oracle-verified",
                "Soulbound tokens build your permanent on-chain track record",
                "Smart contracts don't ghost — earnings are mathematically certain",
              ],
            },
          ].map(({ role, headline, desc, points }, si) => (
            <Reveal key={role} direction={si === 0 ? "right" : "left"}>
              <motion.div
                whileHover={{ y: -6, borderColor: BORDER2 }}
                style={{
                  padding: 36, borderRadius: 16,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  height: "100%",
                  transition: "border-color 0.2s",
                  position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  position: "absolute", top: -60, right: -60,
                  width: 180, height: 180, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(255,255,255,0.02), transparent)",
                }} />
                <div style={{
                  display: "inline-block", padding: "4px 12px", borderRadius: 100,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER2}`,
                  fontSize: 11, color: MUTED, fontWeight: 600, marginBottom: 20,
                }}>
                  {role}
                </div>
                <h3 style={{ fontSize: 26, fontWeight: 900, color: TEXT, letterSpacing: -0.5, lineHeight: 1.15, marginBottom: 16, whiteSpace: "pre-line" }}>
                  {headline}
                </h3>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: 24 }}>{desc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {points.map((p) => (
                    <motion.div key={p} whileHover={{ x: 3 }} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <ChevronRight size={13} style={{ color: VERY_MUTED, flexShrink: 0, marginTop: 3 }} />
                      <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>{p}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ PROBLEM vs SOLUTION ══ */}
      <section style={{ padding: "60px 24px 80px", maxWidth: 1200, margin: "0 auto", borderTop: `1px solid ${BORDER}` }}>
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>
            The case for Influencity
          </p>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: TEXT, letterSpacing: -1.5 }}>
            The industry is broken on both sides
          </h2>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              label: "Today's reality", color: DANGER, bg: "rgba(248,113,113,0.03)", borderColor: "rgba(248,113,113,0.12)",
              items: [
                { t: "Brands pay upfront with zero guarantee", d: "No recourse if creators underdeliver or disappear." },
                { t: "Creators get ghosted on payments", d: "Disputes over vague contracts no one can enforce." },
                { t: "Fake follower counts inflate media kits", d: "No way to verify numbers without trusting the creator." },
                { t: "Metric disputes with no resolution", d: "He said, she said. No authoritative source of truth." },
                { t: "No on-chain delivery record", d: "One bad campaign wipes out all your credibility." },
              ],
            },
            {
              label: "With Influencity", color: SUCCESS, bg: "rgba(74,222,128,0.03)", borderColor: "rgba(74,222,128,0.12)",
              items: [
                { t: "Contract holds funds — no unilateral access", d: "Neither party can move funds. The contract decides." },
                { t: "Automatic payouts on verified milestones", d: "Threshold met → USDC in wallet. No approval needed." },
                { t: "Oracle fetches real API data directly", d: "Chainlink nodes call YouTube, Twitch, LinkedIn APIs." },
                { t: "Every delivery recorded on-chain forever", d: "Cryptographic proof. No disputes. Permanent." },
                { t: "Soulbound reputation history", d: "Non-transferable tokens prove your track record." },
              ],
            },
          ].map(({ label, color, bg, borderColor, items }) => (
            <Reveal key={label}>
              <div style={{ padding: 32, borderRadius: 14, background: bg, border: `1px solid ${borderColor}` }}>
                <p style={{ fontSize: 14, fontWeight: 800, color, marginBottom: 24 }}>{label}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {items.map(({ t, d }) => (
                    <motion.div key={t} whileHover={{ x: 3 }} style={{ display: "flex", gap: 12 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                        background: `${color}15`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: 8, color }}>{color === DANGER ? "✕" : "✓"}</span>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{t}</p>
                        <p style={{ fontSize: 11, color: VERY_MUTED, lineHeight: 1.5 }}>{d}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ TECH TRUST BAR ══ */}
      <section style={{ padding: "48px 24px", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <Reveal>
          <p style={{ fontSize: 10, color: VERY_MUTED, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", marginBottom: 28, textAlign: "center" }}>
            Built on
          </p>
        </Reveal>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 900, margin: "0 auto" }}>
          {[
            { name: "Polygon", desc: "PoS sidechain" },
            { name: "Chainlink Functions", desc: "Oracle network" },
            { name: "Chainlink Automation", desc: "Trustless scheduling" },
            { name: "IPFS + Filecoin", desc: "Storage proofs" },
            { name: "OpenZeppelin", desc: "Contract security" },
            { name: "Wagmi + Viem", desc: "Web3 frontend" },
            { name: "RainbowKit", desc: "Wallet UX" },
            { name: "Supabase", desc: "Off-chain data" },
          ].map(({ name, desc }, i) => (
            <Reveal key={name} delay={i * 0.04}>
              <motion.div
                whileHover={{ y: -4, borderColor: BORDER2 }}
                style={{
                  padding: "9px 16px", borderRadius: 9,
                  background: SURFACE, border: `1px solid ${BORDER}`,
                  transition: "border-color 0.15s", cursor: "default",
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 1 }}>{name}</p>
                <p style={{ fontSize: 10, color: VERY_MUTED }}>{desc}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ SECOND MARQUEE ══ */}
      <div style={{ padding: "14px 0", overflow: "hidden", borderBottom: `1px solid ${BORDER}` }}>
        <Marquee items={[
          "Milestone-based payouts", "Automated escrow release", "Soulbound ERC-1155",
          "On-chain reputation", "Decentralised verification", "Creator economy",
          "Zero trust required", "B2B LinkedIn campaigns", "UCAN auth",
        ]} speed={28} reverse />
      </div>

      {/* ══ FINAL CTA ══ */}
      <section style={{ padding: "120px 24px", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <motion.div
            style={{ position: "absolute", bottom: -60, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(255,255,255,0.02) 0%, transparent 65%)", borderRadius: "50%" }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
          <Particles />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 640, margin: "0 auto" }}>
          <Reveal>
            {/* Hex mark — large */}
            <motion.div
              animate={{ rotate: [0, 6, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              style={{ display: "inline-flex", marginBottom: 32 }}
            >
              <svg width="56" height="56" viewBox="0 0 36 36" fill="none">
                <polygon points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5" stroke="white" strokeWidth="1.5" fill="none" />
                <polygon points="18,10 25,14.5 25,21.5 18,26 11,21.5 11,14.5" fill="white" opacity="0.06" stroke="white" strokeWidth="0.75" />
                <circle cx="18" cy="18" r="3.5" fill="white" />
                {[{ id: "v1", x: 18, y: 3 }, { id: "v2", x: 31, y: 10.5 }, { id: "v3", x: 31, y: 25.5 }, { id: "v4", x: 18, y: 33 }, { id: "v5", x: 5, y: 25.5 }, { id: "v6", x: 5, y: 10.5 }].map(({ id, x, y }) => (
                  <circle key={id} cx={x} cy={y} r="1.5" fill="white" opacity="0.6" />
                ))}
              </svg>
            </motion.div>
          </Reveal>

          <div style={{ overflow: "hidden", marginBottom: 20 }}>
            {["Stop trusting.", "Start verifying."].map((line, i) => (
              <div key={line} style={{ overflow: "hidden" }}>
                <Reveal delay={i * 0.1}>
                  <p style={{
                    fontSize: 64, fontWeight: 900, lineHeight: 1,
                    letterSpacing: -3, color: i === 0 ? TEXT : MUTED,
                  }}>
                    {line}
                  </p>
                </Reveal>
              </div>
            ))}
          </div>

          <Reveal delay={0.2}>
            <p style={{ fontSize: 16, color: MUTED, marginBottom: 36, lineHeight: 1.7 }}>
              Connect your wallet. Create your first campaign in minutes.
              No registration. No API keys. Just your wallet.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              {isConnected ? (
                <motion.button
                  whileHover={{ scale: 1.03, background: "#e5e5e5" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate("/dashboard")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    padding: "14px 32px", borderRadius: 12,
                    background: WHITE, color: "#000", fontWeight: 800, fontSize: 15,
                    border: "none", cursor: "pointer",
                  }}
                >
                  Open Dashboard <ArrowRight size={18} />
                </motion.button>
              ) : (
                <RainbowConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <motion.button
                      whileHover={{ scale: 1.03, background: "#e5e5e5" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={openConnectModal}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 10,
                        padding: "14px 32px", borderRadius: 12,
                        background: WHITE, color: "#000", fontWeight: 800, fontSize: 15,
                        border: "none", cursor: "pointer",
                      }}
                    >
                      Connect Wallet & Launch <ArrowRight size={18} />
                    </motion.button>
                  )}
                </RainbowConnectButton.Custom>
              )}
            </div>
            <p style={{ fontSize: 11, color: VERY_MUTED }}>
              Non-custodial · Open source · Zero platform fees
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ padding: "24px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              <polygon points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="18" cy="18" r="3" fill="white" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Influencity</span>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {["Polygon", "Chainlink Functions", "IPFS + Filecoin", "OpenZeppelin"].map((t) => (
              <span key={t} style={{ fontSize: 11, color: VERY_MUTED }}>{t}</span>
            ))}
          </div>
          
        </div>
      </footer>
    </div>
  );
}