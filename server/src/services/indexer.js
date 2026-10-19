// ─────────────────────────────────────────────
// Chain Indexer
// ─────────────────────────────────────────────
// Keeps Supabase in step with the contracts by reading their event logs
// straight from the RPC — the database never takes a client's or a webhook's
// word for what happened on-chain.
//
// Each run picks up from the last block it applied (sync_state), walks forward
// in chunks to a few blocks behind the head, applies every event in order, and
// advances the cursor after each chunk. Handlers write the state the chain
// reports, so re-applying an event is harmless — overlapping runs and retries
// cannot corrupt the data.
//
// Serverless-friendly: nothing stays running between requests. A run is
// triggered by POST /sync (the client calls it after each transaction) and by
// a daily Vercel cron as a backstop, and stops early when its time budget is
// spent; the next run continues from the cursor.
// ─────────────────────────────────────────────

import { ethers } from "ethers";
import {
  getProvider,
  getCampaignEscrow,
  loadABI,
  readMilestones,
} from "./blockchain.js";
import {
  createCampaign,
  createMilestones,
  getCampaignByContract,
  updateCampaignByContract,
  updateMilestone,
  getAllEscrowAddresses,
  getSyncState,
  advanceSyncState,
  getOrCreateUser,
  selectApplicant,
  cancelCampaignRecord,
  createReputationEvent,
} from "./supabase.js";
import { buildGatewayUrl } from "./ipfs.js";

const SYNC_ID = "chain";

// Logs this many blocks behind the head are treated as final. Amoy blocks are
// ~2s, so this is a few seconds of delay in exchange for not applying a log
// that a short reorg then removes.
const CONFIRMATIONS = 5;

// Public RPCs cap the block range of eth_getLogs; 2,000 is accepted widely.
const BLOCK_CHUNK = Number(process.env.INDEXER_BLOCK_CHUNK || 2000);

// Many RPCs also cap how many addresses one getLogs filter may name.
const ADDRESS_BATCH = 100;

// Leave headroom under the serverless function timeout.
const TIME_BUDGET_MS = Number(process.env.INDEXER_TIME_BUDGET_MS || 20_000);

const factoryIface = new ethers.Interface(loadABI("CampaignFactory"));
const escrowIface = new ethers.Interface(loadABI("CampaignEscrow"));
const reputationIface = new ethers.Interface(loadABI("ReputationToken"));

// ─────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────

