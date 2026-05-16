import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const [deployer] = await ethers.getSigners();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Influencity — Deploying to Base Sepolia");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── 1. Deploy MockUSDC ──
  console.log("1. Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
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
  console.log("3. Deploying MockMetricsOracle...");
  const MockMetricsOracle = await ethers.getContractFactory("MockMetricsOracle");
  const mockMetricsOracle = await MockMetricsOracle.deploy();
  await mockMetricsOracle.waitForDeployment();
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

  // ── 5. Authorize CampaignFactory as minter ──
  console.log("5. Authorizing CampaignFactory as minter...");
const authTx = await reputationToken.authoriseMinter(
    campaignFactoryAddress
  );
  await authTx.wait();
  console.log("   ✓ Authorized\n");

  // ── 6. Mint test USDC to deployer ──
  console.log("6. Minting 10,000 test USDC to deployer...");
const mintTx = await mockUSDC.faucet(
    ethers.parseUnits("10000", 6)
  );
  await mintTx.wait();
  console.log("   ✓ Minted 10,000 USDC\n");

  // ── Save addresses ──
  const addresses = {
    network: "baseSepolia",
    deployer: deployer.address,
    mockUSDC: usdcAddress,
    reputationToken: reputationTokenAddress,
    mockMetricsOracle: mockMetricsOracleAddress,
    campaignFactory: campaignFactoryAddress,
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
  console.log("\n  Add to client/.env.local:");
  console.log(`  VITE_CAMPAIGN_FACTORY_ADDRESS=${campaignFactoryAddress}`);
  console.log(`  VITE_REPUTATION_TOKEN_ADDRESS=${reputationTokenAddress}`);
  console.log(`  VITE_USDC_ADDRESS=${usdcAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});