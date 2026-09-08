import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const POLYGON_MAINNET_RPC_URL =
  process.env.POLYGON_MAINNET_RPC_URL || "https://polygon-rpc.com";

// Etherscan V2 uses one multichain API key across all supported networks,
// Polygon included. Standalone Polygonscan V1 keys are deprecated — get a key
// from etherscan.io, not polygonscan.com.
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

export default {
  plugins: [hardhatEthers, hardhatVerify, hardhatNodeTestRunner],

  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Polygon PoS enabled the Cancun EIPs in the Ahmedabad hardfork, so this
      // is supported on both Amoy and mainnet. Nothing in these contracts
      // actually needs Cancun opcodes (plain ReentrancyGuard, not the
      // transient-storage variant), so drop to "shanghai" if a deploy ever
      // reverts with an invalid-opcode error on an older node.
      evmVersion: "cancun",
    },
  },

  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
    polygonAmoy: {
      type: "http",
      url: POLYGON_AMOY_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 80002,
    },
    polygon: {
      type: "http",
      url: POLYGON_MAINNET_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 137,
    },
  },

  // hardhat-verify v3 has built-in support for polygon and polygonAmoy via the
  // Etherscan V2 API, so no customChains block is needed.
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },

  paths: {
    sources: "./contracts",
    tests: {
      nodejs: "./test",
    },
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