/// @returns {Promise<{fromBlock:number, toBlock:number, head:number, caughtUp:boolean, events:number}>}
export async function syncChain() {
  const provider = getProvider();
  const factoryAddress = process.env.CAMPAIGN_FACTORY_ADDRESS?.toLowerCase();
  const reputationAddress = process.env.REPUTATION_TOKEN_ADDRESS?.toLowerCase();
  if (!factoryAddress || !reputationAddress) {
    throw new Error("CAMPAIGN_FACTORY_ADDRESS and REPUTATION_TOKEN_ADDRESS must be set");
  }

  const state = await getSyncState(SYNC_ID);
  let from;
  if (state) {
    from = Number(state.last_block) + 1;
  } else {
    const start = process.env.INDEXER_START_BLOCK;
    if (!start) {
      throw new Error(
        "INDEXER_START_BLOCK must be set to the block the CampaignFactory was deployed in"
      );
    }
    from = Number(start);
  }

  const head = (await provider.getBlockNumber()) - CONFIRMATIONS;
  const firstBlock = from;
  const escrows = new Set((await getAllEscrowAddresses()).map((a) => a.toLowerCase()));
  const blockTimes = new Map();
  const startedAt = Date.now();
  let events = 0;

  while (from <= head && Date.now() - startedAt < TIME_BUDGET_MS) {
    const to = Math.min(from + BLOCK_CHUNK - 1, head);

    // Factory logs first: a campaign created in this chunk can have events of
    // its own in the same chunk, and its escrow address is only known once
    // CampaignCreated has been seen.
    const factoryLogs = await provider.getLogs({
      address: factoryAddress,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of factoryLogs) {
      const parsed = tryParse(factoryIface, log);
      if (parsed?.name === "CampaignCreated") {
        escrows.add(parsed.args.escrowAddress.toLowerCase());
      }
    }

    const addresses = [...escrows, reputationAddress];
    const otherLogs = [];
    for (let i = 0; i < addresses.length; i += ADDRESS_BATCH) {
      otherLogs.push(
        ...(await provider.getLogs({
          address: addresses.slice(i, i + ADDRESS_BATCH),
          fromBlock: from,
          toBlock: to,
        }))
      );
    }

    const logs = [...factoryLogs, ...otherLogs].sort(
      (a, b) => a.blockNumber - b.blockNumber || a.index - b.index
    );

    for (const log of logs) {
      if (await applyLog(log, { factoryAddress, reputationAddress, escrows, blockTimes })) {
        events++;
      }
    }

    await advanceSyncState(SYNC_ID, to);
    from = to + 1;
  }

  return {
    fromBlock: firstBlock,
    toBlock: from - 1,
    head,
    caughtUp: from > head,
    events,
  };
}

// ─────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────

function tryParse(iface, log) {
  try {
    return iface.parseLog({ topics: log.topics, data: log.data });
  } catch (_error) {
    return null;
  }
}

async function blockTime(blockNumber, blockTimes) {
  if (!blockTimes.has(blockNumber)) {
    const block = await getProvider().getBlock(blockNumber);
    blockTimes.set(blockNumber, new Date(block.timestamp * 1000).toISOString());
  }
  return blockTimes.get(blockNumber);
}

/// @returns {Promise<boolean>} whether the log was a recognised event
async function applyLog(log, ctx) {
  const address = log.address.toLowerCase();

  if (address === ctx.factoryAddress) {
    const event = tryParse(factoryIface, log);
    if (event?.name === "CampaignCreated") {
      await onCampaignCreated(event.args);
      return true;
    }
    // The factory's CreatorAssigned duplicates the escrow's, which is handled
    // below where the escrow address identifies the campaign directly.
    return false;
  }

  if (address === ctx.reputationAddress) {
    const event = tryParse(reputationIface, log);
    if (event?.name === "ReputationMinted") {
      await onReputationMinted(event.args, log);
      return true;
    }
    return false;
  }

  if (!ctx.escrows.has(address)) return false;

  const event = tryParse(escrowIface, log);
  if (!event) return false;

  const campaign = await getCampaignByContract(address);
  if (!campaign) {
    console.warn(`[Indexer] ${event.name} for unknown escrow ${address}`);
    return false;
  }

  const index = event.args.milestoneIndex !== undefined
    ? Number(event.args.milestoneIndex)
    : null;

  switch (event.name) {
    case "CampaignFunded":
      await updateCampaignByContract(address, {
        total_deposit_usdc: event.args.amount.toString(),
      });
      return true;

    case "CreatorAssigned": {
      const creator = event.args.creator.toLowerCase();
      const user = await getOrCreateUser(creator, "creator");
      await selectApplicant(campaign.id, creator, user?.id);
      return true;
    }

    case "ProofSubmitted":
      await updateMilestone(campaign.id, index, {
        content_id: event.args.contentId,
        channel_id: event.args.channelId,
        ipfs_proof_cid: event.args.ipfsProofHash,
      });
      return true;

    case "MetricVerified":
      await updateMilestone(campaign.id, index, {
        verified_value: event.args.reportedValue.toString(),
      });
      return true;

    case "MilestoneMet": {
      await updateMilestone(campaign.id, index, {
        status: "met",
        verified_value: event.args.verifiedValue.toString(),
        resolved_at: await blockTime(log.blockNumber, ctx.blockTimes),
      });
      // Read the running total from the contract rather than adding to the
      // stored value, so re-applying this event cannot double-count it.
      const totalReleased = await getCampaignEscrow(address).totalReleased();
      await updateCampaignByContract(address, {
        total_released_usdc: totalReleased.toString(),
      });
      return true;
    }

    case "MilestoneFailed":
      await updateMilestone(campaign.id, index, {
        status: "failed",
        resolved_at: await blockTime(log.blockNumber, ctx.blockTimes),
      });
      return true;

    case "CampaignFinalized":
      await updateCampaignByContract(address, { status: "completed" });
      return true;

    case "CampaignCancelled":
      await cancelCampaignRecord(campaign.id);
      return true;

    default:
      // MilestoneAdded, Withdrawn and OwnershipTransferred need no table update
      return false;
  }
}

/// A campaign can exist on-chain without the client ever calling
/// POST /campaigns/confirm (closed tab, failed request). Create its row from
/// chain state so it still shows up; /confirm later fills in title and
/// description on the same row.
async function onCampaignCreated(args) {
  const escrowAddress = args.escrowAddress.toLowerCase();
  const campaign = await createCampaign({
    campaignIdOnchain: Number(args.campaignId),
    brandAddress: args.brand,
    contractAddress: escrowAddress,
    ipfsBriefCid: args.ipfsBriefHash,
    ipfsBriefUrl: buildGatewayUrl(args.ipfsBriefHash),
  });
  await getOrCreateUser(args.brand, "brand");
  await createMilestones(campaign.id, await readMilestones(escrowAddress));
}

async function onReputationMinted(args, log) {
  const campaign = await getCampaignByContract(args.escrow);
  if (!campaign) {
    console.warn(`[Indexer] ReputationMinted for unknown escrow ${args.escrow}`);
    return;
  }
  const milestone = campaign.milestones?.find(
    (m) => m.milestone_index === Number(args.milestoneIndex)
  );

  await createReputationEvent({
    creatorAddress: args.creator,
    campaignId: campaign.id,
    milestoneId: milestone?.id ?? null,
    tokenId: args.tokenId.toString(),
    mintedAt: new Date(Number(args.mintedAt) * 1000).toISOString(),
    txHash: log.transactionHash,
    logIndex: log.index,
    brandAddress: args.brand,
    valueUsdc: args.value.toString(),
  });
}
