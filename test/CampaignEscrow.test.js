import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const USDC = (amount) => BigInt(amount) * 1_000_000n;
const futureDeadline = (secondsFromNow = 86400) =>
  Math.floor(Date.now() / 1000) + secondsFromNow;

// ─────────────────────────────────────────────
// CampaignEscrow Tests
// ─────────────────────────────────────────────

describe("CampaignEscrow", async () => {
  let ethers;
  let usdc;
  let reputationToken;
  let mockOracle;
  let escrow;
  let brand;
  let creator;
  let other;

  const PLATFORM = 0;       // YOUTUBE
  const METRIC_TYPE = 0;    // VIEWS
  const THRESHOLD = 50_000;
  const TRANCHE = USDC(100);
  const CONTENT_ID = "dQw4w9WgXcQ";
  const IPFS_BRIEF = "bafybeibriefhash";
  const IPFS_PROOF = "bafybeicproofhash";

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    [brand, creator, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy("https://w3s.link/ipfs/");

    const MockOracle = await ethers.getContractFactory("MockMetricsOracle");
    mockOracle = await MockOracle.deploy();

    const CampaignEscrow = await ethers.getContractFactory("CampaignEscrow");
    escrow = await CampaignEscrow.connect(brand).deploy(
      1,
      brand.address,
      creator.address,
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await mockOracle.getAddress(),
      IPFS_BRIEF
    );

    await reputationToken.authoriseMinter(await escrow.getAddress());
    await usdc.connect(brand).faucet(USDC(1000));
    await usdc.connect(brand).approve(await escrow.getAddress(), USDC(1000));
  }

  // Helper to advance time on the local Hardhat network
  async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  // ─────────────────────────────────────────────
  // Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", async () => {
    before(deployAll);

    it("sets brand, creator, campaignId correctly", async () => {
      assert.equal(await escrow.brand(), brand.address);
      assert.equal(await escrow.creator(), creator.address);
      assert.equal(await escrow.campaignId(), 1n);
    });

    it("stores IPFS brief hash immutably", async () => {
      assert.equal(await escrow.ipfsBriefHash(), IPFS_BRIEF);
    });

    it("sets metricsConsumer correctly", async () => {
      assert.equal(await escrow.metricsConsumer(), await mockOracle.getAddress());
    });
  });

  // ─────────────────────────────────────────────
  // Deposit
  // ─────────────────────────────────────────────

  describe("Deposit", async () => {
    beforeEach(deployAll);

    it("accepts USDC deposit from brand", async () => {
      await escrow.deposit(USDC(100));
      assert.equal(await escrow.totalDeposit(), USDC(100));
    });

    it("reverts if non-brand tries to deposit", async () => {
      await assert.rejects(
        escrow.connect(other).deposit(USDC(100)),
        /caller is not brand/
      );
    });

    it("reverts on double deposit", async () => {
      await escrow.deposit(USDC(100));
      await assert.rejects(
        escrow.deposit(USDC(100)),
        /already deposited/
      );
    });

    it("reverts on zero deposit", async () => {
      await assert.rejects(
        escrow.deposit(0),
        /deposit amount must be > 0/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Add Milestone
  // ─────────────────────────────────────────────

  describe("Add Milestone", async () => {
    beforeEach(async () => {
      await deployAll();
      await escrow.deposit(USDC(100));
    });

    it("adds a milestone successfully", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, futureDeadline(), CONTENT_ID
      );
      assert.equal(await escrow.getMilestoneCount(), 1n);
    });

    it("reverts if tranche exceeds deposit", async () => {
      await assert.rejects(
        escrow.addMilestone(
          PLATFORM, METRIC_TYPE, THRESHOLD, USDC(200), futureDeadline(), CONTENT_ID
        ),
        /tranches exceed total deposit/
      );
    });

    it("reverts if deadline is in the past", async () => {
      const pastDeadline = Math.floor(Date.now() / 1000) - 100;
      await assert.rejects(
        escrow.addMilestone(
          PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, pastDeadline, CONTENT_ID
        ),
        /invalid milestone parameters/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Milestone Met
  // ─────────────────────────────────────────────

  describe("Milestone Met", async () => {
    beforeEach(async () => {
      await deployAll();
      await escrow.deposit(USDC(100));
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, futureDeadline(), CONTENT_ID
      );
    });

    it("releases tranche to creator when threshold is met", async () => {
      const before = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      const after = await usdc.balanceOf(creator.address);
      assert.equal(after - before, TRANCHE);
    });

    it("marks milestone status as MET", async () => {
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 1n); // 1 = MET
    });

    it("mints a reputation token to creator", async () => {
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      const score = await reputationToken.reputationScore(creator.address);
      assert.equal(score, 1n);
    });

    it("does not release if value is below threshold", async () => {
      const before = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 10_000);
      const after = await usdc.balanceOf(creator.address);
      assert.equal(after, before);
    });
  });

  // ─────────────────────────────────────────────
  // Milestone Failed
  // ─────────────────────────────────────────────

  describe("Milestone Failed", async () => {
    beforeEach(deployAll);

    it("refunds tranche to brand when deadline passed and threshold not met", async () => {
      await escrow.deposit(USDC(100));
      const nearDeadline = Math.floor(Date.now() / 1000) + 60;
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, nearDeadline, CONTENT_ID
      );

      await advanceTime(100);

      const before = await usdc.balanceOf(brand.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 1_000);
      const after = await usdc.balanceOf(brand.address);
      assert.equal(after - before, TRANCHE);
    });

    it("marks milestone status as FAILED", async () => {
      await escrow.deposit(USDC(100));
      const nearDeadline = Math.floor(Date.now() / 1000) + 60;
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, nearDeadline, CONTENT_ID
      );

      await advanceTime(100);

      await mockOracle.submitMetric(await escrow.getAddress(), 0, 1_000);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 2n); // 2 = FAILED
    });
  });

  // ─────────────────────────────────────────────
  // Proof Submission
  // ─────────────────────────────────────────────

  describe("Proof Submission", async () => {
    beforeEach(async () => {
      await deployAll();
      await escrow.deposit(USDC(100));
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, futureDeadline(), CONTENT_ID
      );
    });

    it("allows creator to submit proof", async () => {
      await escrow.connect(creator).submitProof(0, IPFS_PROOF);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.ipfsProofHash, IPFS_PROOF);
    });

    it("reverts if non-creator submits proof", async () => {
      await assert.rejects(
        escrow.connect(other).submitProof(0, IPFS_PROOF),
        /caller is not creator/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Campaign Finalization
  // ─────────────────────────────────────────────

  describe("Campaign Finalization", async () => {
    beforeEach(deployAll);

    it("returns remainder to brand on finalization", async () => {
      await escrow.deposit(USDC(100));
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, USDC(60), futureDeadline(60), CONTENT_ID
      );

      await advanceTime(100);

      const before = await usdc.balanceOf(brand.address);
      await escrow.finalizeCampaign();
      const after = await usdc.balanceOf(brand.address);
      assert.equal(after - before, USDC(100));
    });

    it("reverts if non-brand tries to finalize", async () => {
      await escrow.deposit(USDC(100));
      await assert.rejects(
        escrow.connect(other).finalizeCampaign(),
        /not authorized to finalize/
      );
    });

    it("reverts on double finalization", async () => {
      await escrow.deposit(USDC(100));
      await advanceTime(100);
      await escrow.finalizeCampaign();
      await assert.rejects(
        escrow.finalizeCampaign(),
        /already finalized/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Access Control
  // ─────────────────────────────────────────────

  describe("Access Control", async () => {
    beforeEach(async () => {
      await deployAll();
      await escrow.deposit(USDC(100));
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, futureDeadline(), CONTENT_ID
      );
    });

    it("reverts if non-oracle tries to submit metric", async () => {
      await assert.rejects(
        escrow.connect(other).receiveVerifiedMetric(0, 75_000),
        /caller is not MetricsConsumer/
      );
    });
  });
});