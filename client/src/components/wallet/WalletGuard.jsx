// ─────────────────────────────────────────────
// WalletGuard — Redirects if wallet not connected
// ─────────────────────────────────────────────

import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { Wallet, Shield } from "lucide-react";
import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";

export default function WalletGuard({ children }) {
  const { isConnected, isConnecting } = useAccount();

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-zinc-800 border-t-violet-500 animate-spin" />
          <p className="text-sm text-zinc-500">Connecting wallet...</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-md w-full text-center"
        >
          {/* Icon */}
          <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto mb-6 glow-purple">
            <Shield className="h-10 w-10 text-violet-400" />
          </div>

          {/* Text */}
          <h2 className="text-2xl font-bold text-zinc-100 mb-3">
            Connect your wallet
          </h2>
          <p className="text-zinc-500 mb-8 leading-relaxed">
            You need to connect a wallet to access this page.
            Influencity uses your wallet as your identity — no username or password required.
          </p>

          {/* Connect button */}
          <RainbowConnectButton.Custom>
            {({ openConnectModal }) => (
              <motion.button
                onClick={openConnectModal}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
              >
                <Wallet className="h-5 w-5" />
                Connect Wallet
              </motion.button>
            )}
          </RainbowConnectButton.Custom>

          {/* Footer note */}
          <p className="text-xs text-zinc-600 mt-6">
            Supports MetaMask, Coinbase Wallet, and WalletConnect
          </p>
        </motion.div>
      </div>
    );
  }

  return children;
}