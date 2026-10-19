import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// End-to-End Oracle Flow Test
// ─────────────────────────────────────────────
// Simulates the complete Influencity protocol flow:
// 1. Brand creates an open campaign listing via the Factory
// 2. Brand deposits USDC into the escrow
// 3. Brand selects a creator — the agreement is formed on-chain
// 4. Creator submits content proof
// 5. Oracle (simulated) verifies the metric
// 6. Tranche released to creator + reputation token minted
// 7. Failed milestone refunds the brand
// ─────────────────────────────────────────────

describe("End-to-End Oracle Flow", async () => {
  let ethers;
  let usdc;
  let reputationToken;
  let mockOracle;
  let factory;
  let owner;
  let brand;
  let creator;

  const PLATFORM_YOUTUBE = 0;
  const METRIC_VIEWS = 0;
  const THRESHOLD_50K = 50_000;
  const THRESHOLD_100K = 100_000;
  const IPFS_BRIEF = "bafybeibriefhashXYZ";
  const IPFS_PROOF = "bafybeicproofhashXYZ";
  const VIDEO_ID = "dQw4w9WgXcQ";
  const CHANNEL_ID = "UCuAXFkgsw1L7xaCfnd5JJOw";
  const GRACE_PERIOD = 2 * 24 * 60 * 60; // MilestoneLib.GRACE_PERIOD

  const USDC = (amount) => BigInt(amount) * 1_000_000n;

  // Chain-relative so repeated advanceTime() calls across the suite can't push
  // wall-clock deadlines into the past.
  async function futureDeadline(secondsFromNow = 86400) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + secondsFromNow;
  }

  async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, brand, creator] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    // Deploy ReputationToken
    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy("https://w3s.link/ipfs/");

    // Deploy MockMetricsOracle
    const MockOracle = await ethers.getContractFactory("MockMetricsOracle");
    mockOracle = await MockOracle.deploy();

    // Deploy CampaignFactory
    const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
    factory = await CampaignFactory.deploy(
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await mockOracle.getAddress()
    );

    // Lets the factory authorise each escrow it deploys as a reputation minter.
    // Mirrors step 5 of scripts/deploy.js.
    await reputationToken.setCampaignFactory(await factory.getAddress());

    // Fund brand with USDC
    await usdc.connect(brand).faucet(USDC(1000));
  }

  // Runs the full setup: create listing → fund → bind creator → creator names
  // the content for every milestone. Returns the escrow contract instance.
  async function openFundedCampaign({ thresholds, tranches, deadlines }) {
    const count = thresholds.length;
    const tx = await factory.connect(brand).createCampaign(
      IPFS_BRIEF,
      Array(count).fill(PLATFORM_YOUTUBE),
      Array(count).fill(METRIC_VIEWS),
      thresholds,
      tranches,
      deadlines
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment?.name === "CampaignCreated"
    );
    const escrowAddress = event.args.escrowAddress;
    const campaignId = event.args.campaignId;
    const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

    // Brand funds the escrow
    const total = tranches.reduce((a, b) => a + b, 0n);
    await usdc.connect(brand).approve(escrowAddress, total);
    await escrow.connect(brand).deposit(total);

    // Brand selects the creator — this is what forms the agreement
    await factory.connect(brand).assignCreator(campaignId, creator.address);

    // Creator publishes and names the content the oracle should measure
    for (let i = 0; i < count; i++) {
      await escrow.connect(creator).submitProof(i, VIDEO_ID, CHANNEL_ID, IPFS_PROOF);
    }

    return escrow;
  }

  // ─────────────────────────────────────────────
  // Full Happy Path — Milestone Met
  // ─────────────────────────────────────────────

  describe("Happy Path — Milestone Met", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();
      escrow = await openFundedCampaign({
        thresholds: [THRESHOLD_50K],
        tranches: [USDC(500)],
        deadlines: [await futureDeadline()],
      });
    });

    it("authorises the escrow as a reputation minter at creation", async () => {
      assert.equal(
        await reputationToken.authorisedMinters(await escrow.getAddress()),
        true
      );
    });

    it("full flow: create → deposit → assign → proof → oracle → withdraw", async () => {
      // The fixture's creator named the content to measure
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.contentId, VIDEO_ID);
      assert.equal(milestone.channelId, CHANNEL_ID);
      assert.equal(milestone.ipfsProofHash, IPFS_PROOF);

      // Oracle verifies metric — 75k views beats 50k threshold
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);

      // Milestone marked as MET and the tranche credited to the creator
      assert.equal((await escrow.getMilestone(0)).status, 1n); // MET
      assert.equal(await escrow.withdrawable(creator.address), USDC(500));

      // Creator collects
      const creatorBalanceBefore = await usdc.balanceOf(creator.address);
      await escrow.connect(creator).withdraw(creator.address);
      const creatorBalanceAfter = await usdc.balanceOf(creator.address);
      assert.equal(creatorBalanceAfter - creatorBalanceBefore, USDC(500));

      // Escrow is now empty
      assert.equal(await usdc.balanceOf(await escrow.getAddress()), 0n);
    });

    it("mints reputation token to creator on milestone completion", async () => {
      const scoreBefore = await reputationToken.reputationScore(creator.address);
      assert.equal(scoreBefore, 0n);

      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);

      const scoreAfter = await reputationToken.reputationScore(creator.address);
      assert.equal(scoreAfter, 1n);

      const history = await reputationToken.getMintHistory(creator.address);
      assert.equal(history.length, 1);
      assert.equal(history[0].campaignId, 1n);
      assert.equal(history[0].milestoneIndex, 0n);
    });

    it("does not release if metric below threshold", async () => {
      // Only 30k views — below 50k threshold
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 30_000);

      assert.equal(await escrow.withdrawable(creator.address), 0n);

      // Milestone still pending
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 0n); // PENDING
    });

    it("releases on second oracle check when threshold eventually met", async () => {
      // First check — below threshold
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 30_000);
      let milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 0n); // still PENDING

      // Second check — threshold met
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 60_000);

      assert.equal(await escrow.withdrawable(creator.address), USDC(500));

      milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 1n); // MET
    });
  });

  // ─────────────────────────────────────────────
  // Open Listing — Before A Creator Is Selected
  // ─────────────────────────────────────────────

  describe("Open Listing", async () => {
    let escrow;
    let campaignId;

    beforeEach(async () => {
      await deployAll();

      const tx = await factory.connect(brand).createCampaign(
        IPFS_BRIEF,
        [PLATFORM_YOUTUBE],
        [METRIC_VIEWS],
        [THRESHOLD_50K],
        [USDC(500)],
        [await futureDeadline()]
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment?.name === "CampaignCreated"
      );
      campaignId = event.args.campaignId;
      escrow = await ethers.getContractAt("CampaignEscrow", event.args.escrowAddress);

      await usdc.connect(brand).approve(event.args.escrowAddress, USDC(500));
      await escrow.connect(brand).deposit(USDC(500));
    });

    it("rejects oracle metrics until a creator is bound", async () => {
      await assert.rejects(
        mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000),
        /no creator assigned/
      );
    });

    it("lets the brand withdraw the listing and recover the full deposit", async () => {
      const before = await usdc.balanceOf(brand.address);
      await escrow.connect(brand).cancelCampaign();
      const after = await usdc.balanceOf(brand.address);

      assert.equal(after - before, USDC(500));
      assert.equal(await escrow.isCancelled(), true);
    });

    it("closes the listing to future assignment once cancelled", async () => {
      await escrow.connect(brand).cancelCampaign();
      await assert.rejects(
        factory.connect(brand).assignCreator(campaignId, creator.address),
        /campaign already finalized/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Multi-Milestone Campaign
  // ─────────────────────────────────────────────

  describe("Multi-Milestone Campaign", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();
      const deadline = await futureDeadline();
      escrow = await openFundedCampaign({
        thresholds: [THRESHOLD_50K, THRESHOLD_100K, 200_000],
        tranches: [USDC(100), USDC(200), USDC(300)],
        deadlines: [deadline, deadline, deadline],
      });
    });

    it("releases tranches independently per milestone", async () => {
      // Milestone 0 — 75k views meets 50k threshold → 100 USDC credited
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      assert.equal(await escrow.withdrawable(creator.address), USDC(100));

      // Milestone 1 still pending
      const m1 = await escrow.getMilestone(1);
      assert.equal(m1.status, 0n); // PENDING

      // Milestone 1 — 120k views meets 100k threshold → 200 more credited
      await mockOracle.submitMetric(await escrow.getAddress(), 1, 120_000);
      assert.equal(await escrow.withdrawable(creator.address), USDC(300));
    });

    it("mints separate reputation tokens per milestone", async () => {
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      await mockOracle.submitMetric(await escrow.getAddress(), 1, 120_000);
      await mockOracle.submitMetric(await escrow.getAddress(), 2, 250_000);

      const score = await reputationToken.reputationScore(creator.address);
      assert.equal(score, 3n);

      const history = await reputationToken.getMintHistory(creator.address);
      assert.equal(history.length, 3);
    });

    it("batch oracle submission works correctly", async () => {
      // Submit all 3 milestones in one batch call
      await mockOracle.submitMetricBatch(
        await escrow.getAddress(),
        [0, 1, 2],
        [75_000, 120_000, 250_000]
      );

      // All 3 tranches credited
      assert.equal(await escrow.withdrawable(creator.address), USDC(600));
    });
  });

  // ─────────────────────────────────────────────
  // Failed Milestone — Deadline Passed
  // ─────────────────────────────────────────────

  describe("Failed Milestone — Refund Flow", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();
      escrow = await openFundedCampaign({
        thresholds: [THRESHOLD_50K],
        tranches: [USDC(500)],
        deadlines: [await futureDeadline(60)], // 60 second deadline
      });
    });

    it("refunds brand when the grace window closes and metric not met", async () => {
      // Time travel past the deadline and the oracle grace window
      await advanceTime(120 + GRACE_PERIOD);

      // Oracle submits below threshold
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 10_000);
      assert.equal(await escrow.withdrawable(brand.address), USDC(500));

      const brandBefore = await usdc.balanceOf(brand.address);
      await escrow.connect(brand).withdraw(brand.address);
      const brandAfter = await usdc.balanceOf(brand.address);
      assert.equal(brandAfter - brandBefore, USDC(500));

      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 2n); // FAILED
    });

    it("does not mint reputation token on failed milestone", async () => {
      await advanceTime(120 + GRACE_PERIOD);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 10_000);

      const score = await reputationToken.reputationScore(creator.address);
      assert.equal(score, 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Campaign Finalization
  // ─────────────────────────────────────────────

  describe("Campaign Finalization", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();
      const deadline = await futureDeadline(60);
      // 2 milestones — one will be met, one will fail
      escrow = await openFundedCampaign({
        thresholds: [THRESHOLD_50K, THRESHOLD_100K],
        tranches: [USDC(200), USDC(200)],
        deadlines: [deadline, deadline],
      });
    });

    it("correctly settles mixed met/failed milestones on finalization", async () => {
      // Milestone 0 met immediately
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);

      // Time travel — milestone 1's deadline and grace window pass
      await advanceTime(120 + GRACE_PERIOD);

      // Finalize — milestone 1 fails, credited back to brand
      await escrow.connect(brand).finalizeCampaign();

      // Creator is owed 200 USDC from milestone 0, the brand 200 from milestone 1
      assert.equal(await escrow.withdrawable(creator.address), USDC(200));
      assert.equal(await escrow.withdrawable(brand.address), USDC(200));
      assert.equal(await escrow.isFinalized(), true);

      // Both collect, and the escrow ends empty
      await escrow.connect(creator).withdraw(creator.address);
      await escrow.connect(brand).withdraw(brand.address);
      assert.equal(await usdc.balanceOf(await escrow.getAddress()), 0n);
    });
  });
});
