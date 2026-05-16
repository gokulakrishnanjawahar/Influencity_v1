// ─────────────────────────────────────────────
// Seed Script — Local Test Data
// ─────────────────────────────────────────────
// Populates Supabase with realistic test data for local development.
// Run with: node scripts/seedTestData.js
//
// Creates:
//   - 2 test users (1 brand, 1 creator)
//   - 2 test campaigns with milestones
//   - Sample content proofs
//   - Sample reputation events
// ─────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────

const TEST_BRAND = {
  wallet_address: "0x1111111111111111111111111111111111111111",
  role: "brand",
  display_name: "Acme Corp",
};

const TEST_CREATOR = {
  wallet_address: "0x2222222222222222222222222222222222222222",
  role: "creator",
  display_name: "Tech Influencer",
};

// ─────────────────────────────────────────────
// Main Seed Function
// ─────────────────────────────────────────────

async function seed() {
  console.log("🌱 Starting seed...\n");

  try {
    // ── 1. Create Users ──
    console.log("Creating users...");

    const { data: brand, error: brandError } = await supabase
      .from("users")
      .upsert(TEST_BRAND, { onConflict: "wallet_address" })
      .select()
      .single();

    if (brandError) throw brandError;
    console.log(`  ✅ Brand: ${brand.display_name} (${brand.wallet_address})`);

    const { data: creator, error: creatorError } = await supabase
      .from("users")
      .upsert(TEST_CREATOR, { onConflict: "wallet_address" })
      .select()
      .single();

    if (creatorError) throw creatorError;
    console.log(`  ✅ Creator: ${creator.display_name} (${creator.wallet_address})`);

    // ── 2. Create Campaign 1 — Active YouTube Campaign ──
    console.log("\nCreating Campaign 1 — Active YouTube Campaign...");

    const { data: campaign1, error: c1Error } = await supabase
      .from("campaigns")
      .upsert({
        campaign_id_onchain: 1,
        brand_id: brand.id,
        creator_id: creator.id,
        brand_address: brand.wallet_address,
        creator_address: creator.wallet_address,
        contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ipfs_brief_cid: "bafybeibriefhash1111111111111111111111111111111111111",
        ipfs_brief_url: "https://gateway.pinata.cloud/ipfs/bafybeibriefhash111",
        title: "YouTube Tech Review Campaign",
        description: "Create a review video for our new SaaS product",
        status: "active",
        total_deposit_usdc: 500,
        total_released_usdc: 100,
      }, { onConflict: "campaign_id_onchain" })
      .select()
      .single();

    if (c1Error) throw c1Error;
    console.log(`  ✅ Campaign 1: ${campaign1.title}`);

    // ── 3. Create Milestones for Campaign 1 ──
    console.log("  Creating milestones for Campaign 1...");

    const milestones1 = [
      {
        campaign_id: campaign1.id,
        milestone_index: 0,
        platform: "YOUTUBE",
        metric_type: "VIEWS",
        threshold: 10000,
        tranche_usdc: 100,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        content_id: "dQw4w9WgXcQ",
        status: "met",
        verified_value: 15234,
        resolved_at: new Date().toISOString(),
      },
      {
        campaign_id: campaign1.id,
        milestone_index: 1,
        platform: "YOUTUBE",
        metric_type: "VIEWS",
        threshold: 50000,
        tranche_usdc: 200,
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        content_id: "dQw4w9WgXcQ",
        status: "pending",
      },
      {
        campaign_id: campaign1.id,
        milestone_index: 2,
        platform: "YOUTUBE",
        metric_type: "VIEWS",
        threshold: 100000,
        tranche_usdc: 200,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        content_id: "dQw4w9WgXcQ",
        status: "pending",
      },
    ];

    const { data: m1Data, error: m1Error } = await supabase
      .from("milestones")
      .upsert(milestones1, { onConflict: "campaign_id,milestone_index" })
      .select();

    if (m1Error) throw m1Error;
    console.log(`  ✅ Created ${m1Data.length} milestones`);

    // ── 4. Create Campaign 2 — Completed LinkedIn Campaign ──
    console.log("\nCreating Campaign 2 — Completed LinkedIn Campaign...");

    const { data: campaign2, error: c2Error } = await supabase
      .from("campaigns")
      .upsert({
        campaign_id_onchain: 2,
        brand_id: brand.id,
        creator_id: creator.id,
        brand_address: brand.wallet_address,
        creator_address: creator.wallet_address,
        contract_address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ipfs_brief_cid: "bafybeibriefhash2222222222222222222222222222222222222",
        ipfs_brief_url: "https://gateway.pinata.cloud/ipfs/bafybeibriefhash222",
        title: "LinkedIn B2B Thought Leadership",
        description: "Post series about enterprise software trends",
        status: "completed",
        total_deposit_usdc: 300,
        total_released_usdc: 300,
      }, { onConflict: "campaign_id_onchain" })
      .select()
      .single();

    if (c2Error) throw c2Error;
    console.log(`  ✅ Campaign 2: ${campaign2.title}`);

    // ── 5. Create Milestones for Campaign 2 ──
    console.log("  Creating milestones for Campaign 2...");

const milestones2 = [
      {
        campaign_id: campaign2.id,
        milestone_index: 0,
        platform: "LINKEDIN",
        metric_type: "VIEWS",
        threshold: 5000,
        tranche_usdc: 150,
        deadline: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        content_id: "urn:li:share:7123456789012345678",
        ipfs_proof_cid: "bafybeicproofhash1111111111111111111111111111111111111",
        status: "met",
        verified_value: 7823,
        resolved_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        campaign_id: campaign2.id,
        milestone_index: 1,
        platform: "LINKEDIN",
        metric_type: "CLICKS",
        threshold: 500,
        tranche_usdc: 150,
        deadline: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        content_id: "urn:li:share:7123456789012345678",
        ipfs_proof_cid: "bafybeicproofhash2222222222222222222222222222222222222",
        status: "met",
        verified_value: 634,
        resolved_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const { data: m2Data, error: m2Error } = await supabase
      .from("milestones")
      .upsert(milestones2, { onConflict: "campaign_id,milestone_index" })
      .select();

    if (m2Error) throw m2Error;
    console.log(`  ✅ Created ${m2Data.length} milestones`);

    // ── 6. Create Content Proofs ──
    console.log("\nCreating content proofs...");

    const proofs = [
      {
        campaign_id: campaign1.id,
        creator_address: creator.wallet_address,
        milestone_index: 0,
        ipfs_cid: "bafybeicproofhash3333333333333333333333333333333333333",
        ipfs_url: "https://gateway.pinata.cloud/ipfs/bafybeicproofhash333",
        platform_url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
        content_id: "dQw4w9WgXcQ",
        platform: "YOUTUBE",
      },
      {
        campaign_id: campaign2.id,
        creator_address: creator.wallet_address,
        milestone_index: 0,
        ipfs_cid: "bafybeicproofhash4444444444444444444444444444444444444",
        ipfs_url: "https://gateway.pinata.cloud/ipfs/bafybeicproofhash444",
        platform_url: "https://linkedin.com/posts/test_7123456789012345678",
        content_id: "urn:li:share:7123456789012345678",
        platform: "LINKEDIN",
      },
    ];

    const { data: proofData, error: proofError } = await supabase
      .from("content_proofs")
      .upsert(proofs)
      .select();

    if (proofError) throw proofError;
    console.log(`  ✅ Created ${proofData.length} content proofs`);

    // ── 7. Create Reputation Events ──
    console.log("\nCreating reputation events...");

    const reputationEvents = [
      {
        creator_address: creator.wallet_address,
        campaign_id: campaign1.id,
        milestone_id: m1Data[0].id,
        token_id: "1_0",
        minted_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        tx_hash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
      {
        creator_address: creator.wallet_address,
        campaign_id: campaign2.id,
        milestone_id: m2Data[0].id,
        token_id: "2_0",
        minted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        tx_hash: "0xcafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe",
      },
      {
        creator_address: creator.wallet_address,
        campaign_id: campaign2.id,
        milestone_id: m2Data[1].id,
        token_id: "2_1",
        minted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        tx_hash: "0xfeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeef",
      },
    ];

    const { data: repData, error: repError } = await supabase
      .from("reputation_events")
      .upsert(reputationEvents)
      .select();

    if (repError) throw repError;
    console.log(`  ✅ Created ${repData.length} reputation events`);

    // ── Summary ──
    console.log("\n✅ Seed complete!\n");
    console.log("Test accounts:");
    console.log(`  Brand:   ${TEST_BRAND.wallet_address}`);
    console.log(`  Creator: ${TEST_CREATOR.wallet_address}`);
    console.log("\nTest campaigns:");
    console.log(`  Campaign 1 (active):    ID=${campaign1.campaign_id_onchain}`);
    console.log(`  Campaign 2 (completed): ID=${campaign2.campaign_id_onchain}`);
    console.log("\nYou can now start the server and test the API.");

  } catch (error) {
    console.error("\n❌ Seed failed:", error.message);
    process.exit(1);
  }
}

seed();