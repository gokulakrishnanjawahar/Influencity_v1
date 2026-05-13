// ─────────────────────────────────────────────
// IPFS Service — Pinata
// ─────────────────────────────────────────────
// Handles all IPFS uploads and retrievals for Influencity.
// Uses Pinata as the pinning service (IPFS + optional Filecoin).
//
// Three types of content are stored:
// 1. Campaign briefs — agreed terms, milestones, deadlines
// 2. Content proofs — creator's post evidence
// 3. Reputation token metadata — ERC-1155 token metadata
// ─────────────────────────────────────────────

import { PinataSDK } from "pinata";

// ─────────────────────────────────────────────
// Initialise Pinata Client
// ─────────────────────────────────────────────

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY || "gateway.pinata.cloud",
});

// ─────────────────────────────────────────────
// Upload Campaign Brief
// ─────────────────────────────────────────────

/// @notice Uploads a campaign brief JSON to IPFS.
/// The returned CID is locked into the CampaignEscrow smart contract
/// at deployment — creating an immutable link between the contract
/// and the agreed terms.
///
/// @param {object} brief - Campaign brief data
/// @param {string} brief.campaignId       - Unique campaign ID
/// @param {string} brief.brandAddress     - Brand wallet address
/// @param {string} brief.creatorAddress   - Creator wallet address
/// @param {string} brief.title            - Campaign title
/// @param {string} brief.description      - Campaign description
/// @param {Array}  brief.milestones       - Array of milestone definitions
/// @param {string} brief.createdAt        - ISO timestamp
/// @returns {Promise<{cid: string, url: string}>}

