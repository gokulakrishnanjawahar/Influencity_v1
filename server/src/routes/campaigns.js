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
  createContentProof,
  getOrCreateUser,
  getOpenCampaigns,
  createApplication,
  getApplicationsForCampaign,
  selectApplicant,
  cancelCampaignRecord,
} from "../services/supabase.js";
import {
  getCampaignEscrow,
  getCampaignFactory,
  getCampaignState,
} from "../services/blockchain.js";
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
      title,
      description,
      milestones,
    } = req.body;

    // Verify the authenticated wallet is the brand
    if (req.walletAddress !== brandAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match brandAddress" });
    }

    // Validate inputs
    if (!title?.trim()) {
      return res.status(400).json({ error: "Campaign title is required" });
    }
    if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
      return res.status(400).json({ error: "At least one milestone is required" });
    }

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      // No content ID at publish time — the content does not exist until the
      // selected creator publishes it, and they name it in submitProof.
      if (!m.platform || !m.metricType || !m.threshold ||
          !m.trancheAmount || !m.deadline) {
        return res.status(400).json({
          error: `Milestone ${i} is missing required fields`,
        });
      }
      // Mirrors MilestoneLib.isSupportedMetric — fail here rather than in the
      // wallet with a reverted transaction.
      if (!SUPPORTED_METRICS[m.platform]?.includes(m.metricType)) {
        return res.status(400).json({
          error: `Milestone ${i}: ${m.metricType} cannot be measured on ${m.platform}`,
        });
      }
    }

    // Build and upload campaign brief to IPFS
    const campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const brief = {
      campaignId,
      brandAddress: brandAddress.toLowerCase(),
      title: title.trim(),
      description: description?.trim() || "",
      milestones: milestones.map((m, i) => ({
        index: i,
        platform: m.platform,
        metricType: m.metricType,
        threshold: m.threshold,
        trancheAmount: m.trancheAmount,
        deadline: m.deadline,
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
        ipfsBriefHash: cid,
        platforms: milestones.map((m) => platformToEnum(m.platform)),
        metricTypes: milestones.map((m) => metricTypeToEnum(m.metricType)),
        thresholds: milestones.map((m) => m.threshold),
        trancheAmounts: milestones.map((m) => m.trancheAmount),
        deadlines: milestones.map((m) => m.deadline),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /campaigns/confirm
// Called AFTER the frontend successfully deploys the contract. Adds the title
// and description, which only exist off-chain.
//
// Everything else — campaign ID, brand, deposit, milestones — is read from the
// chain, not the request body, and the escrow must be one the factory actually
// deployed. The indexer may already have created the row; this fills it in.
// ─────────────────────────────────────────────

router.post("/confirm", requireAuth, async (req, res, next) => {
  try {
    const { contractAddress, ipfsBriefUrl, title, description } = req.body;

    if (!contractAddress || !ethers.isAddress(contractAddress)) {
      return res.status(400).json({ error: "Valid contractAddress is required" });
    }

    const state = await getCampaignState(contractAddress);

    // An attacker-deployed contract can mimic the escrow's getters; only the
    // factory's own registry proves this escrow is genuine.
    const registered = await getCampaignFactory().campaignEscrows(state.campaignId);
    if (registered.toLowerCase() !== contractAddress.toLowerCase()) {
      return res.status(400).json({ error: "Not an escrow deployed by the CampaignFactory" });
    }
    if (state.brand.toLowerCase() !== req.walletAddress) {
      return res.status(403).json({ error: "Only the campaign's brand can confirm it" });
    }

    await getOrCreateUser(state.brand, "brand");

    const campaign = await createCampaign({
      campaignIdOnchain: state.campaignId,
      brandAddress: state.brand,
      contractAddress,
      ipfsBriefCid: state.ipfsBriefHash,
      ipfsBriefUrl: ipfsBriefUrl || buildGatewayUrl(state.ipfsBriefHash),
      title: title?.trim() || undefined,
      description: description?.trim() || undefined,
      totalDepositUsdc: state.totalDeposit,
    });

    await createMilestones(campaign.id, state.milestones);

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
// GET /campaigns/open
// Public marketplace — all open campaign listings awaiting a creator
// NOTE: must be declared before GET /:id so "open" isn't treated as an id
// ─────────────────────────────────────────────

router.get("/open", async (req, res, next) => {
  try {
    const campaigns = await getOpenCampaigns();
    res.json({ success: true, campaigns });
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
      channelId,
    } = req.body;

    // Verify authenticated wallet is the creator
    if (req.walletAddress !== creatorAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match creatorAddress" });
    }

    if (!platform || !contentUrl || !contentId || !channelId) {
      return res.status(400).json({
        error: "platform, contentUrl, contentId and channelId are required",
      });
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
      channelId,
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

    res.status(201).json({
      success: true,
      ipfsProofCid: cid,
      ipfsProofUrl: url,
      // Frontend uses these to call escrow.submitProof(). The milestone's
      // content fields are written by the indexer once that transaction lands —
      // until then they are only a claim.
      contractParams: {
        milestoneIndex,
        contentId,
        channelId,
        ipfsProofHash: cid,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /campaigns/:id/apply
// Creator applies to an open campaign with a pitch + social profile links
// ─────────────────────────────────────────────

router.post("/:id/apply", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { creatorAddress, pitchMessage, socialLinks } = req.body;

    if (req.walletAddress !== creatorAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match creatorAddress" });
    }

    const campaign = await resolveCampaign(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (campaign.status !== "open") {
      return res.status(400).json({ error: "Campaign is no longer accepting applications" });
    }
    if (campaign.brand_address === creatorAddress.toLowerCase()) {
      return res.status(400).json({ error: "A brand cannot apply to their own campaign" });
    }

    // Ensure the creator exists as a user record
    const creator = await getOrCreateUser(creatorAddress, "creator");

    let application;
    try {
      application = await createApplication({
        campaignId: campaign.id,
        creatorId: creator?.id,
        creatorAddress,
        pitchMessage,
        socialLinks,
      });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "You have already applied to this campaign" });
      }
      throw err;
    }

    res.status(201).json({ success: true, application });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// GET /campaigns/:id/applications
// Returns all applications for a campaign (brand reviews these)
// ─────────────────────────────────────────────

router.get("/:id/applications", optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await resolveCampaign(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const applications = await getApplicationsForCampaign(campaign.id);
    res.json({ success: true, campaignId: campaign.id, applications });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /campaigns/:id/select
// Brand selects an applicant — forms the agreement.
// Called AFTER the brand's assignCreator() transaction succeeds on-chain.
// ─────────────────────────────────────────────

router.post("/:id/select", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { brandAddress, creatorAddress } = req.body;

    if (req.walletAddress !== brandAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match brandAddress" });
    }
    if (!creatorAddress || !ethers.isAddress(creatorAddress)) {
      return res.status(400).json({ error: "Valid creatorAddress is required" });
    }

    const campaign = await resolveCampaign(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (campaign.brand_address !== brandAddress.toLowerCase()) {
      return res.status(403).json({ error: "Only the campaign brand can select a creator" });
    }

    // Record only what the chain confirms — otherwise anyone could mark a
    // campaign as bound to a creator without the brand's transaction.
    const onchainCreator = await getCampaignEscrow(campaign.contract_address).creator();
    if (onchainCreator.toLowerCase() !== creatorAddress.toLowerCase()) {
      return res.status(409).json({ error: "That creator is not assigned on-chain yet" });
    }

    // The indexer may already have recorded it
    if (campaign.creator_address === creatorAddress.toLowerCase()) {
      return res.json({ success: true, campaign });
    }
    if (campaign.status !== "open") {
      return res.status(400).json({ error: "Campaign already has a creator or is closed" });
    }

    const creator = await getOrCreateUser(creatorAddress, "creator");
    const updated = await selectApplicant(campaign.id, creatorAddress, creator?.id);

    res.json({ success: true, campaign: updated });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /campaigns/:id/cancel
// Brand withdraws an open campaign — closes it and rejects pending applications.
// Called AFTER the brand's cancelCampaign() transaction succeeds on-chain.
// ─────────────────────────────────────────────

router.post("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { brandAddress } = req.body;

    if (req.walletAddress !== brandAddress?.toLowerCase()) {
      return res.status(403).json({ error: "Authenticated wallet must match brandAddress" });
    }

    const campaign = await resolveCampaign(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (campaign.brand_address !== brandAddress.toLowerCase()) {
      return res.status(403).json({ error: "Only the campaign brand can cancel it" });
    }

    if (!(await getCampaignEscrow(campaign.contract_address).isCancelled())) {
      return res.status(409).json({ error: "Campaign is not cancelled on-chain yet" });
    }

    // The indexer may already have recorded it
    if (campaign.status === "cancelled") {
      return res.json({ success: true, campaign });
    }
    if (campaign.status !== "open") {
      return res.status(400).json({ error: "Only open campaigns can be cancelled" });
    }

    const updated = await cancelCampaignRecord(campaign.id);
    res.json({ success: true, campaign: updated });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/// @notice Resolves a campaign by on-chain ID or escrow contract address
async function resolveCampaign(idOrAddress) {
  if (ethers.isAddress(idOrAddress)) {
    return getCampaignByContract(idOrAddress);
  }
  const parsed = parseInt(idOrAddress);
  if (Number.isNaN(parsed)) return null;
  return getCampaignByOnchainId(parsed);
}

// Must match MilestoneLib.isSupportedMetric
const SUPPORTED_METRICS = {
  YOUTUBE: ["VIEWS", "FOLLOWERS"],
  TWITCH: ["VIEWS", "CONCURRENT_VIEWERS", "FOLLOWERS"],
  LINKEDIN: ["VIEWS", "CLICKS"],
};

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