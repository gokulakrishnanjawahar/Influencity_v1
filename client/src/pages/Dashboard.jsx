import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import {
  Plus, TrendingUp, Lock, CheckCircle,
  XCircle, Clock, ArrowRight, BarChart3,
  Wallet, ExternalLink, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import PageLayout, { PageHeader, Section } from "@/components/layout/PageLayout";
import WalletGuard from "@/components/wallet/WalletGuard";
import StatusBadge from "@/components/shared/StatusBadge";
import PlatformIcon from "@/components/shared/PlatformIcon";
import LoadingSpinner, { PageLoader } from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { useCampaigns, useMyApplications } from "@/hooks/useCampaign";
import { useReputation } from "@/hooks/useReputation";
import { useSIWE } from "@/components/wallet/SIWEProvider";
import { truncateAddress, formatUSDC, formatDeadline } from "@/lib/utils";
import TestnetFaucet from "@/components/shared/TestnetFaucet";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────
const BG = "#080808";
const SURFACE = "#111111";
const SURFACE2 = "#161616";
const BORDER = "#1f1f1f";
const BORDER2 = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#888888";
const VERY_MUTED = "#444444";
const SUCCESS = "#4ade80";
const DANGER = "#f87171";
const WARNING = "#fb923c";

// ─────────────────────────────────────────────
// MOCK CHART DATA (replaced with real data post-deployment)
// ─────────────────────────────────────────────
const MOCK_EARNINGS = [
  { month: "Oct", amount: 0 },
  { month: "Nov", amount: 800 },
  { month: "Dec", amount: 1200 },
  { month: "Jan", amount: 500 },
  { month: "Feb", amount: 2400 },
  { month: "Mar", amount: 1800 },
];

// ─────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, trend, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: "20px 24px",
        borderRadius: 12,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>{label}</p>
        {Icon && (
          <div style={{ width: 28, height: 28, borderRadius: 7, background: SURFACE2, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={13} style={{ color: MUTED }} />
          </div>
        )}
      </div>
      <p style={{ fontSize: "clamp(24px, 2.33vw, 28px)", fontWeight: 900, color: TEXT, letterSpacing: -1, fontFamily: "monospace", marginBottom: 4 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: trend === "up" ? SUCCESS : trend === "down" ? DANGER : VERY_MUTED }}>
          {sub}
        </p>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// CAMPAIGN ROW
// ─────────────────────────────────────────────
function CampaignRow({ campaign, role, index }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const milestones = campaign.milestones || [];
  const metMilestones = milestones.filter((m) => m.status === "met").length;
  const progress = milestones.length > 0
    ? Math.round((metMilestones / milestones.length) * 100)
    : 0;

  const totalTranche = milestones.reduce((sum, m) => sum + parseFloat(m.tranche_usdc || 0), 0);
  const released = parseFloat(campaign.total_released_usdc || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/campaigns/${campaign.contract_address || campaign.id}`)}
      style={{
        padding: "16px 20px",
        borderRadius: 12,
        background: hovered ? SURFACE2 : SURFACE,
        border: `1px solid ${hovered ? BORDER2 : BORDER}`,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      className="r-row"
    >
      {/* Campaign info */}
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {campaign.title || "Untitled Campaign"}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ fontSize: 11, color: VERY_MUTED, fontFamily: "monospace" }}>
            {campaign.contract_address
              ? truncateAddress(campaign.contract_address)
              : `ID: ${campaign.campaign_id_onchain || campaign.id?.slice(0, 8)}`}
          </p>
          {role === "brand" && (
            <p style={{ fontSize: 11, color: VERY_MUTED }}>
              Creator: {truncateAddress(campaign.creator_address)}
            </p>
          )}
          {role === "creator" && (
            <p style={{ fontSize: 11, color: VERY_MUTED }}>
              Brand: {truncateAddress(campaign.brand_address)}
            </p>
          )}
        </div>
      </div>

      {/* Platforms */}
      <div style={{ display: "flex", gap: 4 }}>
        {[...new Set(milestones.map((m) => m.platform))].map((platform) => (
          <PlatformIcon key={platform} platform={platform} size="sm" />
        ))}
      </div>

      {/* Progress */}
      <div className="r-row-wide" style={{ width: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: VERY_MUTED }}>{metMilestones}/{milestones.length} milestones</span>
          <span style={{ fontSize: 10, color: MUTED }}>{progress}%</span>
        </div>
        <div style={{ height: 3, background: BORDER, borderRadius: 2, overflow: "hidden" }}>
          <motion.div
            style={{ height: "100%", background: progress === 100 ? SUCCESS : TEXT, borderRadius: 2 }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, delay: index * 0.06 + 0.3 }}
          />
        </div>
      </div>

      {/* Amount */}
      <div className="r-row-start" style={{ textAlign: "right" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>
          ${formatUSDC(campaign.total_deposit_usdc)}
        </p>
        <p style={{ fontSize: 10, color: VERY_MUTED }}>locked</p>
      </div>

      {/* Status + arrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusBadge status={campaign.status} />
        <motion.div animate={{ x: hovered ? 3 : 0 }}>
          <ArrowRight size={13} style={{ color: VERY_MUTED }} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// REPUTATION BADGE
// ─────────────────────────────────────────────
function ReputationBadge({ score, history }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      style={{
        padding: "20px 24px",
        borderRadius: 12,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>Reputation Score</p>
        <CheckCircle size={13} style={{ color: VERY_MUTED }} />
      </div>
      <p style={{ fontSize: "clamp(27px, 3vw, 36px)", fontWeight: 900, color: TEXT, letterSpacing: -2, fontFamily: "monospace", marginBottom: 4 }}>
        {score}
      </p>
      <p style={{ fontSize: 11, color: VERY_MUTED, marginBottom: 16 }}>
        {history.length} milestone{history.length !== 1 ? "s" : ""} completed on-chain
      </p>
      {history.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {history.slice(0, 6).map((h, i) => (
            <div
              key={i}
              style={{
                width: 28, height: 28, borderRadius: 7,
                background: SURFACE2,
                border: `1px solid ${BORDER2}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title={`Campaign ${h.campaignId} · Milestone ${h.milestoneIndex}`}
            >
              <CheckCircle size={12} style={{ color: SUCCESS }} />
            </div>
          ))}
          {history.length > 6 && (
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: SURFACE2, border: `1px solid ${BORDER2}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: MUTED,
            }}>
              +{history.length - 6}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// CUSTOM TOOLTIP
// ─────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      padding: "8px 12px", borderRadius: 8,
      background: SURFACE2, border: `1px solid ${BORDER2}`,
      fontSize: 12,
    }}>
      <p style={{ color: MUTED, marginBottom: 2 }}>{label}</p>
      <p style={{ color: TEXT, fontWeight: 700, fontFamily: "monospace" }}>
        ${payload[0].value.toLocaleString()} USDC
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────
export default function Dashboard() {
  const { address } = useAccount();
  const navigate = useNavigate();
  const { role } = useSIWE();
  const [activeRole, setActiveRole] = useState(role || "brand");
  const [filter, setFilter] = useState("all");

  const { data: campaigns = [], isLoading } = useCampaigns(address);
  const { score, mintHistory } = useReputation(address);
  const { data: myApplications = [] } = useMyApplications(address);

  // Applications that haven't (yet) resulted in a campaign assignment.
  // Selected applications surface as the creator's campaigns in the list below.
  const openApplications = myApplications.filter(
    (a) => a.status === "pending" || a.status === "rejected"
  );

  const brandCampaigns = campaigns.filter((c) => c.brand_address?.toLowerCase() === address?.toLowerCase());
  const creatorCampaigns = campaigns.filter((c) => c.creator_address?.toLowerCase() === address?.toLowerCase());

  const displayCampaigns = activeRole === "brand" ? brandCampaigns : creatorCampaigns;

  const filtered = filter === "all"
    ? displayCampaigns
    : displayCampaigns.filter((c) => c.status === filter);

  const totalLocked = displayCampaigns.reduce((s, c) => s + parseFloat(c.total_deposit_usdc || 0), 0);
  const totalReleased = displayCampaigns.reduce((s, c) => s + parseFloat(c.total_released_usdc || 0), 0);
  const activeCampaigns = displayCampaigns.filter((c) => c.status === "active").length;
  const completedCampaigns = displayCampaigns.filter((c) => c.status === "completed").length;

  return (
    <WalletGuard>
      <PageLayout>
        <Section>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontSize: "clamp(24px, 2.33vw, 28px)", fontWeight: 900, color: TEXT, letterSpacing: -1, marginBottom: 4 }}
              >
                Dashboard
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                style={{ fontSize: 13, color: MUTED, fontFamily: "monospace" }}
              >
                {address ? truncateAddress(address) : ""}
              </motion.p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Testnet faucet — only the deploy wallet is minted any USDC,
                  so every other wallet needs a way to fund itself. */}
              <TestnetFaucet />

              {/* Role toggle */}
              <div style={{
                display: "flex", background: SURFACE2,
                borderRadius: 9, padding: 3,
                border: `1px solid ${BORDER}`,
              }}>
                {["brand", "creator"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setActiveRole(r)}
                    style={{
                      padding: "5px 14px", borderRadius: 7,
                      fontSize: 12, fontWeight: 600,
                      background: activeRole === r ? SURFACE : "transparent",
                      border: activeRole === r ? `1px solid ${BORDER2}` : "1px solid transparent",
                      color: activeRole === r ? TEXT : MUTED,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      textTransform: "capitalize",
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {activeRole === "brand" && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/campaigns/new")}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 9,
                    background: TEXT, color: "#000",
                    fontWeight: 700, fontSize: 13,
                    border: "none", cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> New Campaign
                </motion.button>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="r-grid-4" style={{ gap: 12, marginBottom: 32 }}>
            <StatCard
              label={activeRole === "brand" ? "Total Locked" : "Total Earned"}
              value={`$${formatUSDC(activeRole === "brand" ? totalLocked : totalReleased)}`}
              sub={activeRole === "brand" ? "across all escrows" : "USDC received"}
              icon={Lock}
              delay={0}
            />
            <StatCard
              label="Active Campaigns"
              value={activeCampaigns}
              sub={`${completedCampaigns} completed`}
              icon={TrendingUp}
              trend="up"
              delay={0.06}
            />
            <StatCard
              label={activeRole === "brand" ? "Released" : "Pending"}
              value={`$${formatUSDC(activeRole === "brand" ? totalReleased : totalLocked - totalReleased)}`}
              sub={activeRole === "brand" ? "paid to creators" : "in active escrows"}
              icon={CheckCircle}
              delay={0.12}
            />
            {activeRole === "creator" ? (
              <StatCard
                label="Reputation Score"
                value={score}
                sub={`${mintHistory.length} tokens minted`}
                icon={CheckCircle}
                delay={0.18}
              />
            ) : (
              <StatCard
                label="Total Campaigns"
                value={displayCampaigns.length}
                sub={`${displayCampaigns.filter(c => c.status === "pending").length} pending`}
                icon={BarChart3}
                delay={0.18}
              />
            )}
          </div>

          {/* Main content */}
          <div className={activeRole === "creator" ? "r-grid-sidebar-sm" : undefined} style={activeRole === "creator" ? undefined : { display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>

            {/* Left — campaigns + chart */}
            <div>
              {/* Earnings chart — creator only */}
              {activeRole === "creator" && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  style={{
                    padding: "20px 24px",
                    borderRadius: 12,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Earnings</p>
                    <p style={{ fontSize: 11, color: VERY_MUTED }}>Last 6 months · USDC</p>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={MOCK_EARNINGS} margin={{ top: 0, right: 0, left: -32, bottom: 0 }}>
                      <defs>
                        <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffffff" stopOpacity={0.08} />
                          <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: VERY_MUTED }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: VERY_MUTED }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke={TEXT}
                        strokeWidth={1.5}
                        fill="url(#earningsGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}

              {/* Your applications — creator only, non-selected ones */}
              {activeRole === "creator" && openApplications.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  style={{
                    padding: "20px 24px",
                    borderRadius: 12,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>
                    Your applications
                    <span style={{ color: VERY_MUTED, fontWeight: 500, marginLeft: 6 }}>
                      ({openApplications.length})
                    </span>
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {openApplications.map((app) => {
                      const c = app.campaigns;
                      const target = c?.contract_address || c?.campaign_id_onchain || c?.id;
                      const color = app.status === "rejected" ? DANGER : WARNING;
                      return (
                        <div
                          key={app.id}
                          onClick={() => target && navigate(`/campaigns/${target}`)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            borderRadius: 9,
                            background: SURFACE2,
                            border: `1px solid ${BORDER}`,
                            cursor: target ? "pointer" : "default",
                            transition: "all 0.15s",
                          }}
                        >
                          <div style={{ minWidth: 0, marginRight: 12 }}>
                            <p
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: TEXT,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {c?.title || "Untitled campaign"}
                            </p>
                            <p style={{ fontSize: 10, color: VERY_MUTED, marginTop: 2 }}>
                              Applied {new Date(app.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: 0.6,
                              padding: "3px 8px",
                              borderRadius: 100,
                              color,
                              background: `${color}1a`,
                              border: `1px solid ${color}33`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {app.status === "rejected" ? "Not selected" : "Pending"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Campaign list */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                    {activeRole === "brand" ? "Your Campaigns" : "Active Deals"}
                  </p>
                  {/* Filter */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {["all", "active", "completed", "pending"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                          padding: "4px 10px", borderRadius: 6,
                          fontSize: 11, fontWeight: 500,
                          background: filter === f ? SURFACE2 : "transparent",
                          border: filter === f ? `1px solid ${BORDER2}` : "1px solid transparent",
                          color: filter === f ? TEXT : VERY_MUTED,
                          cursor: "pointer",
                          textTransform: "capitalize",
                          transition: "all 0.15s",
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <LoadingSpinner className="py-16" />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={activeRole === "brand" ? Plus : Clock}
                    title={activeRole === "brand" ? "No campaigns yet" : "No active deals"}
                    description={
                      activeRole === "brand"
                        ? "Create your first campaign to get started"
                        : "You haven't been added to any campaigns yet"
                    }
                    action={
                      activeRole === "brand"
                        ? { label: "Create Campaign", onClick: () => navigate("/campaigns/new") }
                        : undefined
                    }
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <AnimatePresence>
                      {filtered.map((campaign, i) => (
                        <CampaignRow
                          key={campaign.id}
                          campaign={campaign}
                          role={activeRole}
                          index={i}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* Right — reputation (creator only) */}
            {activeRole === "creator" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <ReputationBadge score={score} history={mintHistory} />

                {/* Quick links */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  style={{
                    padding: "16px 20px",
                    borderRadius: 12,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <p style={{ fontSize: 12, color: MUTED, fontWeight: 500, marginBottom: 12 }}>Quick links</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { label: "View public profile", href: `/profile/${address}` },
                      { label: "Browse open campaigns", href: "/campaigns" },
                    ].map(({ label, href }) => (
                      <button
                        key={label}
                        onClick={() => navigate(href)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 10px", borderRadius: 7,
                          background: "transparent", border: `1px solid ${BORDER}`,
                          color: MUTED, fontSize: 12, cursor: "pointer",
                          transition: "all 0.15s",
                          width: "100%",
                        }}
                      >
                        {label}
                        <ArrowRight size={11} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </Section>
      </PageLayout>
    </WalletGuard>
  );
}