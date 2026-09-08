import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import {
  ArrowLeft, Copy, ExternalLink, CheckCircle,
  Award, BarChart3, Clock, Shield,
  TrendingUp, ArrowRight, Zap,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PlatformIcon from "@/components/shared/PlatformIcon";
import LoadingSpinner, { PageLoader } from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { useReputation, useReputationEvents } from "@/hooks/useReputation";
import { useCampaigns } from "@/hooks/useCampaign";
import { formatUSDC, truncateAddress } from "@/lib/utils";
import { PLATFORMS, METRIC_TYPES } from "@/lib/constants";
import { explorerAddressUrl, EXPLORER_NAME } from "@/config/wagmi";
import { toast } from "sonner";

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

// ─────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: "20px 22px",
        borderRadius: 12,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 11, color: VERY_MUTED, fontWeight: 500 }}>{label}</p>
        {Icon && <Icon size={12} style={{ color: VERY_MUTED }} />}
      </div>
      <p style={{ fontSize: 26, fontWeight: 900, color: TEXT, letterSpacing: -1, fontFamily: "monospace", marginBottom: 3 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: VERY_MUTED }}>{sub}</p>}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// REPUTATION BADGE
// ─────────────────────────────────────────────
function ReputationBadge({ record, index, campaigns }) {
  const [hovered, setHovered] = useState(false);

  const campaign = campaigns?.find(
    (c) => c.campaign_id_onchain === record.campaignId || Number(c.campaign_id_onchain) === record.campaignId
  );

  const platformColor = {
    YOUTUBE: "#ef4444",
    TWITCH: "#a855f7",
    LINKEDIN: "#3b82f6",
  };

  const mintDate = record.mintedAt
    ? new Date(record.mintedAt * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : record.minted_at
    ? new Date(record.minted_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "—";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -6 }}
      style={{
        padding: "18px",
        borderRadius: 14,
        background: hovered ? SURFACE2 : SURFACE,
        border: `1px solid ${hovered ? BORDER2 : BORDER}`,
        cursor: "default",
        transition: "background 0.15s, border-color 0.15s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow on hover */}
      <motion.div
        animate={{ opacity: hovered ? 1 : 0 }}
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(circle at 30% 20%, rgba(74,222,128,0.04), transparent 60%)",
        }}
      />

      {/* Token icon */}
      <div style={{ position: "relative" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: `rgba(74,222,128,0.08)`,
          border: `1px solid rgba(74,222,128,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14,
        }}>
          <CheckCircle size={20} style={{ color: SUCCESS }} />
        </div>

        {/* Soulbound indicator */}
        <div style={{
          position: "absolute", top: -4, right: -4,
          width: 16, height: 16, borderRadius: "50%",
          background: SURFACE2, border: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Shield size={8} style={{ color: VERY_MUTED }} />
        </div>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 4, lineHeight: 1.4 }}>
        {campaign?.title || `Campaign #${record.campaignId}`}
      </p>
      <p style={{ fontSize: 10, color: VERY_MUTED, marginBottom: 10 }}>
        Milestone {record.milestoneIndex ?? record.milestone_id ?? "—"} · {mintDate}
      </p>

      {/* Token ID */}
      <div style={{
        padding: "5px 8px", borderRadius: 6,
        background: SURFACE2, border: `1px solid ${BORDER}`,
        fontSize: 9, color: VERY_MUTED, fontFamily: "monospace",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        #{(record.tokenId || record.token_id || "").toString().slice(0, 14)}...
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// CAMPAIGN HISTORY ROW
// ─────────────────────────────────────────────
function CampaignHistoryRow({ campaign, index }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const milestones = campaign.milestones || [];
  const metCount = milestones.filter((m) => m.status === "met").length;
  const total = milestones.length;
  const earned = parseFloat(campaign.total_released_usdc || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => navigate(`/campaigns/${campaign.contract_address || campaign.id}`)}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "14px 16px", borderRadius: 10,
        background: hovered ? SURFACE2 : SURFACE,
        border: `1px solid ${hovered ? BORDER2 : BORDER}`,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Platform icons */}
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {[...new Set(milestones.map((m) => m.platform))].slice(0, 2).map((p) => (
          <PlatformIcon key={p} platform={p} size="sm" />
        ))}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {campaign.title || "Untitled Campaign"}
        </p>
        <p style={{ fontSize: 11, color: VERY_MUTED }}>
          {metCount}/{total} milestones · {campaign.brand_address ? truncateAddress(campaign.brand_address) : "—"}
        </p>
      </div>

      {/* Earned */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: earned > 0 ? SUCCESS : MUTED, fontFamily: "monospace" }}>
          +${formatUSDC(earned)}
        </p>
        <p style={{ fontSize: 10, color: VERY_MUTED, textTransform: "capitalize" }}>{campaign.status}</p>
      </div>

      <motion.div animate={{ x: hovered ? 3 : 0 }}>
        <ArrowRight size={12} style={{ color: VERY_MUTED }} />
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function CreatorProfile() {
  const { address: profileAddress } = useParams();
  const { address: myAddress } = useAccount();
  const navigate = useNavigate();
  const [tab, setTab] = useState("badges");

  const isOwnProfile = myAddress?.toLowerCase() === profileAddress?.toLowerCase();

  const { score, mintHistory, isLoading: repLoading } = useReputation(profileAddress);
  const { data: repEvents = [], isLoading: eventsLoading } = useReputationEvents(profileAddress);
  const { data: allCampaigns = [], isLoading: campaignsLoading } = useCampaigns(profileAddress);

  const creatorCampaigns = allCampaigns.filter(
    (c) => c.creator_address?.toLowerCase() === profileAddress?.toLowerCase()
  );

  const completedCampaigns = creatorCampaigns.filter((c) => c.status === "completed").length;
  const activeCampaigns = creatorCampaigns.filter((c) => c.status === "active").length;
  const totalEarned = creatorCampaigns.reduce((s, c) => s + parseFloat(c.total_released_usdc || 0), 0);

  const isLoading = repLoading || eventsLoading || campaignsLoading;

  const copyAddress = () => {
    navigator.clipboard.writeText(profileAddress);
    toast.success("Address copied");
  };

  // Use on-chain history if available, fall back to off-chain events
  const badges = mintHistory.length > 0
    ? mintHistory
    : repEvents?.events || repEvents || [];

  if (isLoading) return <PageLoader />;

  return (
    <PageLayout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 0 80px" }}>

        {/* Back */}
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ x: -3 }}
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none",
            color: MUTED, fontSize: 13, cursor: "pointer",
            marginBottom: 28, padding: 0,
          }}
        >
          <ArrowLeft size={14} /> Back
        </motion.button>

        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "28px 28px",
            borderRadius: 16,
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            marginBottom: 20,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle background glow */}
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 200, height: 200, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.015), transparent)",
            pointerEvents: "none",
          }} />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, position: "relative" }}>
            {/* Avatar */}
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: SURFACE2, border: `1px solid ${BORDER2}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: `linear-gradient(135deg, #333 0%, #555 100%)`,
              }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h1 style={{ fontSize: 20, fontWeight: 900, color: TEXT, letterSpacing: -0.5, fontFamily: "monospace" }}>
                  {truncateAddress(profileAddress, 6)}
                </h1>
                {isOwnProfile && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 4,
                    background: SURFACE2, border: `1px solid ${BORDER2}`,
                    color: MUTED,
                  }}>
                    YOU
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={copyAddress}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "none", border: "none", cursor: "pointer",
                    color: VERY_MUTED, fontSize: 11, fontFamily: "monospace", padding: 0,
                  }}
                >
                  {profileAddress}
                  <Copy size={9} />
                </button>

                <a
                  href={explorerAddressUrl(profileAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 4, color: VERY_MUTED, fontSize: 11, textDecoration: "none" }}
                >
                  <ExternalLink size={10} />
                  {EXPLORER_NAME}
                </a>
              </div>
            </div>

            {/* Reputation score — large */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 10, color: VERY_MUTED, marginBottom: 4, textAlign: "right" }}>
                Reputation Score
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: TEXT, fontFamily: "monospace", letterSpacing: -2 }}>
                  {score}
                </span>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: score > 0 ? SUCCESS : VERY_MUTED }} />
              </div>
              <p style={{ fontSize: 10, color: VERY_MUTED }}>on-chain · soulbound</p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          <StatCard label="Reputation tokens" value={badges.length} sub="minted on-chain" icon={Award} delay={0} />
          <StatCard label="Completed campaigns" value={completedCampaigns} sub={`${activeCampaigns} active`} icon={CheckCircle} delay={0.06} />
          <StatCard label="Total earned" value={`$${formatUSDC(totalEarned)}`} sub="USDC received" icon={TrendingUp} delay={0.12} />
          <StatCard label="Total campaigns" value={creatorCampaigns.length} sub="as creator" icon={BarChart3} delay={0.18} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, padding: 4, background: SURFACE2, borderRadius: 10, width: "fit-content", border: `1px solid ${BORDER}` }}>
          {[
            { id: "badges", label: `Reputation (${badges.length})` },
            { id: "campaigns", label: `Campaigns (${creatorCampaigns.length})` },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "7px 18px", borderRadius: 7,
                fontSize: 12, fontWeight: 600,
                background: tab === id ? SURFACE : "transparent",
                border: tab === id ? `1px solid ${BORDER2}` : "1px solid transparent",
                color: tab === id ? TEXT : MUTED,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {tab === "badges" && (
            <motion.div
              key="badges"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {badges.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="No reputation tokens yet"
                  description="Reputation tokens are minted automatically when milestones are completed on-chain."
                />
              ) : (
                <>
                  {/* Soulbound notice */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 8,
                    background: `rgba(255,255,255,0.02)`,
                    border: `1px solid ${BORDER}`,
                    marginBottom: 16,
                  }}>
                    <Shield size={12} style={{ color: VERY_MUTED }} />
                    <p style={{ fontSize: 11, color: VERY_MUTED }}>
                      Soulbound ERC-1155 tokens · Non-transferable · Permanently linked to this wallet
                    </p>
                  </div>

                  {/* Badge grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {badges.map((record, i) => (
                      <ReputationBadge
                        key={record.tokenId || record.token_id || i}
                        record={record}
                        index={i}
                        campaigns={creatorCampaigns}
                      />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {tab === "campaigns" && (
            <motion.div
              key="campaigns"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {creatorCampaigns.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No campaigns yet"
                  description="Campaigns this creator has participated in will appear here."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {creatorCampaigns.map((campaign, i) => (
                    <CampaignHistoryRow key={campaign.id} campaign={campaign} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageLayout>
  );
}