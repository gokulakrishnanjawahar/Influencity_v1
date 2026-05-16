// ─────────────────────────────────────────────
// App Constants
// ─────────────────────────────────────────────

// Platform enum mapping (matches MilestoneLib.sol)
export const PLATFORMS = {
  0: "YOUTUBE",
  1: "TWITCH",
  2: "LINKEDIN",
};

export const PLATFORM_LABELS = {
  YOUTUBE: "YouTube",
  TWITCH: "Twitch",
  LINKEDIN: "LinkedIn",
};

// MetricType enum mapping (matches MilestoneLib.sol)
export const METRIC_TYPES = {
  0: "VIEWS",
  1: "CLICKS",
  2: "FOLLOWERS",
  3: "WATCH_TIME",
  4: "CONCURRENT_VIEWERS",
};

export const METRIC_LABELS = {
  VIEWS: "Views",
  CLICKS: "Clicks",
  FOLLOWERS: "Followers",
  WATCH_TIME: "Watch Time",
  CONCURRENT_VIEWERS: "Concurrent Viewers",
};

// MilestoneStatus enum mapping (matches MilestoneLib.sol)
export const MILESTONE_STATUS = {
  0: "PENDING",
  1: "MET",
  2: "FAILED",
};

// Platform metric options for Create Campaign form
export const PLATFORM_METRICS = {
  YOUTUBE: ["VIEWS", "FOLLOWERS", "WATCH_TIME"],
  TWITCH: ["CONCURRENT_VIEWERS", "FOLLOWERS", "VIEWS"],
  LINKEDIN: ["VIEWS", "CLICKS", "FOLLOWERS"],
};

// USDC decimals
export const USDC_DECIMALS = 6;

// Format USDC from contract (divide by 1e6)
export const formatUSDC = (amount) => {
  if (!amount) return "0";
  return (Number(amount) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Parse USDC to contract format (multiply by 1e6)
export const parseUSDC = (amount) => {
  return BigInt(Math.floor(Number(amount) * 1e6));
};

// Format large numbers with K/M suffix
export const formatMetric = (value) => {
  if (!value) return "0";
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

// Format unix timestamp to readable date
export const formatDeadline = (timestamp) => {
  if (!timestamp) return "—";
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Campaign status colors
export const STATUS_COLORS = {
  active: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  completed: "text-green-400 bg-green-400/10 border-green-400/20",
  pending: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  cancelled: "text-red-400 bg-red-400/10 border-red-400/20",
};

// Milestone status colors
export const MILESTONE_STATUS_COLORS = {
  PENDING: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  MET: "text-green-400 bg-green-400/10 border-green-400/20",
  FAILED: "text-red-400 bg-red-400/10 border-red-400/20",
};

// API base URL
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Minimum campaign deposit in USDC
export const MIN_CAMPAIGN_DEPOSIT = 100;

// Max milestones per campaign
export const MAX_MILESTONES = 10;