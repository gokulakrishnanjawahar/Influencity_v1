// ─────────────────────────────────────────────
// Deploy + wire the Chainlink oracle layer
// ─────────────────────────────────────────────
// Run AFTER scripts/deploy.js, which deploys the core contracts with
// MockMetricsOracle standing in for the real consumer:
//
//   npx hardhat run scripts/deployOracle.js --network polygonAmoy
//
// This deploys MetricsConsumer + AutomationHandler, performs the four wiring
// calls they need, uploads the per-platform JS the DON executes, and repoints
// the factory at the real consumer.
//
// Prerequisites that cannot be automated:
//   • A Chainlink Functions subscription (functions.chain.link), funded with
//     LINK, with the deployed MetricsConsumer added as a consumer AFTERWARDS.
//   • DON-hosted secrets holding the platform API keys.
//   • An Automation upkeep (automation.chain.link) registered against the
//     deployed AutomationHandler — then call setForwarder with its forwarder.
// ─────────────────────────────────────────────

import hre from "hardhat";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Platform enum (MilestoneLib.Platform) → the DON script for it
const PLATFORM_SOURCES = [
  { id: 0, name: "YOUTUBE", file: "fetchYouTubeMetrics.js" },
  { id: 1, name: "TWITCH", file: "fetchTwitchMetrics.js" },
  { id: 2, name: "LINKEDIN", file: "fetchLinkedInMetrics.js" },
];

function required(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in .env — ${hint}`);
  }
  return value;
}

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const [deployer] = await ethers.getSigners();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Influencity — Oracle layer → ${connection.networkName}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Deployer: ${deployer.address}\n`);

  // ── Config ──
  // The router is network-specific and HAS been reissued before. Check it
  // against Chainlink's supported-networks docs rather than trusting a value
  // copied from a tutorial — a wrong router accepts the deploy and then never
  // fulfils anything.
  const router = required(
    "FUNCTIONS_ROUTER_ADDRESS",
    "Functions router for this network (verify at docs.chain.link)"
  );
  const subscriptionId = required(
    "FUNCTIONS_SUBSCRIPTION_ID",
    "subscription ID from functions.chain.link"
  );
  const donIdRaw = required(
    "FUNCTIONS_DON_ID",
    'DON ID for this network, e.g. "fun-polygon-amoy-1"'
  );
  const donId = donIdRaw.startsWith("0x")
    ? donIdRaw
    : ethers.encodeBytes32String(donIdRaw);

  // ── Existing core deployment ──
  const deploymentsPath = path.resolve("deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  if (!deployments.campaignFactory) {
    throw new Error(
      "deployments.json has no campaignFactory — run scripts/deploy.js first."
    );
  }

  const factory = await ethers.getContractAt(
    "CampaignFactory",
    deployments.campaignFactory
  );
  console.log(`  Using CampaignFactory ${deployments.campaignFactory}`);

  const factoryOwner = await factory.owner();
  if (factoryOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Deployer is not the factory owner (${factoryOwner}). ` +
        "The wiring calls below are owner-only."
    );
  }

  // ── 1. MetricsConsumer ──
  console.log("\n1. Deploying MetricsConsumer...");
  const MetricsConsumer = await ethers.getContractFactory("MetricsConsumer");
  const consumer = await MetricsConsumer.deploy(router, subscriptionId, donId);
  await consumer.waitForDeployment();
  const consumerAddress = await consumer.getAddress();
  console.log(`   ✓ MetricsConsumer → ${consumerAddress}`);

  // ── 2. AutomationHandler ──
  console.log("\n2. Deploying AutomationHandler...");
  const AutomationHandler = await ethers.getContractFactory("AutomationHandler");
  const handler = await AutomationHandler.deploy(consumerAddress);
  await handler.waitForDeployment();
  const handlerAddress = await handler.getAddress();
  console.log(`   ✓ AutomationHandler → ${handlerAddress}`);

  // ── 3. Wiring ──
  // Each of these is load-bearing. Miss one and campaigns are created happily
  // but never verified, which looks like the oracle silently doing nothing.
  console.log("\n3. Wiring the oracle layer...");

  await (await consumer.setCampaignFactory(deployments.campaignFactory)).wait();
  console.log("   ✓ consumer.setCampaignFactory  (factory may authorise escrows)");

  await (await consumer.setAutomationHandler(handlerAddress)).wait();
  console.log("   ✓ consumer.setAutomationHandler(handler may request metrics)");

  await (await handler.setCampaignFactory(deployments.campaignFactory)).wait();
  console.log("   ✓ handler.setCampaignFactory   (factory may register campaigns)");

  await (await factory.setAutomationHandler(handlerAddress)).wait();
  console.log("   ✓ factory.setAutomationHandler (new campaigns auto-enrol)");

  // ── 4. Point the factory at the real consumer ──
  // Campaigns created before this keep the mock they were constructed with —
  // the escrow's metricsConsumer is immutable after deployment.
  console.log("\n4. Repointing factory at the real MetricsConsumer...");
  await (
    await factory.updateProtocolAddresses(
      deployments.mockUSDC ?? (await factory.usdc()),
      deployments.reputationToken ?? (await factory.reputationToken()),
      consumerAddress
    )
  ).wait();
  console.log("   ✓ Done — campaigns created from now on use the real oracle");

  // ── 5. Upload the DON source code ──
  console.log("\n5. Uploading per-platform source code...");
  for (const { id, name, file } of PLATFORM_SOURCES) {
    const sourcePath = path.resolve("server/src/chainlink-functions", file);
    if (!fs.existsSync(sourcePath)) {
      console.log(`   ⚠ ${name.padEnd(9)} skipped — ${file} not found`);
      continue;
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    await (await consumer.setSourceCode(id, source)).wait();
    console.log(`   ✓ ${name.padEnd(9)} ${source.length} bytes`);
  }

  // ── 6. Raise the callback budget if the default was lowered ──
  const gasLimit = await consumer.callbackGasLimit();
  console.log(`\n6. callbackGasLimit = ${gasLimit}`);
  if (gasLimit < 500_000n) {
    console.log("   ⚠ Below 500k. A milestone-met callback measures ~311k gas;");
    console.log("     raise it with updateCallbackGasLimit(500000).");
  }

  // ── Save ──
  const updated = {
    ...deployments,
    metricsConsumer: consumerAddress,
    automationHandler: handlerAddress,
    functionsRouter: router,
    functionsSubscriptionId: subscriptionId,
    oracleDeployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(updated, null, 2));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Oracle layer deployed — saved to deployments.json");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n  Add to root .env:");
  console.log(`  METRICS_CONSUMER_ADDRESS=${consumerAddress}`);
  console.log(`  AUTOMATION_HANDLER_ADDRESS=${handlerAddress}`);

  console.log("\n  Remaining manual steps:");
  console.log("  1. functions.chain.link → add this consumer to your");
  console.log(`     subscription (${subscriptionId}) and fund it with LINK.`);
  console.log("  2. Upload DON-hosted secrets with the platform API keys.");
  console.log("  3. automation.chain.link → register a Custom Logic upkeep");
  console.log(`     against ${handlerAddress}, fund it with LINK.`);
  console.log("  4. Copy the upkeep's forwarder address, then call");
  console.log("     handler.setForwarder(<forwarder>) to lock performUpkeep down.");
  console.log("\n  For a live demo, handler.forceCheck(campaignId) runs a check");
  console.log("  immediately instead of waiting out the 24h interval.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
