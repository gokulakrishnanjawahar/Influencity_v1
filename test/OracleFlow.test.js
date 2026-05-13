import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// End-to-End Oracle Flow Test
// ─────────────────────────────────────────────
// Simulates the complete Influencity protocol flow:
// 1. Brand creates campaign via Factory
// 2. Brand deposits USDC into escrow
// 3. Creator submits content proof
// 4. Oracle (simulated) verifies metric
// 5. Tranche released to creator + reputation token minted
// 6. Failed milestone refunds brand
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

  const USDC = (amount) => BigInt(amount) * 1_000_000n;
  const futureDeadline = (s = 86400) => Math.floor(Date.now() / 1000) + s;

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

    // Fund brand with USDC
    await usdc.connect(brand).faucet(USDC(1000));
  }

  // ─────────────────────────────────────────────
  // Full Happy Path — Milestone Met
  // ─────────────────────────────────────────────

  describe("Happy Path — Milestone Met", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();

      // 1. Brand creates campaign with one milestone
      const tx = await factory.connect(brand).createCampaign(
        creator.address,
        IPFS_BRIEF,
        [PLATFORM_YOUTUBE],
        [METRIC_VIEWS],
        [THRESHOLD_50K],
        [USDC(500)],
        [futureDeadline()],
        [VIDEO_ID]
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment?.name === "CampaignCreated"
      );
      const escrowAddress = event.args.escrowAddress;
      escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

      // Authorise escrow to mint reputation tokens
      await reputationToken.authoriseMinter(escrowAddress);

      // 2. Brand deposits USDC
      await usdc.connect(brand).approve(escrowAddress, USDC(500));
      await escrow.connect(brand).deposit(USDC(500));
    });

    it("full flow: create → deposit → proof → oracle → release", async () => {
      // 3. Creator submits content proof
      await escrow.connect(creator).submitProof(0, IPFS_PROOF);

      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.ipfsProofHash, IPFS_PROOF);

      // 4. Record balances before oracle verification
      const creatorBalanceBefore = await usdc.balanceOf(creator.address);
      const escrowBalanceBefore = await usdc.balanceOf(await escrow.getAddress());

      // 5. Oracle verifies metric — 75k views beats 50k threshold
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);

      // 6. Verify tranche released to creator
      const creatorBalanceAfter = await usdc.balanceOf(creator.address);
      assert.equal(creatorBalanceAfter - creatorBalanceBefore, USDC(500));

      // 7. Verify escrow is now empty
      const escrowBalanceAfter = await usdc.balanceOf(await escrow.getAddress());
      assert.equal(escrowBalanceAfter, 0n);

      // 8. Verify milestone marked as MET
      const updatedMilestone = await escrow.getMilestone(0);
      assert.equal(updatedMilestone.status, 1n); // MET
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
      const creatorBalanceBefore = await usdc.balanceOf(creator.address);

      // Only 30k views — below 50k threshold
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 30_000);

      const creatorBalanceAfter = await usdc.balanceOf(creator.address);
      assert.equal(creatorBalanceAfter, creatorBalanceBefore);

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
      const creatorBalanceBefore = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 60_000);

      const creatorBalanceAfter = await usdc.balanceOf(creator.address);
      assert.equal(creatorBalanceAfter - creatorBalanceBefore, USDC(500));

      milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 1n); // MET
    });
  });

  // ─────────────────────────────────────────────
  // Multi-Milestone Campaign
  // ─────────────────────────────────────────────

  describe("Multi-Milestone Campaign", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();

      // Campaign with 3 milestones at different thresholds
      const tx = await factory.connect(brand).createCampaign(
        creator.address,
        IPFS_BRIEF,
        [PLATFORM_YOUTUBE, PLATFORM_YOUTUBE, PLATFORM_YOUTUBE],
        [METRIC_VIEWS, METRIC_VIEWS, METRIC_VIEWS],
        [THRESHOLD_50K, THRESHOLD_100K, 200_000],
        [USDC(100), USDC(200), USDC(300)],
        [futureDeadline(), futureDeadline(), futureDeadline()],
        [VIDEO_ID, VIDEO_ID, VIDEO_ID]
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment?.name === "CampaignCreated"
      );
      const escrowAddress = event.args.escrowAddress;
      escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

      await reputationToken.authoriseMinter(escrowAddress);
      await usdc.connect(brand).approve(escrowAddress, USDC(600));
      await escrow.connect(brand).deposit(USDC(600));
    });

    it("releases tranches independently per milestone", async () => {
      // Milestone 0 — 75k views meets 50k threshold → 100 USDC released
      const before = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      const after = await usdc.balanceOf(creator.address);
      assert.equal(after - before, USDC(100));

      // Milestone 1 still pending
      const m1 = await escrow.getMilestone(1);
      assert.equal(m1.status, 0n); // PENDING

      // Milestone 1 — 120k views meets 100k threshold → 200 USDC released
      const before2 = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 1, 120_000);
      const after2 = await usdc.balanceOf(creator.address);
      assert.equal(after2 - before2, USDC(200));
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
      const before = await usdc.balanceOf(creator.address);

      // Submit all 3 milestones in one batch call
      await mockOracle.submitMetricBatch(
        await escrow.getAddress(),
        [0, 1, 2],
        [75_000, 120_000, 250_000]
      );

      const after = await usdc.balanceOf(creator.address);
      assert.equal(after - before, USDC(600)); // All 3 tranches released
    });
  });

  // ─────────────────────────────────────────────
  // Failed Milestone — Deadline Passed
  // ─────────────────────────────────────────────

  describe("Failed Milestone — Refund Flow", async () => {
    let escrow;

    beforeEach(async () => {
      await deployAll();

      const tx = await factory.connect(brand).createCampaign(
        creator.address,
        IPFS_BRIEF,
        [PLATFORM_YOUTUBE],
        [METRIC_VIEWS],
        [THRESHOLD_50K],
        [USDC(500)],
        [futureDeadline(60)], // 60 second deadline
        [VIDEO_ID]
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment?.name === "CampaignCreated"
      );
      const escrowAddress = event.args.escrowAddress;
      escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

      await reputationToken.authoriseMinter(escrowAddress);
      await usdc.connect(brand).approve(escrowAddress, USDC(500));
      await escrow.connect(brand).deposit(USDC(500));
    });

    it("refunds brand when deadline passes and metric not met", async () => {
      // Time travel past deadline
      await advanceTime(120);

      const brandBefore = await usdc.balanceOf(brand.address);

      // Oracle submits below threshold after deadline
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 10_000);

      const brandAfter = await usdc.balanceOf(brand.address);
      assert.equal(brandAfter - brandBefore, USDC(500));

      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 2n); // FAILED
    });

    it("does not mint reputation token on failed milestone", async () => {
      await advanceTime(120);
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

      // 2 milestones — one will be met, one will fail
      const tx = await factory.connect(brand).createCampaign(
        creator.address,
        IPFS_BRIEF,
        [PLATFORM_YOUTUBE, PLATFORM_YOUTUBE],
        [METRIC_VIEWS, METRIC_VIEWS],
        [THRESHOLD_50K, THRESHOLD_100K],
        [USDC(200), USDC(200)],
        [futureDeadline(60), futureDeadline(60)],
        [VIDEO_ID, VIDEO_ID]
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment?.name === "CampaignCreated"
      );
      const escrowAddress = event.args.escrowAddress;
      escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

      await reputationToken.authoriseMinter(escrowAddress);
      await usdc.connect(brand).approve(escrowAddress, USDC(400));
      await escrow.connect(brand).deposit(USDC(400));
    });

    it("correctly settles mixed met/failed milestones on finalization", async () => {
      // Milestone 0 met immediately
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);

      // Time travel — milestone 1 deadline passes
      await advanceTime(120);

      const brandBefore = await usdc.balanceOf(brand.address);
      const creatorBefore = await usdc.balanceOf(creator.address);

      // Finalize — milestone 1 fails, refunded to brand
      await escrow.connect(brand).finalizeCampaign();

      const brandAfter = await usdc.balanceOf(brand.address);
      const creatorAfter = await usdc.balanceOf(creator.address);

      // Creator got 200 USDC from milestone 0
      assert.equal(creatorAfter - creatorBefore, 0n); // already released earlier
      // Brand got back 200 USDC from failed milestone 1
      assert.equal(brandAfter - brandBefore, USDC(200));

      assert.equal(await escrow.isFinalized(), true);
    });
  });
});