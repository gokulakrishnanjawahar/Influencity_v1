// ─────────────────────────────────────────────
// Creator Routes
// ─────────────────────────────────────────────
// GET /creators/:address — public creator profile
//                          combines off-chain DB data
//                          with on-chain reputation tokens
// ─────────────────────────────────────────────

import express from "express";
import { ethers } from "ethers";
import {
  getUserByWallet,
  getCampaignsForWallet,
  getReputationEvents,
} from "../services/supabase.js";
import { getCreatorReputation } from "../services/blockchain.js";

const router = express.Router();

// ─────────────────────────────────────────────
// GET /creators/:address
// Returns full creator profile — DB data + on-chain reputation
// ─────────────────────────────────────────────

router.get("/:address", async (req, res, next) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const walletAddress = address.toLowerCase();

    // Fetch all data in parallel — DB queries + on-chain read
    const [user, campaigns, reputationEvents, onChainReputation] =
      await Promise.allSettled([
        getUserByWallet(walletAddress),
        getCampaignsForWallet(walletAddress),
        getReputationEvents(walletAddress),
        getCreatorReputation(walletAddress),
      ]);

    // Extract values — use null if any failed
    const userData = user.status === "fulfilled" ? user.value : null;
    const campaignData = campaigns.status === "fulfilled" ? campaigns.value : [];
    const reputationData = reputationEvents.status === "fulfilled" ? reputationEvents.value : [];
    const onChainData = onChainReputation.status === "fulfilled" ? onChainReputation.value : null;

    // Filter to only creator campaigns
    const creatorCampaigns = campaignData.filter(
      (c) => c.creator_address === walletAddress
    );

    // Build campaign summary stats
    const stats = buildCreatorStats(creatorCampaigns, reputationData);

    res.json({
      success: true,
      profile: {
        walletAddress,
        displayName: userData?.display_name || null,
        avatarUrl: userData?.avatar_url || null,
        role: userData?.role || "creator",
        memberSince: userData?.created_at || null,
      },
      stats,
      campaigns: creatorCampaigns.map(formatCampaign),
      reputation: {
        // Off-chain reputation events from Supabase
        events: reputationData,
        totalTokens: reputationData.length,
        // On-chain reputation score from ReputationToken contract
        onChainScore: onChainData?.reputationScore || 0,
        onChainHistory: onChainData?.mintHistory || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// GET /creators/:address/campaigns
// Returns only the creator's campaigns with milestone details
// ─────────────────────────────────────────────

router.get("/:address/campaigns", async (req, res, next) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const walletAddress = address.toLowerCase();
    const campaigns = await getCampaignsForWallet(walletAddress);

    const creatorCampaigns = campaigns
      .filter((c) => c.creator_address === walletAddress)
      .map(formatCampaign);

    res.json({
      success: true,
      walletAddress,
      campaigns: creatorCampaigns,
      total: creatorCampaigns.length,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// GET /creators/:address/reputation
// Returns only the on-chain reputation token history
// ─────────────────────────────────────────────

router.get("/:address/reputation", async (req, res, next) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const walletAddress = address.toLowerCase();

    const [reputationEvents, onChainReputation] = await Promise.allSettled([
      getReputationEvents(walletAddress),
      getCreatorReputation(walletAddress),
    ]);

    const events = reputationEvents.status === "fulfilled"
      ? reputationEvents.value : [];
    const onChain = onChainReputation.status === "fulfilled"
      ? onChainReputation.value : null;

    res.json({
      success: true,
      walletAddress,
      totalTokens: events.length,
      onChainScore: onChain?.reputationScore || 0,
      events,
      onChainHistory: onChain?.mintHistory || [],
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/// @notice Builds creator stats from their campaign history
function buildCreatorStats(campaigns, reputationEvents) {
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const completedCampaigns = campaigns.filter((c) => c.status === "completed").length;

  const totalEarned = campaigns.reduce((sum, c) => {
    return sum + (parseFloat(c.total_released_usdc) || 0);
  }, 0);

  const totalMilestonesAcross = campaigns.reduce((sum, c) => {
    return sum + (c.milestones?.length || 0);
  }, 0);

  const metMilestones = campaigns.reduce((sum, c) => {
    return sum + (c.milestones?.filter((m) => m.status === "met").length || 0);
  }, 0);

  const successRate = totalMilestonesAcross > 0
    ? Math.round((metMilestones / totalMilestonesAcross) * 100)
    : 0;

  return {
    totalCampaigns,
    activeCampaigns,
    completedCampaigns,
    totalEarned,
    reputationTokens: reputationEvents.length,
    milestoneSuccessRate: successRate,
  };
}

/// @notice Formats a campaign record for API response
function formatCampaign(campaign) {
  return {
    id: campaign.id,
    campaignIdOnchain: campaign.campaign_id_onchain,
    contractAddress: campaign.contract_address,
    title: campaign.title,
    brandAddress: campaign.brand_address,
    status: campaign.status,
    totalDepositUsdc: campaign.total_deposit_usdc,
    totalReleasedUsdc: campaign.total_released_usdc,
    ipfsBriefUrl: campaign.ipfs_brief_url,
    createdAt: campaign.created_at,
    milestones: campaign.milestones?.map((m) => ({
      index: m.milestone_index,
      platform: m.platform,
      metricType: m.metric_type,
      threshold: m.threshold,
      trancheUsdc: m.tranche_usdc,
      deadline: m.deadline,
      status: m.status,
      verifiedValue: m.verified_value,
      ipfsProofUrl: m.ipfs_proof_cid
        ? `https://gateway.pinata.cloud/ipfs/${m.ipfs_proof_cid}`
        : null,
    })) || [],
  };
}

export default router;