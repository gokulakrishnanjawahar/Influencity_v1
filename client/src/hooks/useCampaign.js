import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { useAccount } from "wagmi";
import { parseEventLogs } from "viem";
import { API_BASE } from "@/lib/constants";
import { CAMPAIGN_FACTORY_ABI, CAMPAIGN_ESCROW_ABI, USDC_ABI, CONTRACT_ADDRESSES, USDC_ADDRESS } from "@/config/contracts";
import { useSIWE } from "@/components/wallet/SIWEProvider";
import { parseUSDC } from "@/lib/constants";
import { TX_CONFIRMATIONS } from "@/config/wagmi";

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

// ─── Fetch the connected creator's applications across all campaigns ───
export function useMyApplications(walletAddress) {
  return useQuery({
    queryKey: ["my-applications", walletAddress],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/creators/${walletAddress}/applications`);
      if (!res.ok) throw new Error("Failed to fetch your applications");
      const data = await res.json();
      return data.applications || [];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
}

// ─── Fetch all open campaign listings (marketplace) ───
export function useOpenCampaigns() {
  return useQuery({
    queryKey: ["open-campaigns"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/campaigns/open`);
      if (!res.ok) throw new Error("Failed to fetch open campaigns");
      const data = await res.json();
      return data.campaigns || [];
    },
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
// Full flow: upload brief → deploy escrow → approve USDC → deposit → confirm.
// Pass { campaignData, onProgress } — onProgress(step) is called with 1..5.
export function useCreateCampaign() {
  const { getAuthHeaders, ensureAuth } = useSIWE();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: async ({ campaignData, onProgress }) => {
      const report = (s) => onProgress && onProgress(s);

      // Sign a SIWE message once per session before hitting any auth-gated routes
      await ensureAuth();

      // 1. Upload brief to IPFS via backend
      report(1);
      const res = await fetch(`${API_BASE}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(campaignData),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to upload campaign brief");
      }
      const { contractParams, ipfsBriefCid, ipfsBriefUrl } = await res.json();

      const totalAmount = contractParams.trancheAmounts.reduce(
        (sum, a) => sum + BigInt(a),
        0n
      );

      // 2. Deploy the escrow via the factory
      report(2);
      const createHash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.campaignFactory,
        abi: CAMPAIGN_FACTORY_ABI,
        functionName: "createCampaign",
        args: [
          contractParams.ipfsBriefHash,
          contractParams.platforms,
          contractParams.metricTypes,
          contractParams.thresholds.map((t) => BigInt(t)),
          contractParams.trancheAmounts.map((t) => BigInt(t)),
          contractParams.deadlines.map((d) => BigInt(d)),
          contractParams.contentIds,
        ],
      });
      // The escrow address is read out of this receipt's logs and then written
      // to Supabase — it must not be able to reorg away underneath us.
      const createReceipt = await publicClient.waitForTransactionReceipt({
        hash: createHash,
        confirmations: TX_CONFIRMATIONS,
      });

      // Decode the CampaignCreated event to get the escrow address + on-chain id
      const events = parseEventLogs({
        abi: CAMPAIGN_FACTORY_ABI,
        logs: createReceipt.logs,
        eventName: "CampaignCreated",
      });
      if (!events.length) {
        throw new Error("Campaign deployed but CampaignCreated event not found");
      }
      const escrowAddress = events[0].args.escrowAddress;
      const campaignIdOnchain = Number(events[0].args.campaignId);

      // 3. Approve the escrow to pull USDC
      report(3);
      const approveHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "approve",
        args: [escrowAddress, totalAmount],
      });
      await publicClient.waitForTransactionReceipt({
        hash: approveHash,
        confirmations: TX_CONFIRMATIONS,
      });

      // 4. Deposit USDC into the escrow
      report(4);
      const depositHash = await writeContractAsync({
        address: escrowAddress,
        abi: CAMPAIGN_ESCROW_ABI,
        functionName: "deposit",
        args: [totalAmount],
      });
      await publicClient.waitForTransactionReceipt({
        hash: depositHash,
        confirmations: TX_CONFIRMATIONS,
      });

      // 5. Confirm — persist the campaign + milestones to the backend
      report(5);
      const confirmRes = await fetch(`${API_BASE}/campaigns/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          campaignIdOnchain,
          brandAddress: address,
          contractAddress: escrowAddress,
          ipfsBriefCid,
          ipfsBriefUrl,
          title: campaignData.title,
          description: campaignData.description,
          totalDepositUsdc: totalAmount.toString(),
          milestones: campaignData.milestones,
        }),
      });
      if (!confirmRes.ok) {
        const e = await confirmRes.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save campaign");
      }

      return { escrowAddress, campaignIdOnchain, txHash: depositHash };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", address] });
      queryClient.invalidateQueries({ queryKey: ["open-campaigns"] });
    },
  });
}

// ─── Fetch applications for a campaign ───
export function useCampaignApplications(idOrAddress) {
  return useQuery({
    queryKey: ["applications", idOrAddress],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/campaigns/${idOrAddress}/applications`);
      if (!res.ok) throw new Error("Failed to fetch applications");
      const data = await res.json();
      return data.applications || [];
    },
    enabled: !!idOrAddress,
    staleTime: 15_000,
  });
}

// ─── Apply to an open campaign (creator) ───
export function useApplyToCampaign(idOrAddress) {
  const { getAuthHeaders, ensureAuth } = useSIWE();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ creatorAddress, pitchMessage, socialLinks }) => {
      await ensureAuth();
      const res = await fetch(`${API_BASE}/campaigns/${idOrAddress}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ creatorAddress, pitchMessage, socialLinks }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to submit application");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", idOrAddress] });
    },
  });
}

// ─── Select a creator from applicants (brand) ───
// Two-step: on-chain factory.assignCreator → backend /select to record it.
export function useSelectCreator(idOrAddress) {
  const { getAuthHeaders, ensureAuth } = useSIWE();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignIdOnchain, brandAddress, creatorAddress }) => {
      await ensureAuth();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.campaignFactory,
        abi: CAMPAIGN_FACTORY_ABI,
        functionName: "assignCreator",
        args: [BigInt(campaignIdOnchain), creatorAddress],
      });
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: TX_CONFIRMATIONS,
      });

      const res = await fetch(`${API_BASE}/campaigns/${idOrAddress}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ brandAddress, creatorAddress }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to record selection");
      }
      return { ...(await res.json()), txHash: hash };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", idOrAddress] });
      queryClient.invalidateQueries({ queryKey: ["applications", idOrAddress] });
      queryClient.invalidateQueries({ queryKey: ["open-campaigns"] });
    },
  });
}

// ─── Cancel / withdraw an open campaign (brand) ───
// Two-step: on-chain escrow.cancelCampaign → backend /cancel to close out.
export function useCancelCampaign(idOrAddress) {
  const { getAuthHeaders, ensureAuth } = useSIWE();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ escrowAddress, brandAddress }) => {
      await ensureAuth();
      const hash = await writeContractAsync({
        address: escrowAddress,
        abi: CAMPAIGN_ESCROW_ABI,
        functionName: "cancelCampaign",
        args: [],
      });
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: TX_CONFIRMATIONS,
      });

      const res = await fetch(`${API_BASE}/campaigns/${idOrAddress}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ brandAddress }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to record cancellation");
      }
      return { ...(await res.json()), txHash: hash };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", idOrAddress] });
      queryClient.invalidateQueries({ queryKey: ["applications", idOrAddress] });
      queryClient.invalidateQueries({ queryKey: ["open-campaigns"] });
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