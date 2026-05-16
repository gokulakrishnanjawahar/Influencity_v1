// ─────────────────────────────────────────────
// Campaign Routes
// ─────────────────────────────────────────────

import express from "express";
import { ethers } from "ethers";
import {
  uploadCampaignBrief,
  uploadContentProof,
  buildGatewayUrl,
} from "../services/ipfs.js";
import {
  createCampaign,
  getCampaignByOnchainId,
  getCampaignByContract,
  getCampaignsForWallet,
  createMilestones,
  updateMilestoneProof,
  createContentProof,
  getOrCreateUser,
} from "../services/supabase.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// ─────────────────────────────────────────────
// POST /campaigns
// Brand uploads brief to IPFS — returns CID + contract params
// Frontend then deploys the contract and calls POST /campaigns/confirm
// ─────────────────────────────────────────────

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const {
      brandAddress,
      creatorAddress,
      title,
      description,
      milestones,
    } = req.body;

    // Verify the authenticated wallet is the brand
    if (req.walletAddress !== brandAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match brandAddress" });
    }

    // Validate inputs
    if (!creatorAddress || !ethers.isAddress(creatorAddress)) {
      return res.status(400).json({ error: "Invalid creator wallet address" });
    }
    if (!title?.trim()) {
      return res.status(400).json({ error: "Campaign title is required" });
    }
    if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
      return res.status(400).json({ error: "At least one milestone is required" });
    }

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m.platform || !m.metricType || !m.threshold ||
          !m.trancheAmount || !m.deadline || !m.contentId) {
        return res.status(400).json({
          error: `Milestone ${i} is missing required fields`,
        });
      }
    }

    // Build and upload campaign brief to IPFS
    const campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const brief = {
      campaignId,
      brandAddress: brandAddress.toLowerCase(),
      creatorAddress: creatorAddress.toLowerCase(),
      title: title.trim(),
      description: description?.trim() || "",
      milestones: milestones.map((m, i) => ({
        index: i,
        platform: m.platform,
        metricType: m.metricType,
        threshold: m.threshold,
        trancheAmount: m.trancheAmount,
        deadline: m.deadline,
        contentId: m.contentId,
      })),
      createdAt: new Date().toISOString(),
    };

    const { cid, url } = await uploadCampaignBrief(brief);

    // Return CID + contract deployment params to frontend
    res.status(201).json({
      success: true,
      campaignId,
      ipfsBriefCid: cid,
      ipfsBriefUrl: url,
      contractParams: {
        creatorAddress,
        ipfsBriefHash: cid,
        platforms: milestones.map((m) => platformToEnum(m.platform)),
        metricTypes: milestones.map((m) => metricTypeToEnum(m.metricType)),
        thresholds: milestones.map((m) => m.threshold),
        trancheAmounts: milestones.map((m) => m.trancheAmount),
        deadlines: milestones.map((m) => m.deadline),
        contentIds: milestones.map((m) => m.contentId),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /campaigns/confirm
// Called AFTER the frontend successfully deploys the contract.
// Saves the campaign + milestones to Supabase with the contract address.
// ─────────────────────────────────────────────

router.post("/confirm", requireAuth, async (req, res, next) => {
  try {
    const {
      campaignIdOnchain,
      brandAddress,
      creatorAddress,
      contractAddress,
      ipfsBriefCid,
      ipfsBriefUrl,
      title,
      description,
      totalDepositUsdc,
      milestones,
    } = req.body;

    if (req.walletAddress !== brandAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match brandAddress" });
    }

    // Ensure both users exist in DB
    await getOrCreateUser(brandAddress, "brand");
    await getOrCreateUser(creatorAddress, "creator");

    // Save campaign to Supabase
    const campaign = await createCampaign({
      campaignIdOnchain,
      brandAddress,
      creatorAddress,
      contractAddress,
      ipfsBriefCid,
      ipfsBriefUrl,
      title,
      description,
      totalDepositUsdc,
    });

    // Save milestones to Supabase
    if (milestones && milestones.length > 0) {
      await createMilestones(campaign.id, milestones);
    }

    res.status(201).json({
      success: true,
      campaign,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// GET /campaigns
// Returns all campaigns for a wallet address
// ─────────────────────────────────────────────

router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const { wallet } = req.query;
    const address = wallet || req.walletAddress;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "wallet query param required" });
    }

    const campaigns = await getCampaignsForWallet(address);

    res.json({
      success: true,
      campaigns,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// GET /campaigns/:id
// Returns campaign metadata + milestone status
// id can be on-chain campaign ID or contract address
// ─────────────────────────────────────────────

router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    let campaign;

    // Check if id is a contract address (0x...) or on-chain ID (number)
    if (ethers.isAddress(id)) {
      campaign = await getCampaignByContract(id);
    } else {
      campaign = await getCampaignByOnchainId(parseInt(id));
    }

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json({
      success: true,
      campaign,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /campaigns/:id/proof
// Creator submits content proof — uploads to IPFS + saves to Supabase
// ─────────────────────────────────────────────

router.post("/:id/proof", requireAuth, async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const {
      creatorAddress,
      milestoneIndex,
      platform,
      contentUrl,
      contentId,
    } = req.body;

    // Verify authenticated wallet is the creator
    if (req.walletAddress !== creatorAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match creatorAddress" });
    }

    if (!platform || !contentUrl || !contentId) {
      return res.status(400).json({ error: "platform, contentUrl and contentId are required" });
    }

    // Get campaign from DB
    let campaign;
    if (ethers.isAddress(campaignId)) {
      campaign = await getCampaignByContract(campaignId);
    } else {
      campaign = await getCampaignByOnchainId(parseInt(campaignId));
    }

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Verify this creator belongs to this campaign
    if (campaign.creator_address !== creatorAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not the creator of this campaign" });
    }

    // Build and upload proof to IPFS
    const proof = {
      campaignId: campaign.id,
      creatorAddress: creatorAddress.toLowerCase(),
      milestoneIndex,
      platform,
      contentUrl,
      contentId,
      submittedAt: new Date().toISOString(),
    };

    const { cid, url } = await uploadContentProof(proof);

    // Save proof to Supabase
    await createContentProof({
      campaignId: campaign.id,
      creatorAddress,
      milestoneIndex,
      ipfsCid: cid,
      ipfsUrl: url,
      platformUrl: contentUrl,
      contentId,
      platform,
    });

    // Update milestone proof CID in Supabase
    await updateMilestoneProof(campaign.id, milestoneIndex, cid);

    res.status(201).json({
      success: true,
      ipfsProofCid: cid,
      ipfsProofUrl: url,
      // Frontend uses these to call escrow.submitProof()
      contractParams: {
        milestoneIndex,
        ipfsProofHash: cid,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function platformToEnum(platform) {
  const map = { YOUTUBE: 0, TWITCH: 1, LINKEDIN: 2 };
  const val = map[platform?.toUpperCase()];
  if (val === undefined) throw new Error(`Invalid platform: ${platform}`);
  return val;
}

function metricTypeToEnum(metricType) {
  const map = {
    VIEWS: 0,
    CLICKS: 1,
    FOLLOWERS: 2,
    WATCH_TIME: 3,
    CONCURRENT_VIEWERS: 4,
  };
  const val = map[metricType?.toUpperCase()];
  if (val === undefined) throw new Error(`Invalid metricType: ${metricType}`);
  return val;
}

export default router;