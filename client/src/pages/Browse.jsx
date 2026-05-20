// ─────────────────────────────────────────────
// Browse — Open Campaign Marketplace
// ─────────────────────────────────────────────
// Creators browse all campaigns that brands have posted and are
// still accepting applications. Each card links to the campaign
// detail page where the creator can apply.
// ─────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Layers, Coins, Compass } from "lucide-react";
import PageLayout, { Section } from "@/components/layout/PageLayout";
import RoleGuard from "@/components/wallet/RoleGuard";
import PlatformIcon from "@/components/shared/PlatformIcon";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { useOpenCampaigns } from "@/hooks/useCampaign";
import { truncateAddress, formatUSDC } from "@/lib/utils";

const SURFACE = "#111111";
const SURFACE2 = "#161616";
const BORDER = "#1f1f1f";
const BORDER2 = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#888888";
const VERY_MUTED = "#444444";

function OpenCampaignCard({ campaign, index }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const milestones = campaign.milestones || [];
  const platforms = [...new Set(milestones.map((m) => m.platform))];
  const totalBudget =
    campaign.total_deposit_usdc ||
    milestones.reduce((s, m) => s + parseFloat(m.tranche_usdc || 0), 0);
  const target =
    campaign.contract_address || campaign.campaign_id_onchain || campaign.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/campaigns/${target}`)}
      style={{
        padding: 20,
        borderRadius: 14,
        background: hovered ? SURFACE2 : SURFACE,
        border: `1px solid ${hovered ? BORDER2 : BORDER}`,
        cursor: "pointer",
        transition: "all 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: TEXT,
              marginBottom: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {campaign.title || "Untitled Campaign"}
          </p>
          <p style={{ fontSize: 11, color: VERY_MUTED, fontFamily: "monospace" }}>
            by {truncateAddress(campaign.brand_address)}
          </p>
        </div>
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 100,
            height: "fit-content",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: "#4ade80",
            background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.2)",
            whiteSpace: "nowrap",
          }}
        >
          Open
        </span>
      </div>

      {campaign.description && (
        <p
          style={{
            fontSize: 12,
            color: MUTED,
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {campaign.description}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingTop: 12,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {platforms.map((p) => (
            <PlatformIcon key={p} platform={p} size="sm" />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Layers size={12} style={{ color: VERY_MUTED }} />
          <span style={{ fontSize: 11, color: MUTED }}>
            {milestones.length} milestone{milestones.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginLeft: "auto",
          }}
        >
          <Coins size={12} style={{ color: VERY_MUTED }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: TEXT,
              fontFamily: "monospace",
            }}
          >
            ${formatUSDC(totalBudget)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
          color: MUTED,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>View &amp; apply</span>
        <ArrowRight size={13} />
      </div>
    </motion.div>
  );
}

export default function Browse() {
  const { data: campaigns = [], isLoading } = useOpenCampaigns();

  return (
    <RoleGuard role="creator">
      <PageLayout>
        <Section>
          <div style={{ marginBottom: 28 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: TEXT,
                letterSpacing: -1,
                marginBottom: 4,
              }}
            >
              Open Campaigns
            </h1>
            <p style={{ fontSize: 13, color: MUTED }}>
              Browse campaigns posted by brands and apply to the ones you want.
            </p>
          </div>

          {isLoading ? (
            <LoadingSpinner className="py-16" />
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No open campaigns"
              description="There are no campaigns accepting applications right now. Check back soon."
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 14,
              }}
            >
              {campaigns.map((c, i) => (
                <OpenCampaignCard key={c.id} campaign={c} index={i} />
              ))}
            </div>
          )}
        </Section>
      </PageLayout>
    </RoleGuard>
  );
}
