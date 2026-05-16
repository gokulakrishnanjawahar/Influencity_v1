import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function timeUntil(timestamp) {
  if (!timestamp) return "—";
  const now = Date.now();
  const target = Number(timestamp) * 1000;
  const diff = target - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return "< 1h left";
}

export function milestoneProgress(current, threshold) {
  if (!threshold || threshold === 0) return 0;
  return Math.min(Math.round((Number(current) / Number(threshold)) * 100), 100);
}

export function platformGradient(platform) {
  const gradients = {
    YOUTUBE: "from-red-500/20 to-red-500/5",
    TWITCH: "from-purple-500/20 to-purple-500/5",
    LINKEDIN: "from-blue-500/20 to-blue-500/5",
  };
  return gradients[platform] || "from-zinc-500/20 to-zinc-500/5";
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDeadline(timestamp) {
  if (!timestamp) return "—";
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatUSDC(amount) {
  if (!amount) return "0.00";
  return (Number(amount) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMetric(value) {
  if (!value) return "0";
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}