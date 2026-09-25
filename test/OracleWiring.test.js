import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// Oracle Wiring Test
// ─────────────────────────────────────────────
// Reproduces exactly what scripts/deployOracle.js does, then drives a campaign
// through it. This is the sequence that was missing entirely before — the
// factory never authorised escrows on the consumer or registered them with the
// handler, so a real deployment would have created campaigns that could never
// be verified. Each wiring call below is load-bearing; dropping any one of them
// fails this test.
// ─────────────────────────────────────────────

describe("Oracle Wiring (deployOracle.js sequence)", async () => {
  let ethers;
  let usdc, reputationToken, mockOracle, factory;
  let router, consumer, handler;
  let owner, brand, creator;

  const USDC = (n) => BigInt(n) * 1_000_000n;
  const IPFS_BRIEF = "bafybeibriefhash";
  const VIDEO_ID = "dQw4w9WgXcQ";

  async function futureDeadline(s = 86400) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + s;
  }

  beforeEach(async () => {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, brand, creator] = await ethers.getSigners();

    // ── What scripts/deploy.js does ──
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    reputationToken = await (
      await ethers.getContractFactory("ReputationToken")
    ).deploy("https://w3s.link/ipfs/");
    mockOracle = await (
      await ethers.getContractFactory("MockMetricsOracle")
    ).deploy();

    factory = await (await ethers.getContractFactory("CampaignFactory")).deploy(
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await mockOracle.getAddress()
    );
    await reputationToken.setCampaignFactory(await factory.getAddress());

    // ── What scripts/deployOracle.js does ──
    router = await (
      await ethers.getContractFactory("MockFunctionsRouter")
    ).deploy();

    consumer = await (await ethers.getContractFactory("MetricsConsumer")).deploy(
      await router.getAddress(),
      1,
      ethers.encodeBytes32String("fun-polygon-amoy-1")
    );

    handler = await (
      await ethers.getContractFactory("AutomationHandler")
    ).deploy(await consumer.getAddress());

    // The four wiring calls
    await consumer.setCampaignFactory(await factory.getAddress());
    await consumer.setAutomationHandler(await handler.getAddress());
    await handler.setCampaignFactory(await factory.getAddress());
    await factory.setAutomationHandler(await handler.getAddress());

    // Repoint the factory from the mock to the real consumer
    await factory.updateProtocolAddresses(
      await usdc.getAddress(),
      await reputationToken.getAddress(),
      await consumer.getAddress()
    );

    // Per-platform DON source
    await consumer.setSourceCode(0, "return 1");

    await usdc.connect(brand).faucet(USDC(1000));
  });

  // Creates, funds and binds a campaign through the factory.
  async function liveCampaign() {
    const tx = await factory.connect(brand).createCampaign(
      IPFS_BRIEF, [0], [0], [50_000], [USDC(100)],
      [await futureDeadline()], [VIDEO_ID]
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment?.name === "CampaignCreated");
    const { campaignId, escrowAddress } = event.args;

    const escrow = await ethers.getContractAt("CampaignEscrow", escrowAddress);
    await usdc.connect(brand).approve(escrowAddress, USDC(100));
    await escrow.connect(brand).deposit(USDC(100));
    await factory.connect(brand).assignCreator(campaignId, creator.address);

    return { escrow, escrowAddress, campaignId };
  }

  it("points new escrows at the real consumer, not the mock", async () => {
    const { escrow } = await liveCampaign();
    assert.equal(await escrow.metricsConsumer(), await consumer.getAddress());
  });

  it("authorises each new escrow on the consumer", async () => {
    const { escrowAddress } = await liveCampaign();
    assert.equal(await consumer.authorisedEscrows(escrowAddress), true);
  });

  it("registers each new campaign with the automation handler", async () => {
    const { campaignId, escrowAddress } = await liveCampaign();

    const sched = await handler.getCampaignSchedule(campaignId);
    assert.equal(sched.escrowAddress, escrowAddress);
    assert.equal(sched.active, true);
  });

  it("still authorises the escrow as a reputation minter", async () => {
    const { escrowAddress } = await liveCampaign();
    assert.equal(await reputationToken.authorisedMinters(escrowAddress), true);
  });

  it("drives a real metric request end to end", async () => {
    const { campaignId, escrowAddress } = await liveCampaign();

    // The upkeep reports it as due, and the sweep reaches the router.
    const [needed, performData] = await handler.checkUpkeep("0x");
    assert.equal(needed, true);

    await handler.performUpkeep(performData);

    assert.equal(await router.requestCount(), 1n);

    // Crucially, the request is filed against the ESCROW — not the handler that
    // placed it. This is the bug that would have silently broken every payout.
    const requestId = await router.lastRequestId();
    const ctx = await consumer.pendingRequests(requestId);
    assert.equal(ctx.escrowAddress, escrowAddress);
    assert.notEqual(ctx.escrowAddress, await handler.getAddress());
  });

  it("pays the creator when the DON returns a passing metric", async () => {
    const { escrow } = await liveCampaign();

    const [, performData] = await handler.checkUpkeep("0x");
    await handler.performUpkeep(performData);
    const requestId = await router.lastRequestId();

    const before = await usdc.balanceOf(creator.address);
    await router.fulfill(
      await consumer.getAddress(),
      requestId,
      ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [75_000]),
      "0x",
      { gasLimit: 1_000_000 }
    );
    const after = await usdc.balanceOf(creator.address);

    assert.equal(after - before, USDC(100));
    assert.equal((await escrow.getMilestone(0)).status, 1n); // MET
    assert.equal(await reputationToken.reputationScore(creator.address), 1n);
  });

  it("forceCheck drives a check without waiting out the interval", async () => {
    const { campaignId } = await liveCampaign();

    await handler.forceCheck(campaignId);
    assert.equal(await router.requestCount(), 1n);
  });
});
