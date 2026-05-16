import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { REPUTATION_TOKEN_ABI, CONTRACT_ADDRESSES } from "@/config/contracts";
import { API_BASE } from "@/lib/constants";

// ─── On-chain reputation score + history ───
export function useReputation(walletAddress) {
  const score = useReadContract({
    address: CONTRACT_ADDRESSES.reputationToken,
    abi: REPUTATION_TOKEN_ABI,
    functionName: "reputationScore",
    args: [walletAddress],
    query: {
      enabled: !!walletAddress,
      staleTime: 60_000,
    },
  });

  const history = useReadContract({
    address: CONTRACT_ADDRESSES.reputationToken,
    abi: REPUTATION_TOKEN_ABI,
    functionName: "getMintHistory",
    args: [walletAddress],
    query: {
      enabled: !!walletAddress,
      staleTime: 60_000,
    },
  });

  const mintHistory = history.data?.map((record) => ({
    campaignId: Number(record.campaignId),
    milestoneIndex: Number(record.milestoneIndex),
    tokenId: record.tokenId.toString(),
    mintedAt: Number(record.mintedAt),
  })) || [];

  return {
    score: score.data ? Number(score.data) : 0,
    mintHistory,
    isLoading: score.isLoading || history.isLoading,
    error: score.error || history.error,
  };
}

// ─── Off-chain reputation events from backend ───
export function useReputationEvents(walletAddress) {
  return useQuery({
    queryKey: ["reputation", walletAddress],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/creators/${walletAddress}/reputation`);
      if (!res.ok) throw new Error("Failed to fetch reputation");
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });
}