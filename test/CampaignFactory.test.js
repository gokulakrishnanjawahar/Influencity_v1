import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const USDC = (amount) => BigInt(amount) * 1_000_000n;
const futureDeadline = (secondsFromNow = 86400) =>
  Math.floor(Date.now() / 1000) + secondsFromNow;

// ─────────────────────────────────────────────
// CampaignFactory Tests
// ─────────────────────────────────────────────

describe("CampaignFactory", async () => {
  let ethers;
  let usdc;
  let reputationToken;
  let mockOracle;
  let factory;
  let owner;
  let brand;
  let creator;
  let other;

  // Milestone defaults
  const PLATFORM = 0;
  const METRIC_TYPE = 0;
  const THRESHOLD = 50_000;
  const TRANCHE = USDC(100);
  const CONTENT_ID = "dQw4w9WgXcQ";
  const IPFS_BRIEF = "bafybeibriefhash";

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    [owner, brand, creator, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy("https://w3s.link/ipfs/");

    const MockOracle = await ethers.getContractFactory("MockMetricsOracle");
    mockOracle = await MockOracle.deploy();

    const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
    factory = await CampaignFactory.deploy(
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await mockOracle.getAddress()
    );
  }

  // Helper: builds a valid milestone arguments array
  function buildMilestoneArgs(count = 1) {
    return {
      platforms: Array(count).fill(PLATFORM),
      metricTypes: Array(count).fill(METRIC_TYPE),
      thresholds: Array(count).fill(THRESHOLD),
      trancheAmounts: Array(count).fill(TRANCHE),
      deadlines: Array(count).fill(futureDeadline()),
      contentIds: Array(count).fill(CONTENT_ID),
    };
  }

  // ─────────────────────────────────────────────
  // Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", async () => {
    beforeEach(deployAll);

    it("sets owner to deployer", async () => {
      assert.equal(await factory.owner(), owner.address);
    });

    it("sets protocol addresses correctly", async () => {
      assert.equal(await factory.usdc(), await usdc.getAddress());
      assert.equal(await factory.reputationToken(), await reputationToken.getAddress());
      assert.equal(await factory.metricsConsumer(), await mockOracle.getAddress());
    });

    it("starts with zero campaigns", async () => {
      assert.equal(await factory.campaignCount(), 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Create Campaign
  // ─────────────────────────────────────────────

  describe("Create Campaign", async () => {
    beforeEach(deployAll);

    it("deploys a new escrow contract", async () => {
      const args = buildMilestoneArgs(1);
      await factory.connect(brand).createCampaign(
        creator.address,
        IPFS_BRIEF,
        args.platforms,
        args.metricTypes,
        args.thresholds,
        args.trancheAmounts,
        args.deadlines,
        args.contentIds
      );

      const escrowAddr = await factory.getEscrowAddress(1);
      assert.notEqual(escrowAddr, "0x0000000000000000000000000000000000000000");
    });

    it("increments campaign count", async () => {
      const args = buildMilestoneArgs(1);
      await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );
      assert.equal(await factory.campaignCount(), 1n);

      await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );
      assert.equal(await factory.campaignCount(), 2n);
    });

    it("registers campaign under brand wallet", async () => {
      const args = buildMilestoneArgs(1);
      await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );

      const brandList = await factory.getBrandCampaigns(brand.address);
      assert.equal(brandList.length, 1);
      assert.equal(brandList[0], 1n);
    });

    it("registers campaign under creator wallet", async () => {
      const args = buildMilestoneArgs(1);
      await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );

      const creatorList = await factory.getCreatorCampaigns(creator.address);
      assert.equal(creatorList.length, 1);
      assert.equal(creatorList[0], 1n);
    });

    it("emits CampaignCreated event", async () => {
      const args = buildMilestoneArgs(1);
      const tx = await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );
      assert.ok(event, "CampaignCreated event not emitted");
      assert.equal(event.args.campaignId, 1n);
      assert.equal(event.args.brand, brand.address);
      assert.equal(event.args.creator, creator.address);
    });

    it("creates an escrow with correct brand, creator, and brief hash", async () => {
      const args = buildMilestoneArgs(1);
      await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );

      const escrowAddr = await factory.getEscrowAddress(1);
      const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddr);

      assert.equal(await escrow.brand(), brand.address);
      assert.equal(await escrow.creator(), creator.address);
      assert.equal(await escrow.ipfsBriefHash(), IPFS_BRIEF);
    });

    it("adds all milestones to the escrow", async () => {
      const args = buildMilestoneArgs(3);
      await factory.connect(brand).createCampaign(
        creator.address, IPFS_BRIEF,
        args.platforms, args.metricTypes, args.thresholds,
        args.trancheAmounts, args.deadlines, args.contentIds
      );

      const escrowAddr = await factory.getEscrowAddress(1);
      const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddr);
      assert.equal(await escrow.getMilestoneCount(), 3n);
    });
  });

  // ─────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────

  describe("Validation", async () => {
    beforeEach(deployAll);

    it("reverts if brand and creator are the same", async () => {
      const args = buildMilestoneArgs(1);
      await assert.rejects(
        factory.connect(brand).createCampaign(
          brand.address, IPFS_BRIEF,
          args.platforms, args.metricTypes, args.thresholds,
          args.trancheAmounts, args.deadlines, args.contentIds
        ),
        /brand and creator cannot be same/
      );
    });

    it("reverts if brief hash is empty", async () => {
      const args = buildMilestoneArgs(1);
      await assert.rejects(
        factory.connect(brand).createCampaign(
          creator.address, "",
          args.platforms, args.metricTypes, args.thresholds,
          args.trancheAmounts, args.deadlines, args.contentIds
        ),
        /brief hash required/
      );
    });

    it("reverts if no milestones provided", async () => {
      await assert.rejects(
        factory.connect(brand).createCampaign(
          creator.address, IPFS_BRIEF,
          [], [], [], [], [], []
        ),
        /at least one milestone required/
      );
    });

    it("reverts if milestone arrays have mismatched lengths", async () => {
      await assert.rejects(
        factory.connect(brand).createCampaign(
          creator.address, IPFS_BRIEF,
          [PLATFORM, PLATFORM],            // 2 platforms
          [METRIC_TYPE],                   // but only 1 metric type
          [THRESHOLD],
          [TRANCHE],
          [futureDeadline()],
          [CONTENT_ID]
        ),
        /milestone arrays length mismatch/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Admin
  // ─────────────────────────────────────────────

  describe("Admin", async () => {
    beforeEach(deployAll);

    it("allows owner to update protocol addresses", async () => {
      const NewToken = await ethers.getContractFactory("MockUSDC");
      const newToken = await NewToken.deploy();

      await factory.updateProtocolAddresses(
        await newToken.getAddress(),
        await reputationToken.getAddress(),
        await mockOracle.getAddress()
      );

      assert.equal(await factory.usdc(), await newToken.getAddress());
    });

    it("reverts if non-owner tries to update protocol addresses", async () => {
      await assert.rejects(
        factory.connect(other).updateProtocolAddresses(
          await usdc.getAddress(),
          await reputationToken.getAddress(),
          await mockOracle.getAddress()
        ),
        /caller is not owner/
      );
    });
  });

  // ─────────────────────────────────────────────
  // View Functions
  // ─────────────────────────────────────────────

  describe("View Functions", async () => {
    beforeEach(deployAll);

    it("reverts if querying non-existent campaign", async () => {
      await assert.rejects(
        factory.getEscrowAddress(999),
        /campaign not found/
      );
    });

    it("returns empty array for brand with no campaigns", async () => {
      const list = await factory.getBrandCampaigns(other.address);
      assert.equal(list.length, 0);
    });
  });
});