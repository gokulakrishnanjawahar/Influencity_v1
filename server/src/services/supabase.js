// ─────────────────────────────────────────────
// Supabase Service
// ─────────────────────────────────────────────
// Wraps all database operations for Influencity.
// Uses service role key — bypasses RLS for server-side operations.
// Never expose service role key to the frontend.
// ─────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
// Initialise Supabase Client
// ─────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default supabase;

// ─────────────────────────────────────────────
// User Operations
// ─────────────────────────────────────────────

/// @notice Gets or creates a user record by wallet address.
/// Called on every SIWE login — ensures user exists in DB.
/// @param {string} walletAddress - Ethereum wallet address (lowercase)
/// @param {string} role          - 'brand' or 'creator'
/// @returns {Promise<object>}    - User record

export async function getOrCreateUser(walletAddress, role = "brand") {
  const address = walletAddress.toLowerCase();

  // Try to find existing user
  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("wallet_address", address)
    .single();

  if (existing) return existing;

  // Create new user if not found
  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      wallet_address: address,
      role,
    })
    .select()
    .single();

  if (createError) throw new Error(`Failed to create user: ${createError.message}`);
  return created;
}

/// @notice Gets a user by wallet address
export async function getUserByWallet(walletAddress) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .single();

  if (error) return null;
  return data;
}

// ─────────────────────────────────────────────
// Campaign Operations
// ─────────────────────────────────────────────

/// @notice Creates a campaign record in Supabase.
/// Called after CampaignFactory.createCampaign() succeeds on-chain — by
/// POST /campaigns/confirm and by the indexer, whichever gets there first.
/// Upserts on the escrow address so the second writer fills in rather than
/// conflicts. Fields left undefined are not overwritten.
/// @param {object} campaign - Campaign data from on-chain state + IPFS
/// @returns {Promise<object>} - The campaign record

export async function createCampaign(campaign) {
  const record = {
    campaign_id_onchain: campaign.campaignIdOnchain,
    brand_address: campaign.brandAddress.toLowerCase(),
    contract_address: campaign.contractAddress.toLowerCase(),
    ipfs_brief_cid: campaign.ipfsBriefCid,
    ipfs_brief_url: campaign.ipfsBriefUrl,
    title: campaign.title,
    description: campaign.description,
    total_deposit_usdc: campaign.totalDepositUsdc,
  };
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }

  const { data, error } = await supabase
    .from("campaigns")
    .upsert(record, { onConflict: "contract_address" })
    .select()
    .single();

  if (error) throw new Error(`Failed to create campaign: ${error.message}`);
  return data;
}

/// @notice Gets a campaign by its on-chain ID
export async function getCampaignByOnchainId(campaignIdOnchain) {
  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      milestones(*),
      content_proofs(*)
    `)
    .eq("campaign_id_onchain", campaignIdOnchain)
    .single();

  if (error) return null;
  return data;
}

/// @notice Gets a campaign by its escrow contract address
export async function getCampaignByContract(contractAddress) {
  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      milestones(*),
      content_proofs(*)
    `)
    .eq("contract_address", contractAddress.toLowerCase())
    .single();

  if (error) return null;
  return data;
}

