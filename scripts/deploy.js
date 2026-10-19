import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const [deployer] = await ethers.getSigners();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Influencity — Deploying to ${connection.networkName}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  // Gas on Polygon is paid in POL, not ETH — formatEther is just the
  // 18-decimal formatter and is still correct for the amount.
  console.log(`  Balance:  ${ethers.formatEther(balance)} POL`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Mainnet guard ──
  // This script deploys MockUSDC and a mock oracle, both of which carry
  // "NEVER deploy this to mainnet" in their source. Polygon mainnet is
  // configured in hardhat.config.js so that verification and future scripts
  // can target it — not so that this script can. Going to mainnet means
  // pointing at real USDC and a real MetricsConsumer first.
  if (connection.networkName === "polygon") {
    throw new Error(
      "Refusing to run: this script deploys MockUSDC and MockMetricsOracle, " +
        "which must never reach mainnet. Write a mainnet deploy script that " +
        "uses real USDC and a real Chainlink MetricsConsumer instead."
    );
  }

  // Every protocol event comes after this block, so the backend indexer can
  // start its scan here instead of at genesis.
  const indexerStartBlock = await ethers.provider.getBlockNumber();

  // Optionally reuse already-deployed mocks. MockUSDC and MockMetricsOracle
  // rarely change, and redeploying them costs ~1.2M gas for nothing:
  //   REUSE_USDC_ADDRESS=0x...  REUSE_ORACLE_ADDRESS=0x...
  async function existing(name, address) {
    if (!address) return null;
    if ((await ethers.provider.getCode(address)) === "0x") {
      throw new Error(`${name} at ${address} has no code on this network`);
    }
    return ethers.getContractAt(name, address);
  }

  // ── 1. Deploy MockUSDC ──
  let mockUSDC = await existing("MockUSDC", process.env.REUSE_USDC_ADDRESS);
  if (mockUSDC) {
    console.log("1. Reusing MockUSDC");
  } else {
    console.log("1. Deploying MockUSDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
  }
  const usdcAddress = await mockUSDC.getAddress();
  console.log(`   ✓ MockUSDC → ${usdcAddress}\n`);

  // ── 2. Deploy ReputationToken ──
  console.log("2. Deploying ReputationToken...");
  const ReputationToken = await ethers.getContractFactory("ReputationToken");
  const reputationToken = await ReputationToken.deploy("https://gateway.pinata.cloud/ipfs/");
  await reputationToken.waitForDeployment();
  const reputationTokenAddress = await reputationToken.getAddress();
  console.log(`   ✓ ReputationToken → ${reputationTokenAddress}\n`);

  // ── 3. Deploy MockMetricsOracle ──
  let mockMetricsOracle = await existing("MockMetricsOracle", process.env.REUSE_ORACLE_ADDRESS);
  if (mockMetricsOracle) {
    console.log("3. Reusing MockMetricsOracle");
  } else {
    console.log("3. Deploying MockMetricsOracle...");
    const MockMetricsOracle = await ethers.getContractFactory("MockMetricsOracle");
    mockMetricsOracle = await MockMetricsOracle.deploy();
    await mockMetricsOracle.waitForDeployment();
  }
  const mockMetricsOracleAddress = await mockMetricsOracle.getAddress();
  console.log(`   ✓ MockMetricsOracle → ${mockMetricsOracleAddress}\n`);

  // ── 4. Deploy CampaignFactory ──
  console.log("4. Deploying CampaignFactory...");
  const CampaignFactory = await ethers.getContractFactory("CampaignFactory");
  const campaignFactory = await CampaignFactory.deploy(
    usdcAddress,
    reputationTokenAddress,
    mockMetricsOracleAddress
  );
  await campaignFactory.waitForDeployment();
  const campaignFactoryAddress = await campaignFactory.getAddress();
  console.log(`   ✓ CampaignFactory → ${campaignFactoryAddress}\n`);

  // ── 5. Register CampaignFactory on ReputationToken ──
  // The factory auto-authorises each escrow it deploys as a reputation minter,
  // so it must be registered as the factory on the ReputationToken first.
  console.log("5. Registering CampaignFactory on ReputationToken...");
  const factoryTx = await reputationToken.setCampaignFactory(
    campaignFactoryAddress
  );
  await factoryTx.wait();
  console.log("   ✓ Registered\n");

  // ── 6. Mint test USDC to deployer ──
  if (!process.env.REUSE_USDC_ADDRESS) {
    console.log("6. Minting 10,000 test USDC to deployer...");
    const mintTx = await mockUSDC.faucet(ethers.parseUnits("10000", 6));
    await mintTx.wait();
    console.log("   ✓ Minted 10,000 USDC\n");
  }

  // ── Save addresses ──
  const addresses = {
    network: connection.networkName,
    deployer: deployer.address,
    mockUSDC: usdcAddress,
    reputationToken: reputationTokenAddress,
    mockMetricsOracle: mockMetricsOracleAddress,
    campaignFactory: campaignFactoryAddress,
    indexerStartBlock,
    deployedAt: new Date().toISOString(),
  };

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deployment complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(JSON.stringify(addresses, null, 2));

  fs.writeFileSync(
    path.resolve("deployments.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("\n  Saved to deployments.json");

  console.log("\n  Add to root .env:");
  console.log(`  CAMPAIGN_FACTORY_ADDRESS=${campaignFactoryAddress}`);
  console.log(`  REPUTATION_TOKEN_ADDRESS=${reputationTokenAddress}`);
  console.log(`  USDC_ADDRESS=${usdcAddress}`);
  console.log(`  MOCK_METRICS_ORACLE_ADDRESS=${mockMetricsOracleAddress}`);
  console.log(`  INDEXER_START_BLOCK=${indexerStartBlock}`);
  console.log("\n  Add to client/.env.local:");
  console.log(`  VITE_CAMPAIGN_FACTORY_ADDRESS=${campaignFactoryAddress}`);
  console.log(`  VITE_REPUTATION_TOKEN_ADDRESS=${reputationTokenAddress}`);
  console.log(`  VITE_USDC_ADDRESS=${usdcAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});