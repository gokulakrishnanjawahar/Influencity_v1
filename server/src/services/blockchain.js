// ─────────────────────────────────────────────
// Blockchain Service
// ─────────────────────────────────────────────
// Read-only access to the deployed contracts.
//
// The server holds no private key and sends no transactions. Every state
// change — creating, funding, selecting, submitting proof, withdrawing — is
// signed by the user's own wallet in the browser, and the contracts check
// msg.sender themselves. A key here could do nothing those checks allow, but
// would be a standing liability on a serverless host.
// ─────────────────────────────────────────────

import { ethers } from "ethers";
import { ABIS } from "../abis/index.js";

// ─────────────────────────────────────────────
// Contract ABIs
// ─────────────────────────────────────────────
// Imported from a committed, generated module rather than read out of
// artifacts/ at runtime. artifacts/ is gitignored and sits outside server/, so
// a runtime read works on a dev machine and fails on every host; a static
// import is also the only form a bundler can trace.
//
// Regenerate after changing a contract's external interface:
//   npm run build:abis      (from the project root)

export function loadABI(contractName) {
  const abi = ABIS[contractName];
  if (!abi) {
    throw new Error(
      `ABI not found for ${contractName}. ` +
        "Run `npm run build:abis` from the project root to regenerate " +
        "server/src/abis/index.js."
    );
  }
  return abi;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

let provider;

/// @notice Read-only provider for querying contract state.
/// RPC_URL must point at the same chain the contract addresses below were
/// deployed to (Polygon Amoy in the default setup).
///
/// There is deliberately NO default here. A hardcoded fallback would let a
/// missing or renamed env var silently redirect every read to the wrong
/// chain, where our addresses hold no code — and reads against a codeless
/// address return empty data rather than erroring, so the failure would
/// surface as "no campaigns found" rather than as a misconfiguration.
export function getProvider() {
  if (provider) return provider;
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error(
      "RPC_URL not set. " +
        "Set it to your Polygon Amoy or Polygon mainnet RPC endpoint."
    );
  }
  provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  return provider;
}

function requireAddress(name) {
  const address = process.env[name];
  if (!address || !ethers.isAddress(address)) {
    throw new Error(`${name} not set to a valid address`);
  }
  return address;
}

export function getCampaignFactory() {
  return new ethers.Contract(
    requireAddress("CAMPAIGN_FACTORY_ADDRESS"),
    loadABI("CampaignFactory"),
    getProvider()
  );
}

export function getCampaignEscrow(escrowAddress) {
  if (!escrowAddress || !ethers.isAddress(escrowAddress)) {
    throw new Error(`Invalid escrow address: ${escrowAddress}`);
  }
  return new ethers.Contract(escrowAddress, loadABI("CampaignEscrow"), getProvider());
}

export function getReputationToken() {
  return new ethers.Contract(
    requireAddress("REPUTATION_TOKEN_ADDRESS"),
    loadABI("ReputationToken"),
    getProvider()
  );
}

// ─────────────────────────────────────────────
// Campaign State
// ─────────────────────────────────────────────

const PLATFORMS = ["YOUTUBE", "TWITCH", "LINKEDIN"];
const METRIC_TYPES = ["VIEWS", "CLICKS", "FOLLOWERS", "WATCH_TIME", "CONCURRENT_VIEWERS"];
const MILESTONE_STATUSES = ["pending", "met", "failed"];

/// @notice Reads every milestone of an escrow, in the shape the database uses
export async function readMilestones(escrowAddress) {
  const raw = await getCampaignEscrow(escrowAddress).getMilestones();
  return raw.map((m, i) => ({
    index: i,
    platform: PLATFORMS[Number(m.platform)],
    metricType: METRIC_TYPES[Number(m.metricType)],
    threshold: m.threshold.toString(),
    trancheAmount: m.trancheAmount.toString(),
    deadline: Number(m.deadline),
    contentId: m.contentId || null,
    channelId: m.channelId || null,
    ipfsProofHash: m.ipfsProofHash || null,
    status: MILESTONE_STATUSES[Number(m.status)],
  }));
}

export async function getCampaignState(escrowAddress) {
  const escrow = getCampaignEscrow(escrowAddress);

  const [
    campaignId,
    brand,
    creator,
    ipfsBriefHash,
    totalDeposit,
    totalReleased,
    isFinalized,
    isCancelled,
    balance,
    milestones,
  ] = await Promise.all([
    escrow.campaignId(),
    escrow.brand(),
    escrow.creator(),
    escrow.ipfsBriefHash(),
    escrow.totalDeposit(),
    escrow.totalReleased(),
    escrow.isFinalized(),
    escrow.isCancelled(),
    escrow.getBalance(),
    readMilestones(escrowAddress),
  ]);

  return {
    campaignId: Number(campaignId),
    escrowAddress,
    brand,
    creator: creator === ethers.ZeroAddress ? null : creator,
    ipfsBriefHash,
    totalDeposit: totalDeposit.toString(),
    totalReleased: totalReleased.toString(),
    isFinalized,
    isCancelled,
    balance: balance.toString(),
    milestones,
  };
}

// ─────────────────────────────────────────────
// Reputation
// ─────────────────────────────────────────────

export async function getCreatorReputation(walletAddress) {
  const token = getReputationToken();

  const [[milestones, earned, uniqueBrands], history] = await Promise.all([
    token.getReputation(walletAddress),
    token.getMintHistory(walletAddress),
  ]);

  return {
    walletAddress,
    reputationScore: Number(milestones),
    totalEarned: earned.toString(),
    uniqueBrandCount: Number(uniqueBrands),
    mintHistory: history.map((record) => ({
      campaignId: Number(record.campaignId),
      milestoneIndex: Number(record.milestoneIndex),
      tokenId: record.tokenId.toString(),
      mintedAt: Number(record.mintedAt),
      escrow: record.escrow,
      brand: record.brand,
      value: record.value.toString(),
    })),
  };
}
