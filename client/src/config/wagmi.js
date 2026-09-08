// ─────────────────────────────────────────────
// Wagmi + RainbowKit Config
// ─────────────────────────────────────────────
// Configures wallet connections for Polygon and Polygon Amoy.
// RainbowKit handles the wallet UI (MetaMask, Coinbase, WalletConnect).
// Wagmi handles the actual blockchain interactions.
// ─────────────────────────────────────────────

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygon, polygonAmoy } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Influencity",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [polygonAmoy, polygon],
  ssr: false,
});

export const SUPPORTED_CHAINS = [polygonAmoy, polygon];
export const DEFAULT_CHAIN = polygonAmoy;

// ─────────────────────────────────────────────
// Expected Chain
// ─────────────────────────────────────────────
// The single chain this deployment's contract addresses belong to.
// Contract addresses in config/contracts.js are chain-specific, so sending
// a transaction while the wallet is on any other chain silently targets an
// address with no code — which SUCCEEDS on the EVM rather than reverting.
// NetworkGuard compares the wallet's active chain against this value.
//
// Override per environment with VITE_CHAIN_ID (80002 = Amoy, 137 = Polygon).
export const EXPECTED_CHAIN_ID = Number(
  import.meta.env.VITE_CHAIN_ID ?? polygonAmoy.id
);

export const EXPECTED_CHAIN =
  SUPPORTED_CHAINS.find((c) => c.id === EXPECTED_CHAIN_ID) ?? polygonAmoy;

// ─────────────────────────────────────────────
// Transaction Confirmations
// ─────────────────────────────────────────────
// viem's waitForTransactionReceipt defaults to 1 confirmation. That was safe
// on Base — an OP-stack L2 with a single sequencer, where a mined block does
// not reorg in practice. Polygon PoS is a real PoS chain with ~2s blocks
// where short reorgs are routine and checkpoint finality takes minutes.
//
// Every write in useCampaign.js is "send tx → read receipt → persist the
// result to Supabase". At 1 confirmation a reorg between the receipt and the
// POST leaves a database row referencing a contract the chain never kept.
// Waiting a few blocks costs ~6s and removes that window.
export const TX_CONFIRMATIONS = 3;

// ─────────────────────────────────────────────
// Block Explorer Helpers
// ─────────────────────────────────────────────
// Derived from the chain definition rather than hardcoded, so switching
// networks never leaves a stale explorer domain behind in the UI.

/// @notice Base explorer URL for the expected chain (no trailing slash)
export const EXPLORER_URL =
  EXPECTED_CHAIN.blockExplorers?.default?.url ?? "https://polygonscan.com";

/// @notice Human-readable explorer name, e.g. "PolygonScan"
export const EXPLORER_NAME =
  EXPECTED_CHAIN.blockExplorers?.default?.name ?? "PolygonScan";

/// @notice Human-readable network name, e.g. "Polygon Amoy"
export const NETWORK_NAME = EXPECTED_CHAIN.name;

/// @notice Native gas token symbol for the expected chain (POL on Polygon)
export const NATIVE_CURRENCY_SYMBOL = EXPECTED_CHAIN.nativeCurrency.symbol;

/// @notice Explorer link for an address
export const explorerAddressUrl = (address) =>
  `${EXPLORER_URL}/address/${address}`;

/// @notice Explorer link for a transaction hash
export const explorerTxUrl = (hash) => `${EXPLORER_URL}/tx/${hash}`;