/// @notice Gets all campaigns for a wallet address (brand or creator)
export async function getCampaignsForWallet(walletAddress) {
  const address = walletAddress.toLowerCase();

  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      milestones(*)
    `)
    .or(`brand_address.eq.${address},creator_address.eq.${address}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch campaigns: ${error.message}`);
  return data || [];
}

/// @notice Updates campaign status
export async function updateCampaignStatus(contractAddress, status) {
  const { error } = await supabase
    .from("campaigns")
    .update({ status })
    .eq("contract_address", contractAddress.toLowerCase());

  if (error) throw new Error(`Failed to update campaign status: ${error.message}`);
}

// ─────────────────────────────────────────────
// Milestone Operations
// ─────────────────────────────────────────────

/// @notice Creates milestone records for a campaign from on-chain milestones
/// (see blockchain.readMilestones). Upserts, so re-running is harmless.
export async function createMilestones(campaignId, milestones) {
  const records = milestones.map((m, i) => ({
    campaign_id: campaignId,
    milestone_index: i,
    platform: m.platform,
    metric_type: m.metricType,
    threshold: m.threshold,
    tranche_usdc: m.trancheAmount,
    deadline: new Date(m.deadline * 1000).toISOString(),
    content_id: m.contentId,
    channel_id: m.channelId,
    ipfs_proof_cid: m.ipfsProofHash,
    status: m.status || "pending",
  }));

  const { data, error } = await supabase
    .from("milestones")
    .upsert(records, { onConflict: "campaign_id,milestone_index" })
    .select();

  if (error) throw new Error(`Failed to create milestones: ${error.message}`);
  return data;
}

/// @notice Updates a milestone status when oracle posts result
export async function updateMilestoneStatus(
  campaignId,
  milestoneIndex,
  status,
  verifiedValue = null
) {
  const { error } = await supabase
    .from("milestones")
    .update({
      status,
      verified_value: verifiedValue,
      resolved_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId)
    .eq("milestone_index", milestoneIndex);

  if (error) throw new Error(`Failed to update milestone: ${error.message}`);
}

/// @notice Updates milestone proof CID when creator submits proof
export async function updateMilestoneProof(campaignId, milestoneIndex, ipfsCid) {
  const { error } = await supabase
    .from("milestones")
    .update({ ipfs_proof_cid: ipfsCid })
    .eq("campaign_id", campaignId)
    .eq("milestone_index", milestoneIndex);

  if (error) throw new Error(`Failed to update milestone proof: ${error.message}`);
}

// ─────────────────────────────────────────────
// Content Proof Operations
// ─────────────────────────────────────────────

/// @notice Creates a content proof record
export async function createContentProof(proof) {
  const { data, error } = await supabase
    .from("content_proofs")
    .insert({
      campaign_id: proof.campaignId,
      creator_address: proof.creatorAddress.toLowerCase(),
      milestone_index: proof.milestoneIndex,
      ipfs_cid: proof.ipfsCid,
      ipfs_url: proof.ipfsUrl,
      platform_url: proof.platformUrl,
      content_id: proof.contentId,
      platform: proof.platform,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create content proof: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────
// Reputation Event Operations
// ─────────────────────────────────────────────

/// @notice Records a reputation token mint event. Keyed on (tx_hash, log_index)
/// so the indexer seeing the same log twice records it once.
export async function createReputationEvent(event) {
  const { error } = await supabase
    .from("reputation_events")
    .upsert(
      {
        creator_address: event.creatorAddress.toLowerCase(),
        campaign_id: event.campaignId,
        milestone_id: event.milestoneId,
        token_id: event.tokenId,
        minted_at: event.mintedAt,
        tx_hash: event.txHash,
        log_index: event.logIndex,
        brand_address: event.brandAddress?.toLowerCase(),
        value_usdc: event.valueUsdc,
      },
      { onConflict: "tx_hash,log_index", ignoreDuplicates: true }
    );

  if (error) throw new Error(`Failed to create reputation event: ${error.message}`);
}

/// @notice Gets all reputation events for a creator wallet
export async function getReputationEvents(creatorAddress) {
  const { data, error } = await supabase
    .from("reputation_events")
    .select(`
      *,
      campaigns(title, brand_address)
    `)
    .eq("creator_address", creatorAddress.toLowerCase())
    .order("minted_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch reputation events: ${error.message}`);
  return data || [];
}

// ─────────────────────────────────────────────
// Marketplace / Open Campaign Operations
// ─────────────────────────────────────────────

/// @notice Gets all open campaign listings (status = 'open') with milestones
export async function getOpenCampaigns() {
  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      milestones(*)
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch open campaigns: ${error.message}`);
  return data || [];
}

// ─────────────────────────────────────────────
// Campaign Application Operations
// ─────────────────────────────────────────────

/// @notice Creates a creator's application to a campaign.
/// Throws the raw Supabase error so callers can detect a unique violation (23505).
export async function createApplication(application) {
  const { data, error } = await supabase
    .from("campaign_applications")
    .insert({
      campaign_id: application.campaignId,
      creator_id: application.creatorId || null,
      creator_address: application.creatorAddress.toLowerCase(),
      pitch_message: application.pitchMessage || null,
      social_links: application.socialLinks || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/// @notice Gets all applications for a campaign
export async function getApplicationsForCampaign(campaignId) {
  const { data, error } = await supabase
    .from("campaign_applications")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch applications: ${error.message}`);
  return data || [];
}

