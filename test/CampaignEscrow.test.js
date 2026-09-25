import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const USDC = (amount) => BigInt(amount) * 1_000_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
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

    await reputationToken.authoriseMinter(await escrow.getAddress());
    await usdc.connect(brand).faucet(USDC(1000));
    await usdc.connect(brand).approve(await escrow.getAddress(), USDC(1000));
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

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CreatorAssigned"
      );
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

    it("adds a milestone successfully", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(), CONTENT_ID
      );
      assert.equal(await escrow.getMilestoneCount(), 1n);
    });

    it("reverts if tranche exceeds deposit", async () => {
      await assert.rejects(
        escrow.addMilestone(
          PLATFORM, METRIC_TYPE, THRESHOLD, USDC(200), await futureDeadline(), CONTENT_ID
        ),
        /tranches exceed total deposit/
      );
    });

    it("reverts if deadline is in the past", async () => {
      const block = await ethers.provider.getBlock("latest");
      const pastDeadline = block.timestamp - 100;
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
      await deployFundedAndAssigned();
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(), CONTENT_ID
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

    it("tracks totalReleased", async () => {
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      assert.equal(await escrow.totalReleased(), TRANCHE);
    });

    it("does not release if value is below threshold", async () => {
      const before = await usdc.balanceOf(creator.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 10_000);
      const after = await usdc.balanceOf(creator.address);
      assert.equal(after, before);
    });

    it("reverts if the same milestone is resolved twice", async () => {
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      await assert.rejects(
        mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000),
        /milestone already resolved/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Metric Without A Creator
  // ─────────────────────────────────────────────

  describe("Metric Without A Creator", async () => {
    beforeEach(async () => {
      await deployFunded();
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(), CONTENT_ID
      );
    });

    it("rejects a verified metric while the campaign is still open", async () => {
      await assert.rejects(
        mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000),
        /no creator assigned/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Milestone Failed
  // ─────────────────────────────────────────────

  describe("Milestone Failed", async () => {
    beforeEach(() => deployFundedAndAssigned());

    it("refunds tranche to brand when deadline passed and threshold not met", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(60), CONTENT_ID
      );

      await advanceTime(100);

      const before = await usdc.balanceOf(brand.address);
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 1_000);
      const after = await usdc.balanceOf(brand.address);
      assert.equal(after - before, TRANCHE);
    });

    it("marks milestone status as FAILED", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(60), CONTENT_ID
      );

      await advanceTime(100);

      await mockOracle.submitMetric(await escrow.getAddress(), 0, 1_000);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 2n); // 2 = FAILED
    });

    it("does not mint reputation on a failed milestone", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(60), CONTENT_ID
      );

      await advanceTime(100);

      await mockOracle.submitMetric(await escrow.getAddress(), 0, 1_000);
      assert.equal(await reputationToken.reputationScore(creator.address), 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Proof Submission
  // ─────────────────────────────────────────────

  describe("Proof Submission", async () => {
    beforeEach(async () => {
      await deployFundedAndAssigned();
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(), CONTENT_ID
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

    it("reverts on an invalid milestone index", async () => {
      await assert.rejects(
        escrow.connect(creator).submitProof(5, IPFS_PROOF),
        /invalid milestone index/
      );
    });

    it("reverts on an empty proof hash", async () => {
      await assert.rejects(
        escrow.connect(creator).submitProof(0, ""),
        /proof hash required/
      );
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

    it("returns remainder to brand on finalization", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, USDC(60), await futureDeadline(60), CONTENT_ID
      );

      await advanceTime(100);

      const before = await usdc.balanceOf(brand.address);
      await escrow.finalizeCampaign();
      const after = await usdc.balanceOf(brand.address);
      assert.equal(after - before, USDC(100));
    });

    it("reverts if non-brand tries to finalize", async () => {
      await assert.rejects(
        escrow.connect(other).finalizeCampaign(),
        /not authorized to finalize/
      );
    });

    it("reverts on double finalization", async () => {
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
      await deployFundedAndAssigned();
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(), CONTENT_ID
      );
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
          PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(), CONTENT_ID
        ),
        /OwnableUnauthorizedAccount/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Finalization Safety
  // ─────────────────────────────────────────────
  // finalizeCampaign() sweeps the escrow's entire remaining balance to the
  // brand. Doing that while a milestone is still live — pending, deadline not
  // yet reached — lets the brand reclaim money the creator is still working to
  // earn, including work already delivered but not yet verified by the oracle.
  // Finalization must only settle campaigns that are genuinely over.

  describe("Finalization Safety", async () => {
    beforeEach(() => deployFundedAndAssigned());

    it("reverts while a milestone is still live", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(86400), CONTENT_ID
      );

      await assert.rejects(
        escrow.connect(brand).finalizeCampaign(),
        /milestone still live/
      );
    });

    it("leaves the funds in escrow when finalization is refused", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(86400), CONTENT_ID
      );

      await assert.rejects(escrow.connect(brand).finalizeCampaign());

      assert.equal(await escrow.getBalance(), USDC(100));
      assert.equal(await escrow.isFinalized(), false);
    });

    it("cannot strand a creator who has met the threshold but not yet been verified", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(86400), CONTENT_ID
      );
      // Creator has delivered; the oracle simply has not reported yet.
      await escrow.connect(creator).submitProof(0, IPFS_PROOF);

      await assert.rejects(
        escrow.connect(brand).finalizeCampaign(),
        /milestone still live/
      );

      // The tranche is still available, so the pending verification can pay out.
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);
      assert.equal(await usdc.balanceOf(creator.address), TRANCHE);
    });

    it("reverts when only some milestones have expired", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, USDC(50), await futureDeadline(60), CONTENT_ID
      );
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, USDC(50), await futureDeadline(86400), CONTENT_ID
      );

      await advanceTime(120); // only the first has expired

      await assert.rejects(
        escrow.connect(brand).finalizeCampaign(),
        /milestone still live/
      );
    });

    it("finalizes once every milestone has expired", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, USDC(60), await futureDeadline(60), CONTENT_ID
      );

      await advanceTime(120);

      const before = await usdc.balanceOf(brand.address);
      await escrow.connect(brand).finalizeCampaign();
      const after = await usdc.balanceOf(brand.address);

      assert.equal(after - before, USDC(100)); // failed tranche + remainder
      assert.equal(await escrow.isFinalized(), true);
    });

    it("finalizes once every milestone is resolved", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(86400), CONTENT_ID
      );
      await mockOracle.submitMetric(await escrow.getAddress(), 0, 75_000);

      await escrow.connect(brand).finalizeCampaign();
      assert.equal(await escrow.isFinalized(), true);
    });

    it("finalizes a campaign that has no milestones", async () => {
      await escrow.connect(brand).finalizeCampaign();
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
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignFunded"
      );
      assert.ok(event, "CampaignFunded event not emitted");
      assert.equal(event.args.amount, USDC(100));
    });

    it("caps the number of milestones an escrow will accept", async () => {
      await escrow.connect(brand).deposit(USDC(1000));
      const deadline = await futureDeadline();

      // MAX_MILESTONES is 20 — the 21st must be rejected so the loops in
      // finalizeCampaign and the automation sweep stay bounded.
      for (let i = 0; i < 20; i++) {
        await escrow.addMilestone(
          PLATFORM, METRIC_TYPE, THRESHOLD, USDC(1), deadline, CONTENT_ID
        );
      }

      await assert.rejects(
        escrow.addMilestone(
          PLATFORM, METRIC_TYPE, THRESHOLD, USDC(1), deadline, CONTENT_ID
        ),
        /too many milestones/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Proof Timing
  // ─────────────────────────────────────────────

  describe("Proof Timing", async () => {
    beforeEach(() => deployFundedAndAssigned());

    it("rejects proof submitted after the milestone deadline", async () => {
      await escrow.addMilestone(
        PLATFORM, METRIC_TYPE, THRESHOLD, TRANCHE, await futureDeadline(60), CONTENT_ID
      );

      await advanceTime(120);

      await assert.rejects(
        escrow.connect(creator).submitProof(0, IPFS_PROOF),
        /milestone deadline passed/
      );
    });
  });
});
