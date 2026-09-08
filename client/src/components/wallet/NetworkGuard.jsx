// ─────────────────────────────────────────────
// NetworkGuard — Blocks interaction on the wrong chain
// ─────────────────────────────────────────────
// Contract addresses are chain-specific. Wagmi sends writes to whichever
// chain the wallet currently has selected, NOT to what's in the config — and
// an EVM call to an address holding no code succeeds with empty return data
// instead of reverting. On the wrong network a campaign deploy therefore
// costs real gas, reports success, and only fails later when the expected
// event can't be found in the receipt.
//
// This guard makes that state visible and offers a one-click switch.
// ─────────────────────────────────────────────

import { useAccount, useSwitchChain } from "wagmi";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { EXPECTED_CHAIN, EXPECTED_CHAIN_ID } from "@/config/wagmi";

export default function NetworkGuard({ children }) {
  // useAccount().chainId is the chain the *connected wallet* is on, which is
  // what actually routes a transaction. useChainId() reports the config's
  // active chain and can lag behind the wallet, so it's the wrong signal here.
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  // Nothing to guard until a wallet is attached — WalletGuard covers that case.
  if (!isConnected || chainId === EXPECTED_CHAIN_ID) {
    return children;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full text-center"
      >
        {/* Icon */}
        <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-zinc-900 border border-amber-500/20 mx-auto mb-6">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
        </div>

        {/* Text */}
        <h2 className="text-2xl font-bold text-zinc-100 mb-3">
          Wrong network
        </h2>
        <p className="text-zinc-500 mb-8 leading-relaxed">
          Influencity's contracts live on{" "}
          <span className="text-zinc-300 font-medium">{EXPECTED_CHAIN.name}</span>.
          Your wallet is connected to a different network, so transactions would
          be sent to an address that doesn't exist there — costing gas without
          doing anything.
        </p>

        {/* Switch button */}
        <motion.button
          onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
          disabled={isPending}
          whileHover={{ scale: isPending ? 1 : 1.02 }}
          whileTap={{ scale: isPending ? 1 : 0.98 }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          <ArrowLeftRight className="h-5 w-5" />
          {isPending ? "Switching..." : `Switch to ${EXPECTED_CHAIN.name}`}
        </motion.button>

        {/* Wallets that can't switch programmatically surface the reason here */}
        {error ? (
          <p className="text-xs text-red-400 mt-6">
            Couldn't switch automatically — please change the network in your
            wallet manually.
          </p>
        ) : null}

        <p className="text-xs text-zinc-600 mt-6">
          Expected chain ID: {EXPECTED_CHAIN_ID}
        </p>
      </motion.div>
    </div>
  );
}
