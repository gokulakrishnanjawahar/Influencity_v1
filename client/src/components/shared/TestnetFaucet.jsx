// ─────────────────────────────────────────────
// TestnetFaucet — mint yourself test USDC
// ─────────────────────────────────────────────
// Every flow in the app needs USDC: brands fund escrows, and a second wallet
// needs a balance to be a believable creator. Only the deploy wallet is minted
// any, so without this a visitor (or the demo's second wallet) is stuck.
//
// Backed by MockUSDC.faucet(), which is permissionless by design and exists
// only on testnet — hence the chain guard. Never rendered against real USDC.
// ─────────────────────────────────────────────

import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { USDC_ABI, USDC_ADDRESS } from "@/config/contracts";
import { EXPECTED_CHAIN_ID, TX_CONFIRMATIONS } from "@/config/wagmi";
import { formatUSDC } from "@/lib/constants";

const AMOUNT = 1000n * 1_000_000n; // 1,000 USDC at 6 decimals
const POLYGON_MAINNET = 137;

export default function TestnetFaucet() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [minting, setMinting] = useState(false);

  const { data: balance, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && USDC_ADDRESS) },
  });

  // Real USDC has no faucet, so this must never appear on mainnet.
  if (EXPECTED_CHAIN_ID === POLYGON_MAINNET) return null;
  if (!isConnected || !USDC_ADDRESS) return null;

  async function handleMint() {
    setMinting(true);
    try {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "faucet",
        args: [AMOUNT],
      });

      toast.loading("Minting test USDC...", { id: "faucet" });
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: TX_CONFIRMATIONS,
      });

      await refetch();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("1,000 test USDC minted", { id: "faucet" });
    } catch (err) {
      toast.error(err?.shortMessage || err?.message || "Faucet failed", {
        id: "faucet",
      });
    } finally {
      setMinting(false);
    }
  }

  return (
    <motion.button
      onClick={handleMint}
      disabled={minting}
      whileHover={{ scale: minting ? 1 : 1.01 }}
      whileTap={{ scale: minting ? 1 : 0.99 }}
      title="Mint yourself test USDC on this testnet"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 9,
        background: "#161616",
        border: "1px solid #2a2a2a",
        color: minting ? "#888888" : "#f5f5f5",
        fontSize: 12,
        fontWeight: 600,
        cursor: minting ? "default" : "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      <Coins className="h-3.5 w-3.5" />
      {minting
        ? "Minting..."
        : balance !== undefined
        ? `${formatUSDC(balance)} USDC · Get more`
        : "Get test USDC"}
    </motion.button>
  );
}
