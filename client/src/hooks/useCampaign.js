import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAccount } from "wagmi";
import { API_BASE } from "@/lib/constants";
import { CAMPAIGN_FACTORY_ABI, CAMPAIGN_ESCROW_ABI, USDC_ABI, CONTRACT_ADDRESSES, USDC_ADDRESS } from "@/config/contracts";
import { useSIWE } from "@/components/wallet/SIWEProvider";
import { parseUSDC } from "@/lib/constants";

// ─── Fetch campaign from backend ───
export function useCampaign(idOrAddress) {
  return useQuery({
    queryKey: ["campaign", idOrAddress],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/campaigns/${idOrAddress}`);
      if (!res.ok) throw new Error("Campaign not found");
      const data = await res.json();
      return data.campaign;
    },
    enabled: !!idOrAddress,
    staleTime: 30_000,
  });
}

// ─── Fetch all campaigns for a wallet ───
export function useCampaigns(walletAddress) {
  return useQuery({
    queryKey: ["campaigns", walletAddress],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/campaigns?wallet=${walletAddress}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const data = await res.json();
      return data.campaigns || [];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
}

// ─── Read live contract state ───
export function useCampaignContract(escrowAddress) {
  const balance = useReadContract({
    address: escrowAddress,
    abi: CAMPAIGN_ESCROW_ABI,
    functionName: "getBalance",
    query: { enabled: !!escrowAddress },
  });

  const milestoneCount = useReadContract({
    address: escrowAddress,
    abi: CAMPAIGN_ESCROW_ABI,
    functionName: "getMilestoneCount",
    query: { enabled: !!escrowAddress },
  });

  const isFinalized = useReadContract({
    address: escrowAddress,
    abi: CAMPAIGN_ESCROW_ABI,
    functionName: "isFinalized",
    query: { enabled: !!escrowAddress },
  });

  return { balance, milestoneCount, isFinalized };
}

// ─── Create campaign ───
export function useCreateCampaign() {
  const { getAuthHeaders } = useSIWE();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (campaignData) => {
      // 1. Upload brief to IPFS via backend
      const res = await fetch(`${API_BASE}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(campaignData),
      });
      if (!res.ok) throw new Error("Failed to upload campaign brief");
      const { contractParams, campaignId, ipfsBriefCid } = await res.json();

      // 2. Approve USDC
      const totalAmount = contractParams.trancheAmounts.reduce(
        (sum, a) => sum + BigInt(a), 0n
      );

      // 3. Deploy escrow via factory
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.campaignFactory,
        abi: CAMPAIGN_FACTORY_ABI,
        functionName: "createCampaign",
        args: [
          contractParams.creatorAddress,
          contractParams.ipfsBriefHash,
          contractParams.platforms,
          contractParams.metricTypes,
          contractParams.thresholds,
          contractParams.trancheAmounts,
          contractParams.deadlines,
          contractParams.contentIds,
        ],
      });

      return { hash, campaignId, ipfsBriefCid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", address] });
    },
  });
}

// ─── Submit proof ───
export function useSubmitProof(escrowAddress) {
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ milestoneIndex, ipfsProofCid }) => {
      const hash = await writeContractAsync({
        address: escrowAddress,
        abi: CAMPAIGN_ESCROW_ABI,
        functionName: "submitProof",
        args: [BigInt(milestoneIndex), ipfsProofCid],
      });
      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", escrowAddress] });
    },
  });
}