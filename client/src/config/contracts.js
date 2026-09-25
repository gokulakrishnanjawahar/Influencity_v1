// ─────────────────────────────────────────────
// Contract Config
// ─────────────────────────────────────────────
// ABIs and addresses for all deployed contracts.
// Addresses are updated after each deployment.
// ─────────────────────────────────────────────

// ── Contract Addresses ──
export const CONTRACT_ADDRESSES = {
  campaignFactory: import.meta.env.VITE_CAMPAIGN_FACTORY_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
  reputationToken: import.meta.env.VITE_REPUTATION_TOKEN_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
};

// ── CampaignFactory ABI ──
export const CAMPAIGN_FACTORY_ABI = [
  {
    name: "createCampaign",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_ipfsBriefHash", type: "string" },
      { name: "_platforms", type: "uint8[]" },
      { name: "_metricTypes", type: "uint8[]" },
      { name: "_thresholds", type: "uint256[]" },
      { name: "_trancheAmounts", type: "uint256[]" },
      { name: "_deadlines", type: "uint256[]" },
      { name: "_contentIds", type: "string[]" },
    ],
    outputs: [
      { name: "campaignId", type: "uint256" },
      { name: "escrowAddress", type: "address" },
    ],
  },
  {
    name: "getEscrowAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_campaignId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getBrandCampaigns",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_brand", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getCreatorCampaigns",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_creator", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "campaignCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "CampaignCreated",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "escrowAddress", type: "address", indexed: true },
      { name: "brand", type: "address", indexed: true },
      { name: "ipfsBriefHash", type: "string", indexed: false },
    ],
  },
  {
    name: "assignCreator",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_campaignId", type: "uint256" },
      { name: "_creator", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "CreatorAssigned",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
  },
];

// ── CampaignEscrow ABI ──
export const CAMPAIGN_ESCROW_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "submitProof",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "milestoneIndex", type: "uint256" },
      { name: "_ipfsProofHash", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "finalizeCampaign",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "getMilestones",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "platform", type: "uint8" },
          { name: "metricType", type: "uint8" },
          { name: "threshold", type: "uint256" },
          { name: "trancheAmount", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "contentId", type: "string" },
          { name: "ipfsProofHash", type: "string" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    name: "getMilestone",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "platform", type: "uint8" },
          { name: "metricType", type: "uint8" },
          { name: "threshold", type: "uint256" },
          { name: "trancheAmount", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "contentId", type: "string" },
          { name: "ipfsProofHash", type: "string" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    name: "getMilestoneCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "brand",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "creator",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "totalDeposit",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalReleased",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isFinalized",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "ipfsBriefHash",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "campaignId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MilestoneMet",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: true },
      { name: "verifiedValue", type: "uint256", indexed: false },
      { name: "trancheReleased", type: "uint256", indexed: false },
    ],
  },
  {
    name: "MilestoneFailed",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: true },
      { name: "trancheRefunded", type: "uint256", indexed: false },
    ],
  },
  {
    name: "CampaignFinalized",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "remainderRefunded", type: "uint256", indexed: false },
    ],
  },
  {
    name: "cancelCampaign",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "isCancelled",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "CreatorAssigned",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
  },
  {
    name: "CampaignCancelled",
    type: "event",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "refundedToBrand", type: "uint256", indexed: false },
    ],
  },
];

// ── ReputationToken ABI ──
export const REPUTATION_TOKEN_ABI = [
  {
    name: "reputationScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getMintHistory",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "campaignId", type: "uint256" },
          { name: "milestoneIndex", type: "uint256" },
          { name: "tokenId", type: "uint256" },
          { name: "mintedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    // MockUSDC only — a permissionless mint so any test wallet can fund itself.
    // Absent from real USDC, which is why TestnetFaucet is testnet-gated.
    name: "faucet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "uri",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
];

// ── USDC Address ──
// No fallback on purpose. A hardcoded default here is a chain-specific
// address: if the env var is missing, the app would quietly send approvals to
// whatever happens to sit at that address on the active chain. Failing loudly
// at startup is far safer than a silent wrong-token approval.
//
// Polygon Amoy   → the MockUSDC deployed by scripts/deploy.js
// Polygon mainnet → native USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
//                   (bridged USDC.e is 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
// Both are 6-decimal, matching USDC_DECIMALS in lib/constants.js.
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;

if (!USDC_ADDRESS) {
  console.error(
    "[config] VITE_USDC_ADDRESS is not set — deposits will fail. " +
      "Set it in client/.env.local to the USDC address for your target chain."
  );
}

// ── USDC ABI (minimal — just what we need) ──
export const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
];