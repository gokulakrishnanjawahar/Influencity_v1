// ─────────────────────────────────────────────
// Wagmi + RainbowKit Config
// ─────────────────────────────────────────────
// Configures wallet connections for Base and Base Sepolia.
// RainbowKit handles the wallet UI (MetaMask, Coinbase, WalletConnect).
// Wagmi handles the actual blockchain interactions.
// ─────────────────────────────────────────────

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Influencity",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [baseSepolia, base],
  ssr: false,
});

export const SUPPORTED_CHAINS = [baseSepolia, base];
export const DEFAULT_CHAIN = baseSepolia;