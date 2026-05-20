# Influencity v1 — Project Reference (ccvs.md)

> Internal reference notes for Claude Code. Reflects the **open-marketplace
> rework** completed 2026-05-20.

## What it is

Web3 influencer-marketing **escrow + marketplace** on **Base**. Brands post
public campaign listings funded in USDC. Creators browse, apply with a pitch
and social links. The brand picks one applicant — at that moment the agreement
is formed on-chain. From there, oracle-verified milestones release USDC
tranches to the creator and mint soulbound reputation NFTs. Brands can
withdraw an open listing before picking a creator and get the USDC back.

## Tech stack

| Layer        | Tech |
|--------------|------|
| Contracts    | Solidity 0.8.24, Hardhat 3, OpenZeppelin 5, Chainlink |
| Network      | Base Sepolia (chainId 84532) for now |
| Backend      | Express 5 (ESM), Supabase (Postgres), Pinata (IPFS) |
| Frontend     | React 19 + Vite 8, wagmi 2 + RainbowKit + viem, TanStack Query, react-router 7, Tailwind 4 + shadcn/ui |
| Auth         | SIWE (Sign-In With Ethereum) |
| Hosting      | Vercel (client + server) |

## Repo layout

```
Influencity_v1/
├── contracts/
│   ├── core/        CampaignFactory, CampaignEscrow, ReputationToken
│   ├── oracle/      MetricsConsumer, AutomationHandler
│   ├── libraries/   MilestoneLib
│   ├── interfaces/  IReputationToken, ICampaignEscrow
│   └── mocks/       MockUSDC, MockMetricsOracle
├── scripts/         deploy.js, verify.js, seedTestData.js
├── server/src/      Express API (loadEnv first, then routes)
├── client/src/      React app — pages, hooks, components
├── supabase/migrations/  001_initial_schema.sql, 002_open_campaigns.sql
└── hardhat.config.js
```

## Smart contracts (current behaviour)

- **CampaignEscrow** — one per campaign. Holds USDC. `creator` is *unset*
  at construction (open listing). Brand calls `deposit()` to lock funds.
  - `assignCreator(creator)` (onlyOwner = factory) — binds the chosen
    creator and forms the agreement. One-shot.
  - `cancelCampaign()` (onlyBrand, only while creator unset) — refunds the
    full balance to the brand and finalises.
  - `submitProof`, `receiveVerifiedMetric`, `finalizeCampaign` unchanged.
- **CampaignFactory** — `createCampaign` no longer takes `_creator`. After
  deploying a new escrow it **authorises that escrow on ReputationToken**
  (fix for the old wiring bug). Adds `assignCreator(campaignId, creator)`
  which verifies the caller is the brand and updates `creatorCampaigns`.
- **ReputationToken** — adds `campaignFactory` + `setCampaignFactory`. The
  `authoriseMinter` function is now callable by owner OR the factory, so
  the factory can authorise each new escrow inside `createCampaign`.
- **MetricsConsumer** — adds `automationHandler` + `setAutomationHandler`,
  and `requestMetric` now accepts authorised escrows OR the handler.
- **ICampaignEscrow** — populated as a real interface.
- **MockUSDC**, **MockMetricsOracle** unchanged.

## Database (current)

Tables: `users`, `campaigns`, `milestones`, `reputation_events`,
`content_proofs`, `campaign_applications`.

Migration `002_open_campaigns.sql` adds `campaign_applications`, makes
`campaigns.creator_address` nullable, adds `open` to the status enum, and
defaults new campaigns to `open`.

**Manual step:** migration 002 must be applied in the Supabase SQL editor
before the new flow works end-to-end.

## Backend API

`server/src/index.js` mounts `/campaigns`, `/creators`, `/webhooks`. dotenv
is preloaded via `server/src/loadEnv.js` (first import) — resolves
`<repo>/.env` by absolute path so `npm run dev` from `server/` now works.

- `/campaigns`
  - `POST /` (auth, brand) — upload brief + return contract params
  - `POST /confirm` (auth, brand) — persist campaign + milestones after on-chain confirm
  - `GET /` — campaigns for a wallet
  - `GET /open` — marketplace
  - `GET /:id` — campaign + milestones + content_proofs
  - `POST /:id/proof` (auth, creator) — submit content proof
  - `POST /:id/apply` (auth, creator) — apply with pitch + social_links
  - `GET /:id/applications` — list applicants
  - `POST /:id/select` (auth, brand) — record creator selection after on-chain assignCreator
  - `POST /:id/cancel` (auth, brand) — record cancellation after on-chain cancelCampaign
- `/creators`
  - `GET /:address` — profile (DB + on-chain reputation)
  - `GET /:address/campaigns` — creator's campaigns
  - `GET /:address/reputation` — on-chain history
  - `GET /:address/applications` — applications submitted by the creator
- `/webhooks` — `/onchain`, `/alchemy` event sync (event tokenId now matches
  the Solidity `keccak256(campaignId, milestoneIndex)`)

## Frontend

Routes (`App.jsx`): `/`, `/dashboard`, `/campaigns/browse`, `/campaigns/new`,
`/campaigns/:id`, `/profile/:address`, `*`.

- **RoleGuard** (`client/src/components/wallet/RoleGuard.jsx`) — wraps
  role-restricted pages, prompts for role choice on first use, persists in
  `localStorage["influencity_role"]`. CreateCampaign is brand-gated;
  Browse is creator-gated. Dashboard stays open (toggle).
- **Navbar** — "For Brands" → `/campaigns/new`, "For Creators" →
  `/campaigns/browse` (real routes now, no more anchor-only links).
- **Browse** (`pages/Browse.jsx`) — open campaigns marketplace.
- **CreateCampaign** — wizard with no creator field; deploy step does
  brief upload → factory.createCampaign → USDC approve → escrow.deposit →
  `/confirm`. Five progress steps.
- **CampaignDetail** — adds **ApplyPanel** (creators, open campaigns),
  **ApplicantsPanel** (brands), **WithdrawPanel** (brand on open campaigns).
  Parties section shows "Not assigned yet" for open campaigns.
- **Dashboard** — creator view now also lists pending/rejected applications.
- Hooks added in `useCampaign.js`: `useOpenCampaigns`,
  `useCampaignApplications`, `useApplyToCampaign`, `useSelectCreator`,
  `useCancelCampaign`, `useMyApplications`. `useCreateCampaign` rewritten
  for the full create flow (uses `usePublicClient` + `parseEventLogs`).

## Current Base Sepolia addresses (2026-05-20)

```
CampaignFactory     0xCCEb4912F5D9D073bFA5a2BEACA79dF1C0828E0b
ReputationToken     0xf301Bf10fE6c36191a14c81A0b4d026e7C60E009
MockUSDC            0xD04F827e4C76b5973b79ab933BddF4BE587c649c
MockMetricsOracle   0xd091C01b1fe3321CA6B3124BE6221F67bB6662b2
Deployer            0x396b1c651786F2aEFecc58668b2A33BCe816Be61
```

Both root `.env` and `client/.env.local` already point at these.

## Working agreement

Make no changes to project files without an explicit request. Explain shell
commands before/when running them. This file is the only one Claude Code may
freely update for its own reference.
