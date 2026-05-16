import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { CAMPAIGN_ESCROW_ABI } from "@/config/contracts";
import { MILESTONE_STATUS, PLATFORMS, METRIC_TYPES } from "@/lib/constants";

// ─── Read milestones from contract ───
export function useMilestones(escrowAddress) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: escrowAddress,
    abi: CAMPAIGN_ESCROW_ABI,
    functionName: "getMilestones",
    query: {
      enabled: !!escrowAddress,
      refetchInterval: 30_000,
    },
  });

  const milestones = data?.map((m, i) => ({
    index: i,
    platform: PLATFORMS[Number(m.platform)] || "YOUTUBE",
    metricType: METRIC_TYPES[Number(m.metricType)] || "VIEWS",
    threshold: m.threshold.toString(),
    trancheAmount: m.trancheAmount.toString(),
    deadline: Number(m.deadline),
    contentId: m.contentId,
    ipfsProofHash: m.ipfsProofHash,
    status: MILESTONE_STATUS[Number(m.status)] || "PENDING",
  })) || [];

  return { milestones, isLoading, error, refetch };
}

// ─── Read single milestone ───
export function useMilestone(escrowAddress, index) {
  const { data, isLoading, error } = useReadContract({
    address: escrowAddress,
    abi: CAMPAIGN_ESCROW_ABI,
    functionName: "getMilestone",
    args: [BigInt(index)],
    query: {
      enabled: !!escrowAddress && index !== undefined,
      refetchInterval: 15_000,
    },
  });

  if (!data) return { milestone: null, isLoading, error };

  return {
    milestone: {
      index,
      platform: PLATFORMS[Number(data.platform)] || "YOUTUBE",
      metricType: METRIC_TYPES[Number(data.metricType)] || "VIEWS",
      threshold: data.threshold.toString(),
      trancheAmount: data.trancheAmount.toString(),
      deadline: Number(data.deadline),
      contentId: data.contentId,
      ipfsProofHash: data.ipfsProofHash,
      status: MILESTONE_STATUS[Number(data.status)] || "PENDING",
    },
    isLoading,
    error,
  };
}