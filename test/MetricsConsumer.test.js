import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// MetricsConsumer Tests
// ─────────────────────────────────────────────
// The bridge between Chainlink Functions and the escrows. Two properties matter
// most and both are covered here:
//
//   1. A result must reach the escrow it was requested for — not the contract
//      that happened to place the request.
//   2. The DON callback must never revert. A revert burns the callback gas,
//      marks the request failed upstream, and loses the paid-for result.
//
// MockFunctionsRouter stands in for the real router.
// ─────────────────────────────────────────────

describe("MetricsConsumer", async () => {
  let ethers;
  let router;
  let consumer;
  let usdc;
  let reputationToken;
  let factory;
  let escrow;
  let escrowAddress;
  let owner;
  let brand;
  let creator;
  let other;

  const PLATFORM_YOUTUBE = 0;
  const METRIC_VIEWS = 0;
  const THRESHOLD = 50_000;
  const TRANCHE = 100_000_000n; // 100 USDC
  const PLATFORM_TWITCH = 1;
  const METRIC_FOLLOWERS = 2;
  const CONTENT_ID = "dQw4w9WgXcQ";
  const CHANNEL_ID = "UCuAXFkgsw1L7xaCfnd5JJOw";
  const TWITCH_LOGIN = "somestreamer";
  const IPFS_PROOF = "bafybeiproof";
  const IPFS_BRIEF = "bafybeibriefhash";
  const SUB_ID = 1;
  const DON_ID = "0x66756e2d706f6cygon0000000000000000000000000000000000000000000000";

  const encodeUint = (value) =>
    ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [value]);

  async function futureDeadline(secondsFromNow = 86400) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + secondsFromNow;
  }

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, brand, creator, other] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("MockFunctionsRouter");
    router = await Router.deploy();

    const MetricsConsumer = await ethers.getContractFactory("MetricsConsumer");
    consumer = await MetricsConsumer.deploy(
      await router.getAddress(),
      SUB_ID,
      ethers.encodeBytes32String("fun-polygon-amoy-1")
    );

    // Chainlink nodes run this; its contents are irrelevant to these tests, but
    // requestMetric refuses to fire without source code for the platform.
    await consumer.setSourceCode(PLATFORM_YOUTUBE, "return 1");

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy("https://w3s.link/ipfs/");

    const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
    factory = await CampaignFactory.deploy(
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await consumer.getAddress()
    );

    await reputationToken.setCampaignFactory(await factory.getAddress());
    await consumer.setCampaignFactory(await factory.getAddress());

    // Requests are normally placed by the AutomationHandler. Standing in for it
    // with `owner` keeps these tests focused on the consumer.
    await consumer.setAutomationHandler(owner.address);

    await usdc.connect(brand).faucet(1000_000_000n);

    // One funded, creator-bound campaign with three pending milestones:
    //   0 — YouTube views, content submitted (the one most tests use)
    //   1 — Twitch followers, content submitted, no Twitch script configured
    //   2 — YouTube views, no content submitted yet
    const deadline = await futureDeadline();
    const tx = await factory.connect(brand).createCampaign(
      IPFS_BRIEF,
      [PLATFORM_YOUTUBE, PLATFORM_TWITCH, PLATFORM_YOUTUBE],
      [METRIC_VIEWS, METRIC_FOLLOWERS, METRIC_VIEWS],
      [THRESHOLD, THRESHOLD, THRESHOLD],
      [TRANCHE, TRANCHE, TRANCHE],
      [deadline, deadline, deadline]
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((log) => log.fragment?.name === "CampaignCreated");
    escrowAddress = event.args.escrowAddress;
    escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);

    await usdc.connect(brand).approve(escrowAddress, 3n * TRANCHE);
    await escrow.connect(brand).deposit(3n * TRANCHE);
    await factory.connect(brand).assignCreator(event.args.campaignId, creator.address);

    await escrow.connect(creator).submitProof(0, CONTENT_ID, CHANNEL_ID, IPFS_PROOF);
    await escrow.connect(creator).submitProof(1, TWITCH_LOGIN, TWITCH_LOGIN, IPFS_PROOF);
  }

  // Chainlink allocates a fixed callbackGasLimit to the callback. Tests must do
  // the same: ethers' gas estimation binary-searches for the cheapest gas that
  // lets the OUTER call succeed, and because fulfillRequest catches inner
  // failures, that search happily settles on a budget where the escrow call runs
  // out of gas and gets swallowed.
  const CALLBACK_GAS = 1_000_000;

  async function fulfill(requestId, response, err = "0x") {
    return router.fulfill(
      await consumer.getAddress(), requestId, response, err, { gasLimit: CALLBACK_GAS }
    );
  }

  // Places a request and returns its id, read back from the emitted event.
  async function requestMetric(milestoneIndex = 0) {
    const tx = await consumer.requestMetric(escrowAddress, milestoneIndex);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "MetricRequested"
    );
    return event.args.requestId;
  }

  // ─────────────────────────────────────────────
  // Wiring
  // ─────────────────────────────────────────────

  describe("Wiring", async () => {
    beforeEach(deployAll);

    it("is authorised for every escrow the factory deploys", async () => {
      assert.equal(await consumer.authorisedEscrows(escrowAddress), true);
    });

    it("rejects a request for an unauthorised escrow", async () => {
      await assert.rejects(
        consumer.requestMetric(other.address, 0),
        /escrow not authorised/
      );
    });

    it("rejects a request from an unauthorised caller", async () => {
      await assert.rejects(
        consumer.connect(other).requestMetric(escrowAddress, 0),
        /not an authorised escrow or automation handler/
      );
    });

    it("rejects a platform with no source code configured", async () => {
      await assert.rejects(
        consumer.requestMetric(escrowAddress, 1 /* Twitch milestone */),
        /source code not set for platform/
      );
    });

    it("rejects a request before the creator has submitted content", async () => {
      await assert.rejects(
        consumer.requestMetric(escrowAddress, 2),
        /no content submitted/
      );
    });

    it("rejects a request for a milestone that is already resolved", async () => {
      const requestId = await requestMetric();
      await fulfill(requestId, encodeUint(75_000), "0x");
      await assert.rejects(
        consumer.requestMetric(escrowAddress, 0),
        /milestone not pending/
      );
    });
  });

  // ─────────────────────────────────────────────
  // Request Routing
  // ─────────────────────────────────────────────

  describe("Request Routing", async () => {
    beforeEach(deployAll);

    it("records the target escrow, not the caller", async () => {
      const requestId = await requestMetric();

      const ctx = await consumer.pendingRequests(requestId);
      assert.equal(ctx.escrowAddress, escrowAddress);
      assert.notEqual(ctx.escrowAddress, owner.address);
      assert.equal(ctx.milestoneIndex, 0n);
      assert.equal(ctx.fulfilled, false);
    });

    // Regression: only the content ID used to be sent, so every script fell
    // back to a default metric and a followers milestone was judged on views.
    it("sends the milestone's metric, channel and creator to the DON", async () => {
      await consumer.setSourceCode(PLATFORM_TWITCH, "return 1");
      await requestMetric(1);

      const payload = (await router.lastRequestData()).toLowerCase();
      const hex = (text) => ethers.hexlify(ethers.toUtf8Bytes(text)).slice(2);

      assert.ok(payload.includes(hex(TWITCH_LOGIN)), "content ID missing");
      assert.ok(payload.includes(hex("FOLLOWERS")), "metric type missing");
      assert.ok(!payload.includes(hex("VIEWS")), "wrong metric type sent");
      assert.ok(payload.includes(hex(creator.address.toLowerCase())), "creator missing");
    });

    it("sends the creator's own channel for ownership checks", async () => {
      await requestMetric(0);
      const payload = (await router.lastRequestData()).toLowerCase();
      const hex = (text) => ethers.hexlify(ethers.toUtf8Bytes(text)).slice(2);
      assert.ok(payload.includes(hex(CHANNEL_ID).toLowerCase()), "channel ID missing");
    });
  });

  // ─────────────────────────────────────────────
  // Fulfillment
  // ─────────────────────────────────────────────

  describe("Fulfillment", async () => {
    beforeEach(deployAll);

    it("delivers the metric and credits the tranche", async () => {
      const requestId = await requestMetric();

      await fulfill(requestId, encodeUint(75_000), "0x");

      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);

      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 1n); // MET

      const ctx = await consumer.pendingRequests(requestId);
      assert.equal(ctx.fulfilled, true);
    });

    it("leaves the milestone pending when below threshold", async () => {
      const requestId = await requestMetric();

      await fulfill(requestId, encodeUint(10_000), "0x");

      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 0n); // PENDING
      assert.equal(await escrow.withdrawable(creator.address), 0n);
    });

    it("reports a DON-side error without touching the escrow", async () => {
      const requestId = await requestMetric();

      const tx = await fulfill(requestId, "0x", "0x6f6f7073"); // "oops"
      const receipt = await tx.wait();

      // The failure is surfaced, and the milestone is untouched.
      assert.ok(receipt.logs.length > 0);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 0n); // PENDING
      assert.equal(await escrow.withdrawable(creator.address), 0n);
    });
  });

  // ─────────────────────────────────────────────
  // The Callback Must Never Revert
  // ─────────────────────────────────────────────

  describe("Callback Resilience", async () => {
    beforeEach(deployAll);

    it("does not revert when the escrow rejects the metric", async () => {
      // Two requests in flight for the same milestone. The first resolves it,
      // so the escrow refuses the second with "milestone already resolved".
      const first = await requestMetric();
      const second = await requestMetric();
      await fulfill(first, encodeUint(75_000), "0x");

      // Must complete rather than revert.
      await fulfill(second, encodeUint(90_000), "0x");

      const ctx = await consumer.pendingRequests(second);
      assert.equal(ctx.fulfilled, true);
      // The creator was credited exactly once.
      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);
    });

    it("does not revert on a malformed response", async () => {
      const requestId = await requestMetric();

      // Not a 32-byte uint256 — abi.decode would throw.
      await fulfill(requestId, "0xdeadbeef", "0x");

      const ctx = await consumer.pendingRequests(requestId);
      assert.equal(ctx.fulfilled, true);
      const milestone = await escrow.getMilestone(0);
      assert.equal(milestone.status, 0n); // untouched
    });

    it("does not revert on an unknown request id", async () => {
      await fulfill(ethers.encodeBytes32String("never-sent"), encodeUint(75_000), "0x");
      assert.equal(await escrow.withdrawable(creator.address), 0n);
    });

    it("does not revert on a duplicate fulfillment", async () => {
      const requestId = await requestMetric();
      await fulfill(requestId, encodeUint(75_000), "0x");

      // Replaying the same result must be a no-op, not a revert.
      await fulfill(requestId, encodeUint(75_000), "0x");

      assert.equal(await escrow.withdrawable(creator.address), TRANCHE);
    });

    it("rejects fulfillment from anyone but the router", async () => {
      const requestId = await requestMetric();
      await assert.rejects(
        consumer.connect(other).handleOracleFulfillment(
          requestId, encodeUint(75_000), "0x"
        )
      );
    });
  });
});