/// @notice Gets all applications submitted by a creator, with their campaigns
export async function getApplicationsForCreator(creatorAddress) {
  const { data, error } = await supabase
    .from("campaign_applications")
    .select(`
      *,
      campaigns(*, milestones(*))
    `)
    .eq("creator_address", creatorAddress.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch creator applications: ${error.message}`);
  return data || [];
}

/// @notice Returns a single application for a creator on a campaign, or null
export async function getApplication(campaignId, creatorAddress) {
  const { data, error } = await supabase
    .from("campaign_applications")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("creator_address", creatorAddress.toLowerCase())
    .single();

  if (error) return null;
  return data;
}

/// @notice Selects an applicant — forms the agreement.
/// Marks the chosen application 'selected', all other pending ones 'rejected',
/// and updates the campaign with the creator and an 'active' status.
export async function selectApplicant(campaignId, creatorAddress, creatorId) {
  const address = creatorAddress.toLowerCase();

  const { error: selErr } = await supabase
    .from("campaign_applications")
    .update({ status: "selected" })
    .eq("campaign_id", campaignId)
    .eq("creator_address", address);
  if (selErr) throw new Error(`Failed to select applicant: ${selErr.message}`);

  const { error: rejErr } = await supabase
    .from("campaign_applications")
    .update({ status: "rejected" })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .neq("creator_address", address);
  if (rejErr) throw new Error(`Failed to reject other applicants: ${rejErr.message}`);

  const { data, error: campErr } = await supabase
    .from("campaigns")
    .update({
      creator_address: address,
      creator_id: creatorId || null,
      status: "active",
    })
    .eq("id", campaignId)
    .select()
    .single();
  if (campErr) throw new Error(`Failed to activate campaign: ${campErr.message}`);

  return data;
}

/// @notice Cancels an open campaign — marks it cancelled and rejects pending applications
export async function cancelCampaignRecord(campaignId) {
  const { error: appErr } = await supabase
    .from("campaign_applications")
    .update({ status: "rejected" })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  if (appErr) throw new Error(`Failed to close applications: ${appErr.message}`);

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "cancelled" })
    .eq("id", campaignId)
    .select()
    .single();
  if (error) throw new Error(`Failed to cancel campaign: ${error.message}`);
  return data;
}
// ─────────────────────────────────────────────
// Indexer Writes
// ─────────────────────────────────────────────
// Applied from on-chain events. Each one sets state to what the chain says,
// so applying the same event twice leaves the same result.

/// @notice Updates campaign columns by escrow address
export async function updateCampaignByContract(contractAddress, fields) {
  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("contract_address", contractAddress.toLowerCase());

  if (error) throw new Error(`Failed to update campaign: ${error.message}`);
}

/// @notice Updates milestone columns by campaign + index
export async function updateMilestone(campaignId, milestoneIndex, fields) {
  const { error } = await supabase
    .from("milestones")
    .update(fields)
    .eq("campaign_id", campaignId)
    .eq("milestone_index", milestoneIndex);

  if (error) throw new Error(`Failed to update milestone: ${error.message}`);
}

/// @notice Escrow addresses of every campaign the database knows about
export async function getAllEscrowAddresses() {
  const { data, error } = await supabase
    .from("campaigns")
    .select("contract_address")
    .not("contract_address", "is", null);

  if (error) throw new Error(`Failed to list escrows: ${error.message}`);
  return data.map((row) => row.contract_address);
}

/// @notice The indexer cursor: last block applied, or null if never synced
export async function getSyncState(id) {
  const { data, error } = await supabase
    .from("sync_state")
    .select("last_block, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to read sync state: ${error.message}`);
  return data;
}

/// @notice Moves the cursor forward. Never moves it backwards, so an older,
/// slower sync finishing late cannot rewind a newer one.
export async function advanceSyncState(id, lastBlock) {
  const current = await getSyncState(id);
  if (current && Number(current.last_block) >= lastBlock) return;

  const { error } = await supabase
    .from("sync_state")
    .upsert({ id, last_block: lastBlock, updated_at: new Date().toISOString() });

  if (error) throw new Error(`Failed to write sync state: ${error.message}`);
}

// ─────────────────────────────────────────────
// SIWE Nonces
// ─────────────────────────────────────────────

/// @notice Stores a freshly issued sign-in nonce
export async function createNonce(nonce, expiresAt) {
  const { error } = await supabase
    .from("auth_nonces")
    .insert({ nonce, expires_at: expiresAt.toISOString() });

  if (error) throw new Error(`Failed to store nonce: ${error.message}`);
}

/// @notice Atomically marks a nonce used. Returns false if it was never issued,
/// has expired, or was already used — the conditional update matches no row.
export async function consumeNonce(nonce) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("auth_nonces")
    .update({ used_at: now })
    .eq("nonce", nonce)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("nonce");

  if (error) throw new Error(`Failed to consume nonce: ${error.message}`);
  return data.length === 1;
}
