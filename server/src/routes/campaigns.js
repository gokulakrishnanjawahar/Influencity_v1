// ─────────────────────────────────────────────
// Campaign Routes
// ─────────────────────────────────────────────
// POST /campaigns        — Brand creates a campaign (uploads brief to IPFS,
//                          returns brief CID + escrow deployment params)
// GET  /campaigns/:id    — Returns campaign metadata + milestone status
// GET  /campaigns        — Returns all campaigns for a wallet address
// POST /campaigns/:id/proof — Creator submits content proof to IPFS
// ─────────────────────────────────────────────

import express from "express";
import { ethers } from "ethers";
import {
  uploadCampaignBrief,
  uploadContentProof,
  buildGatewayUrl,
} from "../services/ipfs.js";

const router = express.Router();

// ─────────────────────────────────────────────
// POST /campaigns
// Brand creates a campaign — uploads brief to IPFS
// Returns the IPFS CID to be passed to the smart contract
// ─────────────────────────────────────────────

router.post("/", async (req, res, next) => {
  try {
    const {
      brandAddress,
      creatorAddress,
      title,
      description,
      milestones,
      walletSignature,
    } = req.body;

    // ── Validation ──
    if (!brandAddress || !ethers.isAddress(brandAddress)) {
      return res.status(400).json({ error: "Invalid brand wallet address" });
    }
    if (!creatorAddress || !ethers.isAddress(creatorAddress)) {
      return res.status(400).json({ error: "Invalid creator wallet address" });
    }
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Campaign title is required" });
    }
    if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
      return res.status(400).json({ error: "At least one milestone is required" });
    }

    // ── Validate each milestone ──
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m.platform || !m.metricType || !m.threshold || !m.trancheAmount || !m.deadline || !m.contentId) {
        return res.status(400).json({
          error: `Milestone ${i} is missing required fields`,
        });
      }
    }

    // ── Build campaign brief object ──
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

    // ── Upload brief to IPFS via Pinata ──
    const { cid, url } = await uploadCampaignBrief(brief);

    // ── Return CID and contract deployment params ──
    // Frontend uses these to call CampaignFactory.createCampaign()
    res.status(201).json({
      success: true,
      campaignId,
      ipfsBriefCid: cid,
      ipfsBriefUrl: url,
      // Contract deployment params — ready to pass directly to ethers.js
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
// POST /campaigns/:id/proof
// Creator submits content proof — uploads to IPFS
// Returns proof CID to be submitted to the smart contract
// ─────────────────────────────────────────────

router.post("/:id/proof", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const {
      creatorAddress,
      milestoneIndex,
      platform,
      contentUrl,
      contentId,
    } = req.body;

    // ── Validation ──
    if (!creatorAddress || !ethers.isAddress(creatorAddress)) {
      return res.status(400).json({ error: "Invalid creator wallet address" });
    }
    if (milestoneIndex === undefined || milestoneIndex === null) {
      return res.status(400).json({ error: "Milestone index is required" });
    }
    if (!platform) {
      return res.status(400).json({ error: "Platform is required" });
    }
    if (!contentUrl) {
      return res.status(400).json({ error: "Content URL is required" });
    }
    if (!contentId) {
      return res.status(400).json({ error: "Content ID is required" });
    }

    // ── Build proof object ──
    const proof = {
      campaignId,
      creatorAddress: creatorAddress.toLowerCase(),
      milestoneIndex,
      platform,
      contentUrl,
      contentId,
      submittedAt: new Date().toISOString(),
    };

    // ── Upload proof to IPFS via Pinata ──
    const { cid, url } = await uploadContentProof(proof);

    // ── Return CID ──
    // Frontend uses this to call CampaignEscrow.submitProof(milestoneIndex, cid)
    res.status(201).json({
      success: true,
      ipfsProofCid: cid,
      ipfsProofUrl: url,
      // Ready to pass to escrow.submitProof()
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
// GET /campaigns/:id
// Returns campaign metadata from IPFS CID
// ─────────────────────────────────────────────

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ipfsCid } = req.query;

    if (!ipfsCid) {
      return res.status(400).json({ error: "ipfsCid query param required" });
    }

    const { getFromIPFS } = await import("../services/ipfs.js");
    const brief = await getFromIPFS(ipfsCid);

    res.json({
      success: true,
      campaignId: id,
      brief,
      ipfsUrl: buildGatewayUrl(ipfsCid),
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// Helpers — Enum Converters
// ─────────────────────────────────────────────
// Convert string values from frontend to
// uint8 enum values expected by the smart contract

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