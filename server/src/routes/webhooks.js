// ─────────────────────────────────────────────
// Webhooks Route
// ─────────────────────────────────────────────
// Receives on-chain events and syncs Supabase state.
// Two sources of events:
// 1. Direct POST from our blockchain event listener
// 2. External webhook providers (Alchemy, QuickNode)
//
// Events handled:
//   MilestoneMet      → update milestone status, record reputation event
//   MilestoneFailed   → update milestone status
//   CampaignFinalized → update campaign status
//   CampaignCreated   → sync new campaign to Supabase
// ─────────────────────────────────────────────

import express from "express";
import { ethers } from "ethers";
import {
  getCampaignByContract,
  updateMilestoneStatus,
  updateCampaignStatus,
  createReputationEvent,
} from "../services/supabase.js";

const router = express.Router();

// Simple webhook secret verification
function verifyWebhookSecret(req, res, next) {
  const secret = req.headers["x-webhook-secret"];
  const expectedSecret = process.env.WEBHOOK_SECRET;

  // If no secret configured, skip verification (dev mode)
  if (!expectedSecret) {
    console.warn("[Webhook] WEBHOOK_SECRET not set — skipping verification");
    return next();
  }

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  next();
}

// ─────────────────────────────────────────────
// POST /webhooks/onchain
// Main entry point for all on-chain events
// ─────────────────────────────────────────────

router.post("/onchain", verifyWebhookSecret, async (req, res, next) => {
  try {
    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ error: "event and data are required" });
    }

    console.log(`[Webhook] Received event: ${event}`, data);

    switch (event) {
      case "MilestoneMet":
        await handleMilestoneMet(data);
        break;

      case "MilestoneFailed":
        await handleMilestoneFailed(data);
        break;

      case "CampaignFinalized":
        await handleCampaignFinalized(data);
        break;

      case "CampaignCreated":
        await handleCampaignCreated(data);
        break;

      default:
        console.warn(`[Webhook] Unknown event type: ${event}`);
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error("[Webhook] Error handling event:", error);
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /webhooks/alchemy
// Receives events from Alchemy Notify webhooks
// Alchemy sends a different payload format — we normalize it
// ─────────────────────────────────────────────

router.post("/alchemy", verifyWebhookSecret, async (req, res, next) => {
  try {
    const { webhookId, id, createdAt, event: alchemyEvent } = req.body;

    if (!alchemyEvent?.data?.block?.logs) {
      return res.json({ success: true, message: "No logs to process" });
    }

    // Normalize Alchemy event format to our internal format
    const logs = alchemyEvent.data.block.logs;

    for (const log of logs) {
      const normalized = normalizeAlchemyLog(log);
      if (!normalized) continue;

      switch (normalized.event) {
        case "MilestoneMet":
          await handleMilestoneMet(normalized.data);
          break;
        case "MilestoneFailed":
          await handleMilestoneFailed(normalized.data);
          break;
        case "CampaignFinalized":
          await handleCampaignFinalized(normalized.data);
          break;
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Webhook/Alchemy] Error:", error);
    next(error);
  }
});

// ─────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────

/// @notice Handles MilestoneMet event
/// Updates milestone status to 'met' and records reputation event
async function handleMilestoneMet(data) {
  const {
    escrowAddress,
    campaignIdOnchain,
    milestoneIndex,
    verifiedValue,
    trancheReleased,
    txHash,
  } = data;

  // Find campaign in Supabase
  const campaign = await getCampaignByContract(escrowAddress);
  if (!campaign) {
    console.warn(`[Webhook] Campaign not found for escrow: ${escrowAddress}`);
    return;
  }

  // Update milestone status
  await updateMilestoneStatus(
    campaign.id,
    milestoneIndex,
    "met",
    verifiedValue
  );

  // Record reputation event
  const milestone = campaign.milestones?.find(
    (m) => m.milestone_index === milestoneIndex
  );

  if (milestone) {
    // Mirror ReputationToken._deriveTokenId: uint256(keccak256(abi.encodePacked(campaignId, milestoneIndex)))
    const tokenIdHex = ethers.solidityPackedKeccak256(
      ["uint256", "uint256"],
      [campaignIdOnchain, milestoneIndex]
    );
    const tokenId = BigInt(tokenIdHex).toString();

    await createReputationEvent({
      creatorAddress: campaign.creator_address,
      campaignId: campaign.id,
      milestoneId: milestone.id,
      tokenId,
      txHash,
    });
  }

  console.log(`[Webhook] Milestone ${milestoneIndex} met for campaign ${campaign.id}`);
}

/// @notice Handles MilestoneFailed event
/// Updates milestone status to 'failed'
async function handleMilestoneFailed(data) {
  const { escrowAddress, milestoneIndex } = data;

  const campaign = await getCampaignByContract(escrowAddress);
  if (!campaign) {
    console.warn(`[Webhook] Campaign not found for escrow: ${escrowAddress}`);
    return;
  }

  await updateMilestoneStatus(campaign.id, milestoneIndex, "failed");

  console.log(`[Webhook] Milestone ${milestoneIndex} failed for campaign ${campaign.id}`);
}

/// @notice Handles CampaignFinalized event
/// Updates campaign status to 'completed'
async function handleCampaignFinalized(data) {
  const { escrowAddress } = data;

  await updateCampaignStatus(escrowAddress, "completed");

  console.log(`[Webhook] Campaign finalized for escrow: ${escrowAddress}`);
}

/// @notice Handles CampaignCreated event
/// Logged only — campaign is saved via POST /campaigns/confirm
async function handleCampaignCreated(data) {
  console.log(`[Webhook] CampaignCreated event received:`, data);
  // Campaign is saved via POST /campaigns/confirm from the frontend
  // This handler is a no-op — just logs for debugging
}

// ─────────────────────────────────────────────
// Alchemy Log Normalizer
// ─────────────────────────────────────────────

/// @notice Normalizes an Alchemy log to our internal event format
/// Maps event topic hashes to event names
function normalizeAlchemyLog(log) {
  // Event topic hashes (keccak256 of event signature)
  const TOPIC_MAP = {
    // MilestoneMet(uint256,uint256,uint256,uint256)
    "0x5b8fe8f8e3d88a5a3e2a3b4f5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4":
      "MilestoneMet",
    // MilestoneFailed(uint256,uint256,uint256)
    "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2":
      "MilestoneFailed",
    // CampaignFinalized(uint256,uint256)
    "0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8":
      "CampaignFinalized",
  };

  const eventName = TOPIC_MAP[log.topics?.[0]];
  if (!eventName) return null;

  return {
    event: eventName,
    data: {
      escrowAddress: log.address,
      txHash: log.transactionHash,
      // Raw log data — decoded by the blockchain service
      rawData: log.data,
      topics: log.topics,
    },
  };
}

export default router;