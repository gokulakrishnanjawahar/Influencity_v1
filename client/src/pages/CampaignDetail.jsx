import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import {
  ArrowLeft, ExternalLink, CheckCircle,
  XCircle, Clock, Lock, Upload,
  Activity, RefreshCw, Shield, Copy,
  ArrowRight, Zap, AlertCircle, Send,
  Users, Ban,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import WalletGuard from "@/components/wallet/WalletGuard";
import StatusBadge from "@/components/shared/StatusBadge";
import PlatformIcon from "@/components/shared/PlatformIcon";
import ProgressBar from "@/components/shared/ProgressBar";
import LoadingSpinner, { PageLoader } from "@/components/shared/LoadingSpinner";
import {
  useCampaign,
  useCampaignApplications,
  useApplyToCampaign,
  useSelectCreator,
  useCancelCampaign,
} from "@/hooks/useCampaign";
import { useSIWE } from "@/components/wallet/SIWEProvider";
import { useMilestones } from "@/hooks/useMilestones";
import { useIPFS } from "@/hooks/useIPFS";
import { formatUSDC, formatDeadline, truncateAddress, timeUntil, milestoneProgress } from "@/lib/utils";
import { explorerAddressUrl, EXPLORER_NAME, NETWORK_NAME } from "@/config/wagmi";
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
const DANGER = "#f87171";
const WARNING = "#fb923c";

// ─────────────────────────────────────────────
// MILESTONE STATUS ICON
// ─────────────────────────────────────────────
function MilestoneStatusIcon({ status }) {
  if (status === "MET") return <CheckCircle size={16} style={{ color: SUCCESS }} />;
  if (status === "FAILED") return <XCircle size={16} style={{ color: DANGER }} />;
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
    >
      <Clock size={16} style={{ color: WARNING }} />
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// MILESTONE CARD
// ─────────────────────────────────────────────
function MilestoneCard({ milestone, index, escrowAddress, isCreator, onProofSubmit }) {
  const [expanded, setExpanded] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const [contentId, setContentId] = useState(milestone.contentId || "");
  const [submitting, setSubmitting] = useState(false);
  const { getGatewayUrl } = useIPFS();
  const navigate = useNavigate();

  const progress = milestoneProgress(
    milestone.verifiedValue || milestone.verified_value || 0,
    milestone.threshold
  );

  const statusKey = milestone.status?.toUpperCase() || "PENDING";

  const handleProofSubmit = async () => {
    if (!proofUrl.trim()) {
      toast.error("Please enter your content URL");
      return;
    }
    setSubmitting(true);
    try {
      await onProofSubmit({
        milestoneIndex: index,
        contentUrl: proofUrl,
        contentId: contentId || milestone.contentId,
        platform: milestone.platform,
      });
      toast.success("Proof submitted successfully!");
      setExpanded(false);
    } catch (err) {
      toast.error(err.message || "Failed to submit proof");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        borderRadius: 14,
        background: SURFACE,
        border: `1px solid ${
          statusKey === "MET"
            ? "rgba(74,222,128,0.2)"
            : statusKey === "FAILED"
            ? "rgba(248,113,113,0.15)"
            : BORDER
        }`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "16px 20px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* Index */}
        <div
          style={{
            width: 28, height: 28, borderRadius: 7,
            background: SURFACE2, border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: MUTED, flexShrink: 0,
          }}
        >
          {index + 1}
        </div>

        {/* Platform */}
        <PlatformIcon platform={milestone.platform} size="sm" />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>
            {Number(milestone.threshold).toLocaleString()}{" "}
            {(milestone.metricType || milestone.metric_type || "VIEWS").replace("_", " ")}
          </p>
          <p style={{ fontSize: 11, color: VERY_MUTED }}>
            {timeUntil(milestone.deadline)} · ${formatUSDC(milestone.trancheAmount || milestone.tranche_usdc)} USDC
          </p>
        </div>

        {/* Progress */}
        <div style={{ width: 80 }}>
          <ProgressBar value={progress} max={100} status={statusKey} showPercentage={false} />
        </div>

        {/* Status */}
        <MilestoneStatusIcon status={statusKey} />

        {/* Expand arrow */}
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ArrowRight size={13} style={{ color: VERY_MUTED }} />
        </motion.div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Milestone details */}
                {[
                  { label: "Platform", value: milestone.platform },
                  { label: "Content ID", value: milestone.contentId || milestone.content_id || "—" },
                  { label: "Deadline", value: formatDeadline(milestone.deadline) },
                  { label: "Tranche", value: `$${formatUSDC(milestone.trancheAmount || milestone.tranche_usdc)} USDC` },
                  ...(milestone.verifiedValue || milestone.verified_value
                    ? [{ label: "Verified value", value: Number(milestone.verifiedValue || milestone.verified_value).toLocaleString() }]
                    : []),
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: VERY_MUTED }}>{label}</span>
                    <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{value}</span>
                  </div>
                ))}

                {/* FIX 1: Restored missing opening <a> tag for IPFS proof link */}
                {(milestone.ipfsProofHash || milestone.ipfs_proof_cid) && (
                  <a
                    href={getGatewayUrl(milestone.ipfsProofHash || milestone.ipfs_proof_cid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 11, color: MUTED, textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={10} />
                    View proof on IPFS
                  </a>
                )}

                {/* Proof submission — creator only, pending milestones */}
                {isCreator && statusKey === "PENDING" && (
                  <div
                    style={{
                      marginTop: 8, padding: "14px", borderRadius: 10,
                      background: SURFACE2, border: `1px solid ${BORDER2}`,
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 10 }}>
                      Submit content proof
                    </p>
                    <input
                      value={proofUrl}
                      onChange={(e) => setProofUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      style={{
                        width: "100%", padding: "8px 12px",
                        borderRadius: 8, background: SURFACE,
                        border: `1px solid ${BORDER}`, color: TEXT,
                        fontSize: 12, outline: "none",
                        boxSizing: "border-box", marginBottom: 8,
                      }}
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleProofSubmit}
                      disabled={submitting}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 14px", borderRadius: 8,
                        background: TEXT, color: "#000",
                        fontWeight: 600, fontSize: 12,
                        border: "none", cursor: "pointer",
                        opacity: submitting ? 0.6 : 1,
                      }}
                    >
                      <Upload size={12} />
                      {submitting ? "Submitting..." : "Submit proof"}
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// APPLY PANEL — creator applies to an open campaign
// ─────────────────────────────────────────────
function ApplyPanel({ campaignId, connectedAddress, applications }) {
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState("");
  const [links, setLinks] = useState({
    youtube: "",
    twitch: "",
    linkedin: "",
    other: "",
  });
  const apply = useApplyToCampaign(campaignId);

  const myApplication = applications.find(
    (a) => a.creator_address?.toLowerCase() === connectedAddress?.toLowerCase()
  );

  const labelStyle = {
    display: "block",
    fontSize: 10,
    color: VERY_MUTED,
    marginBottom: 4,
    fontWeight: 600,
  };
  const inputStyle = {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 8,
    background: SURFACE2,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  if (myApplication) {
    const statusColor =
      myApplication.status === "selected"
        ? SUCCESS
        : myApplication.status === "rejected"
        ? DANGER
        : WARNING;
    const statusText =
      myApplication.status === "selected"
        ? "You were selected"
        : myApplication.status === "rejected"
        ? "Not selected for this campaign"
        : "Application under review";
    return (
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          background: SURFACE,
          border: `1px solid ${BORDER}`,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            color: VERY_MUTED,
            marginBottom: 10,
          }}
        >
          Your application
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: statusColor,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
            {statusText}
          </span>
        </div>
        {myApplication.pitch_message && (
          <p style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.6 }}>
            “{myApplication.pitch_message}”
          </p>
        )}
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!pitch.trim()) {
      toast.error("Add a short pitch describing why you're a fit");
      return;
    }
    const socialLinks = Object.fromEntries(
      Object.entries(links).filter(([, v]) => v.trim())
    );
    try {
      await apply.mutateAsync({
        creatorAddress: connectedAddress,
        pitchMessage: pitch.trim(),
        socialLinks,
      });
      toast.success("Application submitted!");
      setOpen(false);
    } catch (e) {
      toast.error(e.message || "Failed to submit application");
    }
  };

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 12,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: VERY_MUTED,
          marginBottom: 12,
        }}
      >
        Interested?
      </p>
      {!open ? (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            padding: "10px 14px",
            borderRadius: 9,
            background: TEXT,
            color: "#000",
            fontWeight: 700,
            fontSize: 13,
            border: "none",
            cursor: "pointer",
          }}
        >
          <Send size={13} /> Apply to this campaign
        </motion.button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={labelStyle}>Your pitch</label>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              rows={3}
              placeholder="Why are you a great fit for this campaign?"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
          {[
            { key: "youtube", label: "YouTube", ph: "https://youtube.com/@you" },
            { key: "twitch", label: "Twitch", ph: "https://twitch.tv/you" },
            { key: "linkedin", label: "LinkedIn", ph: "https://linkedin.com/in/you" },
            { key: "other", label: "Other links", ph: "Instagram, X, portfolio…" },
          ].map(({ key, label, ph }) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input
                value={links[key]}
                onChange={(e) =>
                  setLinks((p) => ({ ...p, [key]: e.target.value }))
                }
                placeholder={ph}
                style={inputStyle}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: 8,
                background: "transparent",
                border: `1px solid ${BORDER}`,
                color: MUTED,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={apply.isPending}
              style={{
                flex: 2,
                padding: "9px",
                borderRadius: 8,
                background: TEXT,
                color: "#000",
                fontWeight: 700,
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                opacity: apply.isPending ? 0.6 : 1,
              }}
            >
              {apply.isPending ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// APPLICANTS PANEL — brand reviews creator applications + selects one
// ─────────────────────────────────────────────
const APP_STATUS_STYLES = {
  pending:   { color: WARNING, label: "Pending review" },
  selected:  { color: SUCCESS, label: "Selected" },
  rejected:  { color: DANGER,  label: "Rejected" },
  withdrawn: { color: MUTED,   label: "Withdrawn" },
};

function ApplicantsPanel({
  campaignId,
  campaignIdOnchain,
  campaignStatus,
  brandAddress,
  applications,
}) {
  const select = useSelectCreator(campaignId);

  const copyApplicant = (addr) => {
    navigator.clipboard.writeText(addr);
    toast.success("Address copied");
  };

  const handleSelect = async (creatorAddress) => {
    const ok = window.confirm(
      `Select ${creatorAddress.slice(0, 6)}…${creatorAddress.slice(
        -4
      )} as the creator?\n\nThis forms a binding agreement on-chain and rejects all other applicants. It cannot be undone.`
    );
    if (!ok) return;
    try {
      await select.mutateAsync({ campaignIdOnchain, brandAddress, creatorAddress });
      toast.success("Creator selected — agreement formed!");
    } catch (e) {
      toast.error(e.message || "Failed to select creator");
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={14} style={{ color: MUTED }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
            Applicants{" "}
            <span style={{ color: VERY_MUTED, fontWeight: 500 }}>
              ({applications.length})
            </span>
          </p>
        </div>
        {campaignStatus === "open" && (
          <span style={{ fontSize: 11, color: VERY_MUTED }}>
            Pick one to form the agreement
          </span>
        )}
      </div>

      {applications.length === 0 ? (
        <div
          style={{
            padding: "32px 20px",
            textAlign: "center",
            borderRadius: 12,
            background: SURFACE,
            border: `1px solid ${BORDER}`,
          }}
        >
          <Users size={22} style={{ color: VERY_MUTED, marginBottom: 10 }} />
          <p style={{ fontSize: 12, color: MUTED }}>
            No applications yet. Share the listing to attract creators.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {applications.map((app, i) => {
            const statusStyle =
              APP_STATUS_STYLES[app.status] || APP_STATUS_STYLES.pending;
            const links = Object.entries(app.social_links || {}).filter(
              ([, v]) => v
            );
            return (
              <motion.div
                key={app.id || i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: SURFACE,
                  border: `1px solid ${
                    app.status === "selected"
                      ? "rgba(74,222,128,0.3)"
                      : BORDER
                  }`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <button
                      onClick={() => copyApplicant(app.creator_address)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: TEXT,
                        fontSize: 12,
                        fontFamily: "monospace",
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      {truncateAddress(app.creator_address)}
                      <Copy size={9} style={{ color: VERY_MUTED }} />
                    </button>
                    <p style={{ fontSize: 10, color: VERY_MUTED, marginTop: 3 }}>
                      Applied {new Date(app.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 100,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      color: statusStyle.color,
                      background: `${statusStyle.color}1a`,
                      border: `1px solid ${statusStyle.color}33`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statusStyle.label}
                  </span>
                </div>

                {app.pitch_message && (
                  <p
                    style={{
                      fontSize: 12,
                      color: MUTED,
                      lineHeight: 1.6,
                      marginBottom: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: SURFACE2,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    “{app.pitch_message}”
                  </p>
                )}

                {links.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: campaignStatus === "open" && app.status === "pending" ? 12 : 0,
                    }}
                  >
                    {links.map(([k, v]) => (
                      <a
                        key={k}
                        href={v.startsWith("http") ? v : `https://${v}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 9px",
                          borderRadius: 6,
                          background: SURFACE2,
                          border: `1px solid ${BORDER}`,
                          color: MUTED,
                          fontSize: 11,
                          textDecoration: "none",
                          textTransform: "capitalize",
                        }}
                      >
                        <ExternalLink size={9} /> {k}
                      </a>
                    ))}
                  </div>
                )}

                {campaignStatus === "open" && app.status === "pending" && (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleSelect(app.creator_address)}
                    disabled={select.isPending}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      width: "100%",
                      padding: "9px 14px",
                      borderRadius: 9,
                      background: TEXT,
                      color: "#000",
                      fontWeight: 700,
                      fontSize: 12,
                      border: "none",
                      cursor: "pointer",
                      opacity: select.isPending ? 0.6 : 1,
                    }}
                  >
                    <CheckCircle size={12} />
                    {select.isPending ? "Selecting…" : "Select this creator"}
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// WITHDRAW PANEL — brand cancels an open campaign and refunds USDC
// ─────────────────────────────────────────────
function WithdrawPanel({ campaignId, escrowAddress, brandAddress }) {
  const cancel = useCancelCampaign(campaignId);

  const handleCancel = async () => {
    const ok = window.confirm(
      "Withdraw this campaign? Your locked USDC will be refunded in full to your wallet, and all pending applications will be closed.\n\nThis cannot be undone."
    );
    if (!ok) return;
    try {
      await cancel.mutateAsync({ escrowAddress, brandAddress });
      toast.success("Campaign withdrawn — USDC refunded to your wallet");
    } catch (e) {
      toast.error(e.message || "Failed to withdraw campaign");
    }
  };

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 12,
        background: SURFACE,
        border: `1px solid rgba(248,113,113,0.2)`,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: DANGER,
          marginBottom: 10,
        }}
      >
        Withdraw campaign
      </p>
      <p style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginBottom: 14 }}>
        Not happy with any applicant? You can withdraw while the campaign is
        still open — your locked USDC is refunded in full.
      </p>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleCancel}
        disabled={cancel.isPending}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          padding: "9px 14px",
          borderRadius: 9,
          background: "transparent",
          color: DANGER,
          fontWeight: 700,
          fontSize: 12,
          border: `1px solid rgba(248,113,113,0.4)`,
          cursor: "pointer",
          opacity: cancel.isPending ? 0.6 : 1,
        }}
      >
        <Ban size={12} />
        {cancel.isPending ? "Withdrawing…" : "Withdraw & refund"}
      </motion.button>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  // FIX 2: Renamed to `connectedAddress` to avoid shadowing in the Parties .map() below
  const { address: connectedAddress } = useAccount();
  const [proofSubmitting, setProofSubmitting] = useState(false);

  const { data: campaign, isLoading, error, refetch } = useCampaign(id);
  const { data: applications = [] } = useCampaignApplications(id);
  const { getGatewayUrl } = useIPFS();
  const { ensureAuth, getAuthHeaders } = useSIWE();

  const milestones = campaign?.milestones || [];
  const isCreator = campaign?.creator_address?.toLowerCase() === connectedAddress?.toLowerCase();
  const isBrand = campaign?.brand_address?.toLowerCase() === connectedAddress?.toLowerCase();

  const metMilestones = milestones.filter((m) => m.status === "met" || m.status === "MET").length;
  const failedMilestones = milestones.filter((m) => m.status === "failed" || m.status === "FAILED").length;
  const pendingMilestones = milestones.filter((m) => m.status === "pending" || m.status === "PENDING").length;

  // FIX 3: totalUSDC is already in dollar units — don't multiply by 1_000_000 when passing to formatUSDC
  const totalUSDC = milestones.reduce(
    (s, m) => s + parseFloat(m.tranche_usdc || m.trancheAmount || 0),
    0
  );
  const releasedUSDC = parseFloat(campaign?.total_released_usdc || 0);

  const handleProofSubmit = async ({ milestoneIndex, contentUrl, contentId, platform }) => {
    await ensureAuth();
    const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const res = await fetch(`${API_BASE}/campaigns/${id}/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        creatorAddress: connectedAddress,
        milestoneIndex,
        platform,
        contentUrl,
        contentId,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Failed to submit proof");
    }
    const data = await res.json();
    refetch();
    return data;
  };

  const copyAddress = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (isLoading) return <PageLoader />;

  if (error || !campaign) {
    return (
      <PageLayout>
        <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", padding: "0 24px" }}>
          <AlertCircle size={32} style={{ color: DANGER, marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Campaign not found</h2>
          <p style={{ fontSize: 14, color: MUTED, marginBottom: 24 }}>
            This campaign doesn't exist or hasn't been synced yet.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              padding: "10px 20px", borderRadius: 9,
              background: TEXT, color: "#000",
              fontWeight: 600, fontSize: 13,
              border: "none", cursor: "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <WalletGuard>
      <PageLayout>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 0 80px" }}>

          {/* Back button */}
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ x: -3 }}
            onClick={() => navigate("/dashboard")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none",
              color: MUTED, fontSize: 13, cursor: "pointer",
              marginBottom: 24, padding: 0,
            }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </motion.button>

          {/* Header */}
          <div
            style={{
              display: "grid", gridTemplateColumns: "1fr auto",
              gap: 20, alignItems: "flex-start", marginBottom: 32,
            }}
          >
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
              >
                <h1 style={{ fontSize: 26, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>
                  {campaign.title || "Untitled Campaign"}
                </h1>
                <StatusBadge status={campaign.status} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
              >
                {campaign.contract_address && (
                  <button
                    onClick={() => copyAddress(campaign.contract_address)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer",
                      color: VERY_MUTED, fontSize: 11, padding: 0,
                    }}
                  >
                    <Shield size={10} />
                    {truncateAddress(campaign.contract_address)}
                    <Copy size={9} />
                  </button>
                )}

                {/* FIX 4: Restored missing opening <a> tag for explorer link */}
                {campaign.contract_address && (
                  <a
                    href={explorerAddressUrl(campaign.contract_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      color: VERY_MUTED, fontSize: 11, textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={10} />
                    View on {EXPLORER_NAME}
                  </a>
                )}

                {/* FIX 5: Restored missing opening <a> tag for IPFS brief link in header */}
                {campaign.ipfs_brief_cid && (
                  <a
                    href={getGatewayUrl(campaign.ipfs_brief_cid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      color: VERY_MUTED, fontSize: 11, textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={10} />
                    View brief on IPFS
                  </a>
                )}
              </motion.div>
            </div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => refetch()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 9,
                background: SURFACE2, border: `1px solid ${BORDER}`,
                color: MUTED, fontSize: 12, cursor: "pointer",
              }}
            >
              <RefreshCw size={12} /> Refresh
            </motion.button>
          </div>

          {/* Stats row — FIX 3 applied: totalUSDC passed directly, not * 1_000_000 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
            {[
              { label: "Total locked", value: `$${formatUSDC(totalUSDC)}`, icon: Lock },
              {
                label: "Released",
                value: `$${formatUSDC(releasedUSDC)}`,
                icon: CheckCircle,
                color: releasedUSDC > 0 ? SUCCESS : undefined,
              },
              {
                label: "Milestones",
                value: `${metMilestones}/${milestones.length}`,
                icon: Activity,
                color: milestones.length > 0 && metMilestones === milestones.length ? SUCCESS : undefined,
              },
              { label: "Status", value: campaign.status, icon: Zap },
            ].map(({ label, value, icon: Icon, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                style={{
                  padding: "16px 18px", borderRadius: 12,
                  background: SURFACE, border: `1px solid ${BORDER}`,
                }}
              >
                <div
                  style={{
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", marginBottom: 8,
                  }}
                >
                  <p style={{ fontSize: 11, color: VERY_MUTED }}>{label}</p>
                  <Icon size={12} style={{ color: color || VERY_MUTED }} />
                </div>
                <p
                  style={{
                    fontSize: 18, fontWeight: 800, color: color || TEXT,
                    fontFamily: "monospace", letterSpacing: -0.5,
                    textTransform: "capitalize",
                  }}
                >
                  {value}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Main grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

            {/* Left — applicants (brand only) + milestones */}
            <div>
              {isBrand && (
                <ApplicantsPanel
                  campaignId={id}
                  campaignIdOnchain={campaign.campaign_id_onchain}
                  campaignStatus={campaign.status}
                  brandAddress={connectedAddress}
                  applications={applications}
                />
              )}

              <div
                style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Milestones</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { count: metMilestones, label: "met", color: SUCCESS },
                    { count: pendingMilestones, label: "pending", color: WARNING },
                    { count: failedMilestones, label: "failed", color: DANGER },
                  ]
                    .filter(({ count }) => count > 0)
                    .map(({ count, label, color }) => (
                      <span key={label} style={{ fontSize: 11, color, fontWeight: 600 }}>
                        {count} {label}
                      </span>
                    ))}
                </div>
              </div>

              {milestones.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px", textAlign: "center",
                    borderRadius: 12, background: SURFACE, border: `1px solid ${BORDER}`,
                  }}
                >
                  <Activity size={24} style={{ color: VERY_MUTED, marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: MUTED }}>No milestones found</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {milestones.map((milestone, i) => (
                    <MilestoneCard
                      key={i}
                      milestone={milestone}
                      index={i}
                      escrowAddress={campaign.contract_address}
                      isCreator={isCreator}
                      onProofSubmit={handleProofSubmit}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right — info panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Apply — shown to creators on open campaigns */}
              {campaign.status === "open" && !isBrand && (
                <ApplyPanel
                  campaignId={id}
                  connectedAddress={connectedAddress}
                  applications={applications}
                />
              )}

              {/* Withdraw — brand on open campaigns */}
              {campaign.status === "open" && isBrand && (
                <WithdrawPanel
                  campaignId={id}
                  escrowAddress={campaign.contract_address}
                  brandAddress={connectedAddress}
                />
              )}

              {/* Parties */}
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                style={{
                  padding: "18px", borderRadius: 12,
                  background: SURFACE, border: `1px solid ${BORDER}`,
                }}
              >
                <p
                  style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: 1.5, color: VERY_MUTED, marginBottom: 14,
                  }}
                >
                  Parties
                </p>

                {/* FIX 2: Renamed destructured `address` → `addr` to avoid shadowing connectedAddress */}
                {[
                  { label: "Brand", addr: campaign.brand_address, isYou: isBrand },
                  { label: "Creator", addr: campaign.creator_address, isYou: isCreator },
                ].map(({ label, addr, isYou }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", marginBottom: 3,
                      }}
                    >
                      <span style={{ fontSize: 11, color: VERY_MUTED }}>{label}</span>
                      {isYou && (
                        <span
                          style={{
                            fontSize: 9, fontWeight: 700, color: MUTED,
                            background: SURFACE2, padding: "2px 6px", borderRadius: 4,
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>
                    {addr ? (
                      <button
                        onClick={() => copyAddress(addr)}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          background: "none", border: "none", cursor: "pointer",
                          color: MUTED, fontSize: 11, fontFamily: "monospace", padding: 0,
                        }}
                      >
                        {truncateAddress(addr)}
                        <Copy size={9} />
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: VERY_MUTED, fontStyle: "italic" }}>
                        Not assigned yet
                      </span>
                    )}
                  </div>
                ))}
              </motion.div>

              {/* IPFS brief */}
              {campaign.ipfs_brief_cid && (
                <motion.div
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}
                  style={{
                    padding: "18px", borderRadius: 12,
                    background: SURFACE, border: `1px solid ${BORDER}`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: 1.5, color: VERY_MUTED, marginBottom: 12,
                    }}
                  >
                    Campaign brief
                  </p>

                  {/* FIX 6: Restored missing opening <a> tag for Campaign brief IPFS link */}
                  <a
                    href={getGatewayUrl(campaign.ipfs_brief_cid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "9px 12px", borderRadius: 8,
                      background: SURFACE2, border: `1px solid ${BORDER}`,
                      color: MUTED, fontSize: 11, textDecoration: "none",
                      fontFamily: "monospace",
                    }}
                  >
                    <ExternalLink size={10} />
                    {campaign.ipfs_brief_cid.slice(0, 20)}...
                  </a>
                  <p style={{ fontSize: 10, color: VERY_MUTED, marginTop: 6 }}>
                    Pinned to IPFS · Immutable
                  </p>
                </motion.div>
              )}

              {/* Oracle info */}
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  padding: "18px", borderRadius: 12,
                  background: SURFACE, border: `1px solid ${BORDER}`,
                }}
              >
                <p
                  style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: 1.5, color: VERY_MUTED, marginBottom: 12,
                  }}
                >
                  Verification
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Oracle", value: "Chainlink Functions" },
                    { label: "Network", value: NETWORK_NAME },
                    { label: "Automation", value: "Chainlink Upkeep" },
                    { label: "Storage", value: "IPFS + Filecoin" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: VERY_MUTED }}>{label}</span>
                      <span style={{ fontSize: 11, color: MUTED }}>{value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Creator action — profile link */}
              {isCreator && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => navigate(`/profile/${connectedAddress}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", borderRadius: 12,
                    background: SURFACE, border: `1px solid ${BORDER}`,
                    color: MUTED, fontSize: 12, cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <span>View your reputation profile</span>
                  <ArrowRight size={12} />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </PageLayout>
    </WalletGuard>
  );
}