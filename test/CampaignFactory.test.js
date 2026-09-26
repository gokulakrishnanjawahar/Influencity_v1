import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const USDC = (amount) => BigInt(amount) * 1_000_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

  async function futureDeadline(secondsFromNow = 86400) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + secondsFromNow;
  }

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

    // createCampaign authorises each new escrow as a reputation minter, and
    // ReputationToken only accepts that call from its owner or the registered
    // factory. Without this the very first createCampaign reverts.
    // scripts/deploy.js performs the same step in production.
    await reputationToken.setCampaignFactory(await factory.getAddress());

    // Campaigns must be funded before a creator can be bound, so the brand
    // needs a USDC balance to work with.
    await usdc.connect(brand).faucet(USDC(10_000));
  }

  // A creator can only be bound to a funded escrow, so assignment tests have to
  // put the deposit in first.
  async function fundCampaign(escrowAddress, amount = TRANCHE) {
    const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);
    await usdc.connect(brand).approve(escrowAddress, amount);
    await escrow.connect(brand).deposit(amount);
    return escrow;
  }

  // Helper: builds a valid milestone arguments array
  async function buildMilestoneArgs(count = 1) {
    const deadline = await futureDeadline();
    return {
      platforms: Array(count).fill(PLATFORM),
      metricTypes: Array(count).fill(METRIC_TYPE),
      thresholds: Array(count).fill(THRESHOLD),
      trancheAmounts: Array(count).fill(TRANCHE),
      deadlines: Array(count).fill(deadline),
      contentIds: Array(count).fill(CONTENT_ID),
    };
  }

  // Helper: creates a campaign as `brand` and returns its id + escrow address
  async function createCampaign(count = 1) {
    const args = await buildMilestoneArgs(count);
    const tx = await factory.connect(brand).createCampaign(
      IPFS_BRIEF,
      args.platforms,
      args.metricTypes,
      args.thresholds,
      args.trancheAmounts,
      args.deadlines,
      args.contentIds
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "CampaignCreated"
    );
    return {
      receipt,
      event,
      campaignId: event.args.campaignId,
      escrowAddress: event.args.escrowAddress,
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
      await createCampaign();
      const escrowAddr = await factory.getEscrowAddress(1);
      assert.notEqual(escrowAddr, ZERO_ADDRESS);
    });

    it("increments campaign count", async () => {
      await createCampaign();
      assert.equal(await factory.campaignCount(), 1n);

      await createCampaign();
      assert.equal(await factory.campaignCount(), 2n);
    });

    it("registers campaign under brand wallet", async () => {
      await createCampaign();
      const brandList = await factory.getBrandCampaigns(brand.address);
      assert.equal(brandList.length, 1);
      assert.equal(brandList[0], 1n);
    });

    it("emits CampaignCreated event", async () => {
      const { event } = await createCampaign();
      assert.ok(event, "CampaignCreated event not emitted");
      assert.equal(event.args.campaignId, 1n);
      assert.equal(event.args.brand, brand.address);
      assert.equal(event.args.ipfsBriefHash, IPFS_BRIEF);
      assert.notEqual(event.args.escrowAddress, ZERO_ADDRESS);
    });

    it("creates an escrow with correct brand and brief hash, and no creator", async () => {
      const { escrowAddress } = await createCampaign();
      const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

      assert.equal(await escrow.brand(), brand.address);
      assert.equal(await escrow.ipfsBriefHash(), IPFS_BRIEF);
      // Campaigns are deployed as open listings — a creator is bound later.
      assert.equal(await escrow.creator(), ZERO_ADDRESS);
    });

    it("makes the factory the owner of the escrow", async () => {
      const { escrowAddress } = await createCampaign();
      const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);
      assert.equal(await escrow.owner(), await factory.getAddress());
    });

    it("authorises the new escrow to mint reputation tokens", async () => {
      const { escrowAddress } = await createCampaign();
      assert.equal(await reputationToken.authorisedMinters(escrowAddress), true);
    });

    it("adds all milestones to the escrow", async () => {
      const { escrowAddress } = await createCampaign(3);
      const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);
      assert.equal(await escrow.getMilestoneCount(), 3n);
    });

    it("leaves the campaign unregistered for any creator until assignment", async () => {
      await createCampaign();
      const creatorList = await factory.getCreatorCampaigns(creator.address);
      assert.equal(creatorList.length, 0);
    });
  });

  // ─────────────────────────────────────────────
  // Assign Creator
  // ─────────────────────────────────────────────

  describe("Assign Creator", async () => {
    beforeEach(deployAll);

    it("binds the creator to the escrow", async () => {
      const { campaignId, escrowAddress } = await createCampaign();
      await fundCampaign(escrowAddress);
      await factory.connect(brand).assignCreator(campaignId, creator.address);

      const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);
      assert.equal(await escrow.creator(), creator.address);
    });

    it("registers campaign under creator wallet", async () => {
      const { campaignId, escrowAddress } = await createCampaign();
      await fundCampaign(escrowAddress);
      await factory.connect(brand).assignCreator(campaignId, creator.address);

      const creatorList = await factory.getCreatorCampaigns(creator.address);
      assert.equal(creatorList.length, 1);
      assert.equal(creatorList[0], 1n);
    });

    it("emits CreatorAssigned event", async () => {
      const { campaignId, escrowAddress } = await createCampaign();
      await fundCampaign(escrowAddress);
      const tx = await factory.connect(brand).assignCreator(campaignId, creator.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CreatorAssigned"
      );
      assert.ok(event, "CreatorAssigned event not emitted");
      assert.equal(event.args.campaignId, 1n);
      assert.equal(event.args.creator, creator.address);
    });

    it("reverts if caller is not the campaign brand", async () => {
      const { campaignId } = await createCampaign();
      await assert.rejects(
        factory.connect(other).assignCreator(campaignId, creator.address),
        /caller is not the campaign brand/
      );
    });

    it("reverts for an unknown campaign", async () => {
      await assert.rejects(
        factory.connect(brand).assignCreator(999, creator.address),
        /campaign not found/
      );
    });

    it("reverts if the campaign has not been funded", async () => {
      const { campaignId } = await createCampaign();
      await assert.rejects(
        factory.connect(brand).assignCreator(campaignId, creator.address),
        /campaign not funded/
      );
    });

    it("reverts if brand and creator are the same", async () => {
      const { campaignId } = await createCampaign();
      await assert.rejects(
        factory.connect(brand).assignCreator(campaignId, brand.address),
        /brand and creator cannot be same/
      );
    });

    it("reverts if a creator is already assigned", async () => {
      const { campaignId, escrowAddress } = await createCampaign();
      await fundCampaign(escrowAddress);
      await factory.connect(brand).assignCreator(campaignId, creator.address);
      await assert.rejects(
        factory.connect(brand).assignCreator(campaignId, other.address),
        /creator already assigned/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────

  describe("Validation", async () => {
    beforeEach(deployAll);

    it("reverts if brief hash is empty", async () => {
      const args = await buildMilestoneArgs(1);
      await assert.rejects(
        factory.connect(brand).createCampaign(
          "",
          args.platforms, args.metricTypes, args.thresholds,
          args.trancheAmounts, args.deadlines, args.contentIds
        ),
        /brief hash required/
      );
    });

    it("reverts if no milestones provided", async () => {
      await assert.rejects(
        factory.connect(brand).createCampaign(
          IPFS_BRIEF,
          [], [], [], [], [], []
        ),
        /at least one milestone required/
      );
    });

    it("reverts if milestone arrays have mismatched lengths", async () => {
      await assert.rejects(
        factory.connect(brand).createCampaign(
          IPFS_BRIEF,
          [PLATFORM, PLATFORM],            // 2 platforms
          [METRIC_TYPE],                   // but only 1 metric type
          [THRESHOLD],
          [TRANCHE],
          [await futureDeadline()],
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
