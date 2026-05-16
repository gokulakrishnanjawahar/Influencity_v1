// ─────────────────────────────────────────────
// ConnectButton — Custom RainbowKit Wallet Button
// ─────────────────────────────────────────────

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { Wallet, ChevronDown, LogOut, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { truncateAddress } from "@/lib/utils";

export default function ConnectButton({ className }) {
  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {!connected ? (
              <motion.button
                onClick={openConnectModal}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                 "bg-zinc-800 hover:bg-zinc-700 text-zinc-200",
              "text-sm font-medium transition-colors duration-200",
              "border border-zinc-700",
                  className
                )}
              >
                <Wallet className="h-4 w-4" />
                Connect Wallet
              </motion.button>
            ) : chain.unsupported ? (
              <motion.button
                onClick={openChainModal}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-red-600 hover:bg-red-500 text-white",
                  "text-sm font-medium transition-colors duration-200",
                  className
                )}
              >
                Wrong Network
              </motion.button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Chain indicator */}
                <motion.button
                  onClick={openChainModal}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-xs text-zinc-400"
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <img
                      src={chain.iconUrl}
                      alt={chain.name}
                      className="h-3.5 w-3.5 rounded-full"
                    />
                  )}
                  {chain.name}
                </motion.button>

                {/* Account button */}
                <motion.button
                  onClick={openAccountModal}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-lg",
                    "bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700",
                    "text-sm font-medium text-zinc-200 transition-colors duration-200",
                    className
                  )}
                >
                  {account.ensAvatar ? (
                    <img
                      src={account.ensAvatar}
                      alt={account.displayName}
                      className="h-5 w-5 rounded-full"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500 to-purple-600" />
                  )}
                  <span>{truncateAddress(account.address)}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                </motion.button>
              </div>
            )}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}