export async function uploadCampaignBrief(brief) {
  try {
    validateBrief(brief);

    const briefWithMetadata = {
      ...brief,
      type: "campaign_brief",
      version: "1.0",
      uploadedAt: new Date().toISOString(),
    };

    const result = await pinata.upload.public.json(briefWithMetadata, {
      metadata: {
        name: `campaign-brief-${brief.campaignId}`,
        keyValues: {
          type: "campaign_brief",
          campaignId: brief.campaignId,
          brandAddress: brief.brandAddress,
          creatorAddress: brief.creatorAddress,
        },
      },
    });

    const cid = result.cid;
    const url = buildGatewayUrl(cid);

    console.log(`[IPFS] Campaign brief uploaded — CID: ${cid}`);
    return { cid, url };
  } catch (error) {
    console.error("[IPFS] Failed to upload campaign brief:", error);
    throw new Error(`IPFS upload failed: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// Upload Content Proof
// ─────────────────────────────────────────────

/// @notice Uploads a creator's content proof JSON to IPFS.
/// The CID is submitted to CampaignEscrow.submitProof() by the creator.
/// Creates an immutable, tamper-proof record of content delivery.
///
/// @param {object} proof - Content proof data
/// @param {string} proof.campaignId      - Campaign ID
/// @param {string} proof.creatorAddress  - Creator wallet address
/// @param {string} proof.milestoneIndex  - Which milestone this proves
/// @param {string} proof.platform        - YOUTUBE | TWITCH | LINKEDIN
/// @param {string} proof.contentUrl      - URL of the published content
/// @param {string} proof.contentId       - Platform-specific content ID
/// @param {string} proof.submittedAt     - ISO timestamp
/// @returns {Promise<{cid: string, url: string}>}

export async function uploadContentProof(proof) {
  try {
    validateProof(proof);

    const proofWithMetadata = {
      ...proof,
      type: "content_proof",
      version: "1.0",
      uploadedAt: new Date().toISOString(),
    };

    const result = await pinata.upload.public.json(proofWithMetadata, {
      metadata: {
        name: `content-proof-${proof.campaignId}-milestone-${proof.milestoneIndex}`,
        keyValues: {
          type: "content_proof",
          campaignId: proof.campaignId,
          creatorAddress: proof.creatorAddress,
          platform: proof.platform,
          milestoneIndex: String(proof.milestoneIndex),
        },
      },
    });

    const cid = result.cid;
    const url = buildGatewayUrl(cid);

    console.log(`[IPFS] Content proof uploaded — CID: ${cid}`);
    return { cid, url };
  } catch (error) {
    console.error("[IPFS] Failed to upload content proof:", error);
    throw new Error(`IPFS upload failed: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// Upload Reputation Token Metadata
// ─────────────────────────────────────────────

/// @notice Uploads ERC-1155 token metadata JSON to IPFS.
/// The CID is set as the tokenURI in ReputationToken.sol via
/// setTokenMetadataURI() after minting.
/// Follows the ERC-1155 metadata standard.
///
/// @param {object} metadata - Token metadata
/// @param {string} metadata.name          - Token name e.g. "50k Views Achieved"
/// @param {string} metadata.description   - Human readable description
/// @param {string} metadata.image         - IPFS CID or URL of token image
/// @param {number} metadata.campaignId    - Campaign ID
/// @param {string} metadata.platform      - YOUTUBE | TWITCH | LINKEDIN
/// @param {string} metadata.metricType    - VIEWS | CLICKS etc.
/// @param {number} metadata.threshold     - Metric threshold achieved
/// @param {string} metadata.brandAddress  - Brand wallet address
/// @param {string} metadata.creatorAddress- Creator wallet address
/// @param {string} metadata.achievedAt    - ISO timestamp
/// @returns {Promise<{cid: string, url: string}>}

export async function uploadTokenMetadata(metadata) {
  try {
    // ERC-1155 standard metadata format
    const tokenMetadata = {
      name: metadata.name,
      description: metadata.description,
      image: metadata.image || "",
      // ERC-1155 standard properties field
      properties: {
        campaignId: metadata.campaignId,
        platform: metadata.platform,
        metricType: metadata.metricType,
        threshold: metadata.threshold,
        brandAddress: metadata.brandAddress,
        creatorAddress: metadata.creatorAddress,
        achievedAt: metadata.achievedAt,
      },
    };

    const result = await pinata.upload.public.json(tokenMetadata, {
      metadata: {
        name: `reputation-token-campaign-${metadata.campaignId}`,
        keyValues: {
          type: "reputation_token_metadata",
          campaignId: String(metadata.campaignId),
          platform: metadata.platform,
          creatorAddress: metadata.creatorAddress,
        },
      },
    });

    const cid = result.cid;
    const url = buildGatewayUrl(cid);

    console.log(`[IPFS] Token metadata uploaded — CID: ${cid}`);
    return { cid, url };
  } catch (error) {
    console.error("[IPFS] Failed to upload token metadata:", error);
    throw new Error(`IPFS upload failed: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// Retrieve from IPFS
// ─────────────────────────────────────────────

/// @notice Retrieves and parses JSON content from IPFS by CID.
/// Uses the Pinata gateway for fast, reliable retrieval.
/// @param {string} cid - The IPFS CID to retrieve
/// @returns {Promise<object>} - Parsed JSON content

export async function getFromIPFS(cid) {
  try {
    if (!cid || cid.trim().length === 0) {
      throw new Error("CID is required");
    }

    const result = await pinata.gateways.public.get(cid);
    console.log(`[IPFS] Retrieved content for CID: ${cid}`);
    return result.data;
  } catch (error) {
    console.error(`[IPFS] Failed to retrieve CID ${cid}:`, error);
    throw new Error(`IPFS retrieval failed: ${error.message}`);
  }
}

/// @notice Returns the full gateway URL for a given CID
/// @param {string} cid - The IPFS CID
/// @returns {string} - Full IPFS gateway URL

export function buildGatewayUrl(cid) {
  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  return `https://${gateway}/ipfs/${cid}`;
}

// ─────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────

function validateBrief(brief) {
  const required = ["campaignId", "brandAddress", "creatorAddress", "milestones"];
  for (const field of required) {
    if (!brief[field]) {
      throw new Error(`Campaign brief missing required field: ${field}`);
    }
  }
  if (!Array.isArray(brief.milestones) || brief.milestones.length === 0) {
    throw new Error("Campaign brief must have at least one milestone");
  }
}

function validateProof(proof) {
  const required = ["campaignId", "creatorAddress", "platform", "contentUrl", "contentId"];
  for (const field of required) {
    if (!proof[field]) {
      throw new Error(`Content proof missing required field: ${field}`);
    }
  }
}