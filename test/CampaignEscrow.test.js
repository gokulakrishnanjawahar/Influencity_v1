import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const USDC = (amount) => BigInt(amount) * 1_000_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const GRACE_PERIOD = 2 * 24 * 60 * 60; // MilestoneLib.GRACE_PERIOD

// ─────────────────────────────────────────────
// CampaignEscrow Tests
// ─────────────────────────────────────────────

describe("CampaignEscrow", async () => {
  let ethers;
  let usdc;
  let reputationToken;
  let mockOracle;
  let escrow;
  let escrowAddress;
  let brand;
  let creator;
  let other;

  const PLATFORM = 0;       // YOUTUBE
  const METRIC_TYPE = 0;    // VIEWS
  const THRESHOLD = 50_000;
  const TRANCHE = USDC(100);
  const CONTENT_ID = "dQw4w9WgXcQ";
  const CHANNEL_ID = "UCuAXFkgsw1L7xaCfnd5JJOw";
  const IPFS_BRIEF = "bafybeibriefhash";
  const IPFS_PROOF = "bafybeicproofhash";

  // Deadlines are derived from the chain's latest block rather than Date.now().
  // advanceTime() pushes chain time forward cumulatively within a run, so a
  // wall-clock deadline silently drifts into the past and addMilestone starts
  // reverting depending on which tests ran before it.
  async function futureDeadline(secondsFromNow = 86400) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + secondsFromNow;
  }

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    [brand, creator, other] = await ethers.getSigners();

    // The blacklisting variant behaves exactly like MockUSDC until an address
    // is blacklisted, so every test runs against it.
    const MockUSDC = await ethers.getContractFactory("MockBlacklistUSDC");
    usdc = await MockUSDC.deploy();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy("https://w3s.link/ipfs/");

    const MockOracle = await ethers.getContractFactory("MockMetricsOracle");
    mockOracle = await MockOracle.deploy();

    // Deployed directly rather than through the factory so these tests exercise
    // the escrow in isolation — which makes `brand` the escrow's owner, the role
    // the factory holds in production.
    //
    // The escrow is born as an OPEN listing: there is no creator until
    // assignCreator() binds one.
    const CampaignEscrow = await ethers.getContractFactory("CampaignEscrow");
    escrow = await CampaignEscrow.connect(brand).deploy(
      1,
      brand.address,
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await mockOracle.getAddress(),
      IPFS_BRIEF
    );
    escrowAddress = await escrow.getAddress();

    await reputationToken.authoriseMinter(escrowAddress);
    await usdc.connect(brand).faucet(USDC(1000));
    await usdc.connect(brand).approve(escrowAddress, USDC(1000));
  }

  // A campaign must be funded before a creator can be bound to it — binding a
  // creator to an empty escrow creates an agreement that can never pay out.
  async function deployFunded(amount = USDC(100)) {
    await deployAll();
    await escrow.connect(brand).deposit(amount);
  }

  // Most behaviour only becomes reachable once a creator is bound —
  // receiveVerifiedMetric and submitProof both require one.
  async function deployFundedAndAssigned(amount = USDC(100)) {
    await deployFunded(amount);
    await escrow.connect(brand).assignCreator(creator.address);
  }

  async function addMilestone({ tranche = TRANCHE, deadlineIn = 86400 } = {}) {
    await escrow.addMilestone(
      PLATFORM, METRIC_TYPE, THRESHOLD, tranche, await futureDeadline(deadlineIn)
    );
  }

  async function submitProof(index = 0) {
    await escrow.connect(creator).submitProof(index, CONTENT_ID, CHANNEL_ID, IPFS_PROOF);
  }

  // A milestone the oracle can be asked about: added, and content submitted
  async function liveMilestone(opts) {
    await addMilestone(opts);
    const index = Number(await escrow.getMilestoneCount()) - 1;
    await submitProof(index);
    return index;
  }

  async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  function findEvent(receipt, name) {
    return receipt.logs.find((log) => log.fragment && log.fragment.name === name);
  }

  // ─────────────────────────────────────────────
  // Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", async () => {
    before(deployAll);

    it("sets brand and campaignId correctly", async () => {
      assert.equal(await escrow.brand(), brand.address);
      assert.equal(await escrow.campaignId(), 1n);
    });

    it("starts as an open listing with no creator", async () => {
      assert.equal(await escrow.creator(), ZERO_ADDRESS);
    });

    it("stores IPFS brief hash immutably", async () => {
      assert.equal(await escrow.ipfsBriefHash(), IPFS_BRIEF);
    });

    it("sets metricsConsumer correctly", async () => {
      assert.equal(await escrow.metricsConsumer(), await mockOracle.getAddress());
    });

    it("starts unfinalized and uncancelled", async () => {
      assert.equal(await escrow.isFinalized(), false);
      assert.equal(await escrow.isCancelled(), false);
    });
  });

  // ─────────────────────────────────────────────
  // Creator Assignment
  // ─────────────────────────────────────────────

  describe("Creator Assignment", async () => {
    beforeEach(() => deployFunded());

    it("binds the creator and emits CreatorAssigned", async () => {
      const tx = await escrow.connect(brand).assignCreator(creator.address);
      const receipt = await tx.wait();

      assert.equal(await escrow.creator(), creator.address);

      const event = findEvent(receipt, "CreatorAssigned");
      assert.ok(event, "CreatorAssigned event not emitted");
      assert.equal(event.args.creator, creator.address);
    });

    it("reverts if a creator is already assigned", async () => {
      await escrow.connect(brand).assignCreator(creator.address);
      await assert.rejects(
        escrow.connect(brand).assignCreator(other.address),
        /creator already assigned/
      );
    });

    it("reverts on zero address", async () => {
      await assert.rejects(
        escrow.connect(brand).assignCreator(ZERO_ADDRESS),
        /invalid creator address/
      );
    });

    it("reverts if brand and creator are the same", async () => {
      await assert.rejects(
        escrow.connect(brand).assignCreator(brand.address),
        /brand and creator cannot be same/
      );
    });

    it("reverts if a non-owner tries to assign", async () => {
      await assert.rejects(
        escrow.connect(other).assignCreator(creator.address),
        /OwnableUnauthorizedAccount/
      );
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
    beforeEach(() => deployFunded());

    it("adds a milestone with no content yet", async () => {
      await addMilestone();
      assert.equal(await escrow.getMilestoneCount(), 1n);

      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.contentId, "");
      assert.equal(milestone.channelId, "");
    });

    it("reverts if tranche exceeds deposit", async () => {
      await assert.rejects(
        addMilestone({ tranche: USDC(200) }),
        /tranches exceed total deposit/
      );
    });

    it("reverts if deadline is in the past", async () => {
      const block = await ethers.provider.getBlock("latest");
      await assert.rejects(
        escrow.addMilestone(PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, block.timestamp - 100),
        /invalid milestone parameters/
      );
    });

    // The oracle cannot measure these, so a milestone built on one could never
    // pay out. They must be refused up front rather than fail at the deadline.
    it("rejects a metric the oracle cannot measure on that platform", async () => {
      const deadline = await futureDeadline();
      const unsupported = [
        [0, 1], // YOUTUBE CLICKS
        [0, 3], // YOUTUBE WATCH_TIME
        [1, 1], // TWITCH CLICKS
        [2, 2], // LINKEDIN FOLLOWERS
      ];
      for (const [platform, metric] of unsupported) {
        await assert.rejects(
          escrow.addMilestone(platform, metric, THRESHOLD, USDC(1), deadline),
          /metric not supported on platform/
        );
      }
    });

    it("accepts every metric the oracle supports", async () => {
      const deadline = await futureDeadline();
      const supported = [[0, 0], [0, 2], [1, 0], [1, 2], [1, 4], [2, 0], [2, 1]];
      for (const [platform, metric] of supported) {
        await escrow.addMilestone(platform, metric, THRESHOLD, USDC(1), deadline);
      }
      assert.equal(await escrow.getMilestoneCount(), BigInt(supported.length));
    });
  });

  // ─────────────────────────────────────────────
  // Proof Submission
  // ─────────────────────────────────────────────
  // The content to measure does not exist when the brand creates the campaign,
  // so the creator names it — along with the channel it must belong to.

  describe("Proof Submission", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await addMilestone();
    });

    it("stores the creator's content, channel and proof", async () => {
      await submitProof();
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.contentId, CONTENT_ID);
      assert.equal(milestone.channelId, CHANNEL_ID);
      assert.equal(milestone.ipfsProofHash, IPFS_PROOF);
    });

    it("emits ProofSubmitted", async () => {
      const tx = await escrow
        .connect(creator)
        .submitProof(0, CONTENT_ID, CHANNEL_ID, IPFS_PROOF);
      const event = findEvent(await tx.wait(), "ProofSubmitted");
      assert.ok(event, "ProofSubmitted not emitted");
      assert.equal(event.args.contentId, CONTENT_ID);
      assert.equal(event.args.channelId, CHANNEL_ID);
    });

    it("cannot be changed once submitted", async () => {
      await submitProof();
      await assert.rejects(
        escrow.connect(creator).submitProof(0, "anotherVideo", CHANNEL_ID, IPFS_PROOF),
        /proof already submitted/
      );
    });

    it("reverts if non-creator submits proof", async () => {
      await assert.rejects(
        escrow.connect(other).submitProof(0, CONTENT_ID, CHANNEL_ID, IPFS_PROOF),
        /caller is not creator/
      );
    });

    it("reverts on an invalid milestone index", async () => {
      await assert.rejects(
        escrow.connect(creator).submitProof(5, CONTENT_ID, CHANNEL_ID, IPFS_PROOF),
        /invalid milestone index/
      );
    });

    it("reverts on an empty content ID", async () => {
      await assert.rejects(
        escrow.connect(creator).submitProof(0, "", CHANNEL_ID, IPFS_PROOF),
        /content ID required/
      );
    });

    it("reverts on an empty channel ID", async () => {
      await assert.rejects(
        escrow.connect(creator).submitProof(0, CONTENT_ID, "", IPFS_PROOF),
        /channel ID required/
      );
    });

    it("reverts on an empty proof hash", async () => {
      await assert.rejects(
        escrow.connect(creator).submitProof(0, CONTENT_ID, CHANNEL_ID, ""),
        /proof hash required/
      );
    });

    it("rejects proof submitted after the milestone deadline", async () => {
      await advanceTime(86400 + 60);
      await assert.rejects(submitProof(), /milestone deadline passed/);
    });
  });

  // ─────────────────────────────────────────────
  // Milestone Met
  // ─────────────────────────────────────────────

  describe("Milestone Met", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await liveMilestone();
    });

    it("credits the tranche to the creator without transferring it", async () => {
      const before = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);
      assert.equal(await usdc.balanceOf(creator.address), before);
    });

    it("lets the creator withdraw the credited tranche", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      await escrow.connect(creator).withdraw(creator.address);

      assert.equal(await usdc.balanceOf(creator.address), TRANCHE);
      assert.equal(await escrow.withdrawable(creator.address), 0n);
    });

    it("marks milestone status as MET", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 1n); // 1 = MET
    });

    // Regression: the event used to report the threshold, not what the oracle saw
    it("reports the oracle's value in MilestoneMet, not the threshold", async () => {
      const tx = await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      const receipt = await tx.wait();

      const log = receipt.logs
        .map((l) => { try { return escrow.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "MilestoneMet");
      assert.ok(log, "MilestoneMet not emitted");
      assert.equal(log.args.verifiedValue, 75_000n);
      assert.equal(log.args.trancheReleased, TRANCHE);
    });

    it("mints a reputation token to creator", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      assert.equal(await reputationToken.reputationScore(creator.address), 1n);
    });

    it("records the payout value and brand in reputation", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      const [milestones, earned, uniqueBrands] =
        await reputationToken.getReputation(creator.address);
      assert.equal(milestones, 1n);
      assert.equal(earned, TRANCHE);
      assert.equal(uniqueBrands, 1n);
    });

    it("tracks totalReleased", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      assert.equal(await escrow.totalReleased(), TRANCHE);
    });

    it("does not credit anything if value is below threshold", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 10_000);
      assert.equal(await escrow.withdrawable(creator.address), 0n);
      assert.equal((await escrow.getMilestone(0)).status, 0n); // still PENDING
    });

    it("reverts if the same milestone is resolved twice", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      await assert.rejects(
        mockOracle.submitMetric(escrowAddress, 0, 75_000),
        /milestone already resolved/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Metric Preconditions
  // ─────────────────────────────────────────────

  describe("Metric Preconditions", async () => {
    it("rejects a verified metric while the campaign is still open", async () => {
      await deployFunded();
      await addMilestone();
      await assert.rejects(
        mockOracle.submitMetric(escrowAddress, 0, 75_000),
        /no creator assigned/
      );
    });

    // A reading with no content behind it is not a measurement of anything
    it("rejects a verified metric before the creator has named any content", async () => {
      await deployFundedAndAssigned();
      await addMilestone();
      await assert.rejects(
        mockOracle.submitMetric(escrowAddress, 0, 75_000),
        /no content submitted/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Oracle Grace Period
  // ─────────────────────────────────────────────
  // An oracle that reports late must not cost the creator a target they hit.

  describe("Oracle Grace Period", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await liveMilestone({ deadlineIn: 60 });
    });

    it("still pays a met milestone reported after the deadline", async () => {
      await advanceTime(120); // past the deadline, inside the grace window
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      assert.equal((await escrow.getMilestone(0)).status, 1n); // MET
      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);
    });

    it("does not fail an unmet milestone during the grace window", async () => {
      await advanceTime(120);
      await mockOracle.submitMetric(escrowAddress, 0, 1_000);

      assert.equal((await escrow.getMilestone(0)).status, 0n); // still PENDING
      assert.equal(await escrow.withdrawable(brand.address), 0n);
    });

    it("blocks finalization during the grace window", async () => {
      await advanceTime(120);
      await assert.rejects(escrow.finalizeCampaign(), /milestone still live/);
    });

    it("fails an unmet milestone once the grace window closes", async () => {
      await advanceTime(60 + GRACE_PERIOD + 60);
      await mockOracle.submitMetric(escrowAddress, 0, 1_000);

      assert.equal((await escrow.getMilestone(0)).status, 2n); // FAILED
      assert.equal(await escrow.withdrawable(brand.address), TRANCHE);
    });
  });

  // ─────────────────────────────────────────────
  // Milestone Failed
  // ─────────────────────────────────────────────

  describe("Milestone Failed", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await liveMilestone({ deadlineIn: 60 });
      await advanceTime(60 + GRACE_PERIOD + 60);
    });

    it("credits the tranche back to the brand", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 1_000);
      assert.equal(await escrow.withdrawable(brand.address), TRANCHE);

      const before = await usdc.balanceOf(brand.address);
      await escrow.connect(brand).withdraw(brand.address);
      assert.equal((await usdc.balanceOf(brand.address)) - before, TRANCHE);
    });

    it("marks milestone status as FAILED", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 1_000);
      assert.equal((await escrow.getMilestone(0)).status, 2n);
    });

    it("does not mint reputation on a failed milestone", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 1_000);
      assert.equal(await reputationToken.reputationScore(creator.address), 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Withdrawals
  // ─────────────────────────────────────────────

  describe("Withdrawals", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await liveMilestone();
    });

    it("sends to a different address when asked", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      await escrow.connect(creator).withdraw(other.address);
      assert.equal(await usdc.balanceOf(other.address), TRANCHE);
    });

    it("emits Withdrawn", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      const tx = await escrow.connect(creator).withdraw(creator.address);
      const event = findEvent(await tx.wait(), "Withdrawn");
      assert.ok(event, "Withdrawn not emitted");
      assert.equal(event.args.account, creator.address);
      assert.equal(event.args.amount, TRANCHE);
    });

    it("reverts with nothing to withdraw", async () => {
      await assert.rejects(
        escrow.connect(other).withdraw(other.address),
        /nothing to withdraw/
      );
    });

    it("cannot be withdrawn twice", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      await escrow.connect(creator).withdraw(creator.address);
      await assert.rejects(
        escrow.connect(creator).withdraw(creator.address),
        /nothing to withdraw/
      );
    });

    it("reverts on a zero recipient", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      await assert.rejects(
        escrow.connect(creator).withdraw(ZERO_ADDRESS),
        /invalid recipient/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Blacklisted Accounts
  // ─────────────────────────────────────────────
  // USDC can blacklist an address. A direct transfer to one reverts, and that
  // revert used to happen inside the oracle callback or finalizeCampaign —
  // freezing the escrow for the other party too.

  describe("Blacklisted Accounts", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await liveMilestone();
    });

    it("still settles a met milestone when the creator is blacklisted", async () => {
      await usdc.setBlacklisted(creator.address, true);
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      assert.equal((await escrow.getMilestone(0)).status, 1n); // MET
      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);
    });

    it("lets a blacklisted creator recover funds to another address", async () => {
      await usdc.setBlacklisted(creator.address, true);
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      await escrow.connect(creator).withdraw(other.address);
      assert.equal(await usdc.balanceOf(other.address), TRANCHE);
    });

    it("still finalizes, and pays the creator, when the brand is blacklisted", async () => {
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      await usdc.setBlacklisted(brand.address, true);

      await escrow.finalizeCampaign();
      assert.equal(await escrow.isFinalized(), true);

      await escrow.connect(creator).withdraw(creator.address);
      assert.equal(await usdc.balanceOf(creator.address), TRANCHE);
    });
  });

  // ─────────────────────────────────────────────
  // Campaign Cancellation
  // ─────────────────────────────────────────────

  describe("Campaign Cancellation", async () => {
    beforeEach(deployAll);

    it("refunds the full balance to the brand while still open", async () => {
      await escrow.deposit(USDC(100));

      const before = await usdc.balanceOf(brand.address);
      await escrow.connect(brand).cancelCampaign();
      const after = await usdc.balanceOf(brand.address);

      assert.equal(after - before, USDC(100));
      assert.equal(await escrow.isCancelled(), true);
      assert.equal(await escrow.isFinalized(), true);
    });

    it("reverts once a creator has been assigned", async () => {
      await escrow.deposit(USDC(100));
      await escrow.connect(brand).assignCreator(creator.address);

      await assert.rejects(
        escrow.connect(brand).cancelCampaign(),
        /creator already assigned, cannot cancel/
      );
    });

    it("reverts if a non-brand tries to cancel", async () => {
      await escrow.deposit(USDC(100));
      await assert.rejects(
        escrow.connect(other).cancelCampaign(),
        /caller is not brand/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Campaign Finalization
  // ─────────────────────────────────────────────

  describe("Campaign Finalization", async () => {
    beforeEach(() => deployFundedAndAssigned());

    it("credits the failed tranche and remainder to the brand", async () => {
      await liveMilestone({ tranche: USDC(60), deadlineIn: 60 });
      await advanceTime(60 + GRACE_PERIOD + 60);

      await escrow.finalizeCampaign();
      assert.equal(await escrow.withdrawable(brand.address), USDC(100));
    });

    // Finalizing moves no USDC out and only works once everything is settled,
    // so anyone may call it — and the brand, not the caller, is credited.
    it("can be called by anyone, crediting only the brand", async () => {
      await liveMilestone({ tranche: USDC(60), deadlineIn: 60 });
      await advanceTime(60 + GRACE_PERIOD + 60);

      await escrow.connect(other).finalizeCampaign();
      assert.equal(await escrow.isFinalized(), true);
      assert.equal(await escrow.withdrawable(other.address), 0n);
      assert.equal(await escrow.withdrawable(brand.address), USDC(100));
    });

    it("does not hand the brand USDC already owed to the creator", async () => {
      await liveMilestone({ tranche: USDC(60) });
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      // Creator has not withdrawn yet; finalize must leave their 60 alone
      await escrow.finalizeCampaign();
      assert.equal(await escrow.withdrawable(brand.address), USDC(40));
      assert.equal(await escrow.withdrawable(creator.address), USDC(60));

      await escrow.connect(creator).withdraw(creator.address);
      await escrow.connect(brand).withdraw(brand.address);
      assert.equal(await escrow.getBalance(), 0n);
    });

    it("reverts on double finalization", async () => {
      await escrow.finalizeCampaign();
      await assert.rejects(escrow.finalizeCampaign(), /already finalized/);
    });
  });

  // ─────────────────────────────────────────────
  // Access Control
  // ─────────────────────────────────────────────

  describe("Access Control", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await liveMilestone();
    });

    it("reverts if non-oracle tries to submit metric", async () => {
      await assert.rejects(
        escrow.connect(other).receiveVerifiedMetric(0, 75_000),
        /caller is not MetricsConsumer/
      );
    });

    it("reverts if a non-owner tries to add a milestone", async () => {
      await assert.rejects(
        escrow.connect(other).addMilestone(
          PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline()
        ),
        /OwnableUnauthorizedAccount/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Finalization Safety
  // ─────────────────────────────────────────────
  // finalizeCampaign() hands the brand everything not already owed. Doing that
  // while a milestone is still live — before its deadline plus grace window —
  // would let the brand reclaim money the creator is still working to earn,
  // including work already delivered but not yet verified by the oracle.

  describe("Finalization Safety", async () => {
    beforeEach(() => deployFundedAndAssigned());

    it("reverts while a milestone is still live", async () => {
      await addMilestone();
      await assert.rejects(escrow.finalizeCampaign(), /milestone still live/);
    });

    it("leaves the funds in escrow when finalization is refused", async () => {
      await addMilestone();
      await assert.rejects(escrow.finalizeCampaign());

      assert.equal(await escrow.getBalance(), USDC(100));
      assert.equal(await escrow.isFinalized(), false);
    });

    it("cannot strand a creator who has met the threshold but not yet been verified", async () => {
      await liveMilestone();

      await assert.rejects(escrow.finalizeCampaign(), /milestone still live/);

      // The tranche is still available, so the pending verification can pay out.
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);
      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);
    });

    it("reverts when only some milestones have expired", async () => {
      await addMilestone({ tranche: USDC(50), deadlineIn: 60 });
      await addMilestone({ tranche: USDC(50), deadlineIn: 30 * 86400 });

      await advanceTime(60 + GRACE_PERIOD + 60); // only the first has expired

      await assert.rejects(escrow.finalizeCampaign(), /milestone still live/);
    });

    it("finalizes once every milestone has expired", async () => {
      await addMilestone({ tranche: USDC(60), deadlineIn: 60 });
      await advanceTime(60 + GRACE_PERIOD + 60);

      await escrow.finalizeCampaign();
      assert.equal(await escrow.withdrawable(brand.address), USDC(100)); // failed tranche + remainder
      assert.equal(await escrow.isFinalized(), true);
    });

    it("finalizes once every milestone is resolved", async () => {
      await liveMilestone();
      await mockOracle.submitMetric(escrowAddress, 0, 75_000);

      await escrow.finalizeCampaign();
      assert.equal(await escrow.isFinalized(), true);
    });

    it("finalizes a campaign that has no milestones", async () => {
      await escrow.finalizeCampaign();
      assert.equal(await escrow.isFinalized(), true);
    });
  });

  // ─────────────────────────────────────────────
  // Funding Guarantees
  // ─────────────────────────────────────────────

  describe("Funding Guarantees", async () => {
    beforeEach(deployAll);

    it("refuses to bind a creator to an unfunded campaign", async () => {
      await assert.rejects(
        escrow.connect(brand).assignCreator(creator.address),
        /campaign not funded/
      );
    });

    it("emits CampaignFunded on deposit", async () => {
      const tx = await escrow.connect(brand).deposit(USDC(100));
      const event = findEvent(await tx.wait(), "CampaignFunded");
      assert.ok(event, "CampaignFunded event not emitted");
      assert.equal(event.args.amount, USDC(100));
    });

    it("caps the number of milestones an escrow will accept", async () => {
      await escrow.connect(brand).deposit(USDC(1000));
      const deadline = await futureDeadline();

      // MAX_MILESTONES is 20 — the 21st must be rejected so the loops in
      // finalizeCampaign and the automation sweep stay bounded.
      for (let i = 0; i < 20; i++) {
        await escrow.addMilestone(PLATFORM, METRIC_TYPE, THRESHOLD, USDC(1), deadline);
      }

      await assert.rejects(
        escrow.addMilestone(PLATFORM, METRIC_TYPE, THRESHOLD, USDC(1), deadline),
        /too many milestones/
      );
    });
  });
});
