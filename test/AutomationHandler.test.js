import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// AutomationHandler Tests
// ─────────────────────────────────────────────
// Covers the upkeep that removes humans from the verification loop: campaign
// enrolment, the due-check, request dispatch, and the failure modes that would
// otherwise stall or drain the upkeep.
//
// MetricsConsumer is substituted with MockMetricsConsumer here — the real one
// needs a live Chainlink Functions router. What matters for these tests is how
// the handler behaves around it, including when it reverts.
// ─────────────────────────────────────────────

describe("AutomationHandler", async () => {
  let ethers;
  let usdc;
  let reputationToken;
  let mockOracle;      // drives the escrow's milestones
  let mockConsumer;    // stands in for MetricsConsumer
  let factory;
  let handler;
  let owner;
  let brand;
  let creator;
  let other;

  const PLATFORM = 0;
  const METRIC_TYPE = 0;
  const THRESHOLD = 50_000;
  const CONTENT_ID = "dQw4w9WgXcQ";
  const IPFS_BRIEF = "bafybeibriefhash";
  const USDC = (amount) => BigInt(amount) * 1_000_000n;
  const ONE_DAY = 24 * 60 * 60;

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
    [owner, brand, creator, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy("https://w3s.link/ipfs/");

    const MockOracle = await ethers.getContractFactory("MockMetricsOracle");
    mockOracle = await MockOracle.deploy();

    const MockConsumer = await ethers.getContractFactory("MockMetricsConsumer");
    mockConsumer = await MockConsumer.deploy();

    const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
    factory = await CampaignFactory.deploy(
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await mockOracle.getAddress()
    );

    const AutomationHandler = await ethers.getContractFactory("AutomationHandler");
    handler = await AutomationHandler.deploy(await mockConsumer.getAddress());

    // Full production wiring: the factory authorises escrows on the reputation
    // token and enrols them with the handler, so both must trust it.
    await reputationToken.setCampaignFactory(await factory.getAddress());
    await handler.setCampaignFactory(await factory.getAddress());
    await factory.setAutomationHandler(await handler.getAddress());

    await usdc.connect(brand).faucet(USDC(10_000));
  }

  // Creates a campaign, funds it and binds the creator. Returns the escrow.
  async function liveCampaign({ milestones = 1, deadlineIn = 86400 } = {}) {
    const deadline = await futureDeadline(deadlineIn);
    const tranche = USDC(100);

    const tx = await factory.connect(brand).createCampaign(
      IPFS_BRIEF,
      Array(milestones).fill(PLATFORM),
      Array(milestones).fill(METRIC_TYPE),
      Array(milestones).fill(THRESHOLD),
      Array(milestones).fill(tranche),
      Array(milestones).fill(deadline),
      Array(milestones).fill(CONTENT_ID)
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment?.name === "CampaignCreated"
    );
    const escrowAddress = event.args.escrowAddress;
    const campaignId = event.args.campaignId;

    const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);
    const total = tranche * BigInt(milestones);
    await usdc.connect(brand).approve(escrowAddress, total);
    await escrow.connect(brand).deposit(total);
    await factory.connect(brand).assignCreator(campaignId, creator.address);

    return { escrow, escrowAddress, campaignId };
  }

  // ─────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────

  describe("Registration", async () => {
    beforeEach(deployAll);

    it("auto-registers every campaign the factory creates", async () => {
      const { campaignId, escrowAddress } = await liveCampaign();

      const sched = await handler.getCampaignSchedule(campaignId);
      assert.equal(sched.escrowAddress, escrowAddress);
      assert.equal(sched.active, true);
      assert.equal(sched.lastCheckedAt, 0n);
      assert.equal(await handler.getRegisteredCampaignCount(), 1n);
    });

    it("reverts if a stranger tries to register a campaign", async () => {
      await assert.rejects(
        handler.connect(other).registerCampaign(99, await mockConsumer.getAddress()),
        /caller is not factory or owner/
      );
    });

    it("reverts on a duplicate registration", async () => {
      const { campaignId, escrowAddress } = await liveCampaign();
      await assert.rejects(
        handler.registerCampaign(campaignId, escrowAddress),
        /campaign already registered/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Due Checks
  // ─────────────────────────────────────────────

  describe("checkUpkeep", async () => {
    beforeEach(deployAll);

    it("reports no upkeep when nothing is registered", async () => {
      const [needed] = await handler.checkUpkeep("0x");
      assert.equal(needed, false);
    });

    it("reports a freshly registered campaign as due", async () => {
      await liveCampaign();
      const [needed] = await handler.checkUpkeep("0x");
      assert.equal(needed, true);
    });

    it("stops reporting a campaign until its interval elapses", async () => {
      await liveCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      const [needed] = await handler.checkUpkeep("0x");
      assert.equal(needed, false);
    });

    it("reports the campaign again once the interval has passed", async () => {
      await liveCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);
      await advanceTime(ONE_DAY + 60);

      const [needed] = await handler.checkUpkeep("0x");
      assert.equal(needed, true);
    });
  });

  // ─────────────────────────────────────────────
  // Sweep
  // ─────────────────────────────────────────────

  describe("performUpkeep", async () => {
    beforeEach(deployAll);

    it("requests a metric for every pending milestone", async () => {
      await liveCampaign({ milestones: 3 });

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      assert.equal(await mockConsumer.requestCount(), 3n);
    });

    it("skips milestones that are already resolved", async () => {
      const { escrowAddress } = await liveCampaign({ milestones: 2 });

      // Resolve the first milestone — only the second should be requested.
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      assert.equal(await mockConsumer.requestCount(), 1n);
    });

    it("records the check timestamp", async () => {
      const { campaignId } = await liveCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      const sched = await handler.getCampaignSchedule(campaignId);
      assert.notEqual(sched.lastCheckedAt, 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Resilience
  // ─────────────────────────────────────────────
  // A single unrecoverable request — unset source script, exhausted
  // subscription — must not take down the whole sweep.

  describe("Resilience", async () => {
    beforeEach(deployAll);

    it("survives a reverting metrics consumer", async () => {
      await liveCampaign({ milestones: 2 });
      await mockConsumer.setShouldRevert(true);

      const [, performData] = await handler.checkUpkeep("0x");

      // The upkeep itself must still succeed.
      const tx = await handler.performUpkeep(performData);
      const receipt = await tx.wait();

      const failures = receipt.logs.filter(
        (log) => log.fragment && log.fragment.name === "MetricCheckFailed"
      );
      assert.equal(failures.length, 2);
      assert.equal(await mockConsumer.requestCount(), 0n);
    });

    it("keeps sweeping other campaigns after one fails", async () => {
      await liveCampaign();
      await liveCampaign();

      await mockConsumer.setShouldRevert(true);
      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      // Both campaigns were visited despite every request failing.
      const first = await handler.getCampaignSchedule(1);
      const second = await handler.getCampaignSchedule(2);
      assert.notEqual(first.lastCheckedAt, 0n);
      assert.notEqual(second.lastCheckedAt, 0n);
    });

    it("retires a finalised campaign from the sweep", async () => {
      const { escrow, campaignId } = await liveCampaign({ deadlineIn: 60 });

      // Let the milestone expire, then settle the campaign.
      await advanceTime(120);
      await escrow.connect(brand).finalizeCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      const sched = await handler.getCampaignSchedule(campaignId);
      assert.equal(sched.active, false);

      // And it no longer costs anything to leave registered.
      const [needed] = await handler.checkUpkeep("0x");
      assert.equal(needed, false);
      assert.equal(await mockConsumer.requestCount(), 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Scan List
  // ─────────────────────────────────────────────
  // checkUpkeep walks campaignIds on every poll. Retired campaigns are removed
  // from that array rather than skipped, so the scan stays proportional to live
  // campaigns rather than to every campaign ever created.

  describe("Scan List", async () => {
    beforeEach(deployAll);

    it("shrinks when a campaign is retired", async () => {
      const { escrow } = await liveCampaign({ deadlineIn: 60 });
      assert.equal(await handler.getRegisteredCampaignCount(), 1n);

      await advanceTime(120);
      await escrow.connect(brand).finalizeCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      assert.equal(await handler.getRegisteredCampaignCount(), 0n);
    });

    it("refuses to re-register a retired campaign", async () => {
      const { escrow, escrowAddress, campaignId } = await liveCampaign({ deadlineIn: 60 });

      await advanceTime(120);
      await escrow.connect(brand).finalizeCampaign();
      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      // Re-enrolling a settled campaign would put it back on the LINK meter.
      await assert.rejects(
        handler.registerCampaign(campaignId, escrowAddress),
        /campaign already registered/
      );
    });

    it("keeps sweeping the survivors when one is removed from the middle", async () => {
      await liveCampaign();                          // 1
      const second = await liveCampaign({ deadlineIn: 60 });  // 2 — will retire
      await liveCampaign();                          // 3

      await advanceTime(120);
      await second.escrow.connect(brand).finalizeCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);

      assert.equal(await handler.getRegisteredCampaignCount(), 2n);
      assert.equal((await handler.getCampaignSchedule(2)).active, false);

      // The swap-and-pop must not have stranded either survivor.
      assert.notEqual((await handler.getCampaignSchedule(1)).lastCheckedAt, 0n);
      assert.notEqual((await handler.getCampaignSchedule(3)).lastCheckedAt, 0n);

      assert.equal((await handler.getCampaignSchedule(1)).active, true);
      assert.equal((await handler.getCampaignSchedule(3)).active, true);
    });
  });

  // ─────────────────────────────────────────────
  // Manual Override
  // ─────────────────────────────────────────────

  describe("forceCheck", async () => {
    beforeEach(deployAll);

    it("checks a campaign immediately, ignoring the interval", async () => {
      const { campaignId } = await liveCampaign();

      const [, performData] = await handler.checkUpkeep("0x");
      await handler.performUpkeep(performData);
      assert.equal(await mockConsumer.requestCount(), 1n);

      // Not due again for 24h, but the override runs anyway.
      const [needed] = await handler.checkUpkeep("0x");
      assert.equal(needed, false);

      await handler.forceCheck(campaignId);
      assert.equal(await mockConsumer.requestCount(), 2n);
    });

    it("reverts for a campaign that is not active", async () => {
      await assert.rejects(
        handler.forceCheck(999),
        /campaign not active/
      );
    });

    it("reverts if a non-owner calls it", async () => {
      const { campaignId } = await liveCampaign();
      await assert.rejects(
        handler.connect(other).forceCheck(campaignId),
        /OwnableUnauthorizedAccount/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Forwarder Access Control
  // ─────────────────────────────────────────────

  describe("Forwarder", async () => {
    beforeEach(deployAll);

    it("is permissionless until a forwarder is configured", async () => {
      await liveCampaign();
      const [, performData] = await handler.checkUpkeep("0x");

      // Required before registration, when the forwarder address is unknown.
      await handler.connect(other).performUpkeep(performData);
      assert.equal(await mockConsumer.requestCount(), 1n);
    });

    it("rejects everyone but the forwarder once set", async () => {
      await liveCampaign();
      await handler.setForwarder(other.address);

      const [, performData] = await handler.checkUpkeep("0x");

      await assert.rejects(
        handler.connect(brand).performUpkeep(performData),
        /caller is not the upkeep forwarder/
      );

      // The forwarder itself still works.
      await handler.connect(other).performUpkeep(performData);
      assert.equal(await mockConsumer.requestCount(), 1n);
    });

    it("reverts if a non-owner tries to set the forwarder", async () => {
      await assert.rejects(
        handler.connect(other).setForwarder(other.address),
        /OwnableUnauthorizedAccount/
      );
    });
  });
});
