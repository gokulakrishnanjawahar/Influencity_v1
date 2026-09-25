# Influencity v1 — Project Reference (ccvs.md)

> Internal reference notes for Claude Code. Reflects the **oracle scripting +
> demo unblocking** session of 2026-09-21 (second half), which followed the
> contract hardening earlier the same day. The open-marketplace rework landed
> 2026-05-20; the Base→Polygon migration 2026-09-08.
>
> **Start here:** the TO-DO block directly below. Session logs and status
> detail follow it.

# ▶ TO-DO — start here (2026-09-25)

Everything that can be done without a deployment is done. The contracts are
hardened (156 tests green), the server, frontend, database and env are ready.

## 1. Deploy (you can do this NOW)

Wallet `0xc4B0fb7d23e59fD49259F6244F15047A518DDCc5` holds **0.2 POL**, and the
deploy costs **0.173 POL at 25 gwei** — it fits. Do not chase more faucet POL.

```bash
AMOY_GAS_PRICE_GWEI=25 npx hardhat run scripts/deploy.js --network polygonAmoy
```

**The gas flag matters.** Amoy's *suggested* price spikes erratically — 446 gwei
observed against a ~25-30 gwei floor — which would quote the deploy at 3 POL and
fail. `AMOY_GAS_PRICE_GWEI` pins it (added to `hardhat.config.js`); the tx just
takes slightly longer to mine, which costs nothing on a testnet. If it is
rejected as underpriced, retry at 26 or 27.

## 2. Paste the printed addresses

The script prints two blocks. All seven values are currently blank:

- root `.env` → `CAMPAIGN_FACTORY_ADDRESS`, `REPUTATION_TOKEN_ADDRESS`,
  `USDC_ADDRESS`, `MOCK_METRICS_ORACLE_ADDRESS`
- `client/.env.local` → `VITE_CAMPAIGN_FACTORY_ADDRESS`,
  `VITE_REPUTATION_TOKEN_ADDRESS`, `VITE_USDC_ADDRESS`

`VITE_USDC_ADDRESS` has no fallback — the client logs an error without it.

## 3. Fix MetaMask's RPC (if not already done)

MetaMask is still on `rpc-amoy.polygon.technology`, which is **dead** — that is
why it shows no balance and why two days went into re-claiming POL that had
already arrived. Edit the Amoy network → RPC URL →
`https://polygon-amoy-bor-rpc.publicnode.com`

## 4. Smoke test

```bash
cd server && npm run dev     # :3001
cd client && npm run dev     # :5173
```

Connect wallet → **Get test USDC** button in the Dashboard header → create
campaign → apply from a second wallet → select → submit proof →
`MockMetricsOracle.submitMetric(escrow, 0, 75000)` → confirm USDC lands and the
reputation NFT mints.

## 5. Verify on PolygonScan (optional, good for a portfolio)

Needs an Etherscan **V2** key from etherscan.io (Polygonscan V1 keys are dead).

```bash
npx hardhat run scripts/verify.js --network polygonAmoy
```

## Later — not blocking

- **Badge NFTs will not render in wallets.** Nothing calls
  `setTokenMetadataURI` and the base URI has no `{id}` template. Needs the
  backend to pin metadata JSON at mint time.
- **Seed a few campaigns** so the marketplace is not empty for visitors.
- **Chainlink go-live:** `npm run deploy:oracle` handles every on-chain step.
  You already hold **25 testnet LINK on Amoy**. Still needed: a Functions
  subscription with the consumer added, DON-hosted secrets for the platform API
  keys, a registered Automation upkeep, then `setForwarder`.
  Note: Chainlink's faucet refuses *native* POL unless you hold 1 real LINK on
  Ethereum mainnet — testnet LINK itself is unrestricted.
- **Hardening pass:** SafeERC20, custom errors, EIP-1167 clones (would cut the
  3.84M gas `CampaignFactory` deploy by ~90%). Hardhat 3.17 and the
  `hre.network.connect()` deprecation.
- **Untested responsively:** `/dashboard` and `/campaigns/new` were only
  measured behind their connect screens. Re-check the recharts panel and the
  4-step wizard at 390px once you can connect a wallet. Routes measured clean
  0-overflow at 320-1440px otherwise.

---

## What it is

Web3 influencer-marketing **escrow + marketplace** on **Polygon**. Brands post
public campaign listings funded in USDC. Creators browse, apply with a pitch
and social links. The brand picks one applicant — at that moment the agreement
is formed on-chain. From there, oracle-verified milestones release USDC
tranches to the creator and mint soulbound reputation NFTs. Brands can
withdraw an open listing before picking a creator and get the USDC back.

## Tech stack

| Layer        | Tech |
|--------------|------|
| Contracts    | Solidity 0.8.24, Hardhat 3, OpenZeppelin 5, Chainlink |
| Network      | Polygon Amoy (chainId 80002) for now; Polygon mainnet (137) configured |
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

## Deployed addresses

**None yet on Polygon.** The Base Sepolia deployment was abandoned in the
`polygon` branch migration (2026-09-08) — those addresses do not exist on
Polygon. `deployments.json` is reset to nulls until a deploy is run:

```
npx hardhat run scripts/deploy.js --network polygonAmoy
```

Then copy the printed addresses into root `.env` and `client/.env.local`
(templates: `.env.example`, `client/.env.example`).

## Polygon migration notes (branch `polygon`, 2026-09-08)

- Env vars renamed: `BASE_SEPOLIA_RPC_URL`/`BASE_MAINNET_RPC_URL` →
  `POLYGON_AMOY_RPC_URL`/`POLYGON_MAINNET_RPC_URL`; `BASESCAN_API_KEY` →
  `ETHERSCAN_API_KEY` (Etherscan V2 is one multichain key — Polygonscan V1
  keys are deprecated). The backend now reads its own `RPC_URL` and **throws**
  if unset instead of silently defaulting to a public Base endpoint.
- `client/src/config/wagmi.js` is now the single source of chain truth:
  `EXPECTED_CHAIN_ID` (override with `VITE_CHAIN_ID`), explorer URL/name
  helpers, and `TX_CONFIRMATIONS`. Explorer links are derived from the chain
  definition rather than hardcoded, so no `basescan.org` strings remain.
- **NetworkGuard** (`components/wallet/NetworkGuard.jsx`) blocks the UI when
  the wallet is on the wrong chain. Mounted inside `WalletGuard`, so every
  wallet-gated page inherits it. Needed because an EVM call to an address with
  no code *succeeds* — on the wrong network a deploy burns gas and reports
  success, then fails on the missing event.
- `waitForTransactionReceipt` now waits `TX_CONFIRMATIONS` (3) on all five
  write paths. Polygon PoS reorgs where Base's single sequencer did not, and
  each write is followed by a Supabase persist.
- **Oracle layer:** the *wiring* now exists (see session log 2026-09-21) —
  `CampaignFactory.createCampaign` authorises each escrow on the consumer and
  registers it with the handler. What is still missing is a **deploy script**:
  `scripts/deploy.js` deploys `MockMetricsOracle`, and nothing deploys
  `MetricsConsumer`/`AutomationHandler`. Going live also needs the Polygon
  router + DON ID, a funded LINK subscription, DON secrets, and
  `setSourceCode` uploads.

---

# Session log — 2026-09-21

## Contract hardening (all fixed, all covered by tests)

The test suite was stale — written against the pre-marketplace API, so
`CampaignEscrow` and `OracleFlow` had **zero** working tests and the money paths
were entirely unverified. Rebuilt the suite first, then audited and fixed.

**Two critical bugs, both in previously untested code:**

1. `finalizeCampaign()` swept the escrow's entire balance to the brand after
   failing only *expired* milestones — so a brand could let a creator deliver and
   then finalize the moment before the oracle reported, reclaiming the tranche.
   Now a still-live milestone blocks finalization outright.
2. `MetricsConsumer.requestMetric` recorded `escrowAddress: msg.sender`, but the
   only caller is `AutomationHandler` — so every request stored the *handler's*
   address and fulfillment would have called `receiveVerifiedMetric` on a
   contract without that function. **The automated payout path could never have
   worked.** The escrow is now an explicit parameter, validated as authorised.

**Also fixed:**

- `callbackGasLimit` 300k → 500k. A milestone-met fulfillment *measures* 310,702
  gas, so a successful verification would have run out of gas mid-callback.
- `fulfillRequest` never reverts: try/catch around the escrow call plus guards
  for malformed responses, unknown request ids, duplicates. A revert there burns
  callback gas and loses the paid-for result.
- `_triggerMetricChecks` wraps each request — one bad milestone no longer aborts
  the whole sweep.
- Finalised campaigns retire themselves from the sweep; `campaignIds` now
  shrinks via swap-and-pop instead of growing forever.
- `performUpkeep` gated on the Chainlink **forwarder** (permissionless until
  `setForwarder` is called after upkeep registration).
- `CampaignFactory` wires each new escrow into the oracle layer
  (`authoriseEscrow` + `registerCampaign`); `MockMetricsOracle` gained a no-op
  `authoriseEscrow` so the mock path still works.
- `assignCreator` now requires `totalDeposit > 0`. **Ordering change: deposit
  must precede assignCreator.**
- `deposit()` emits `CampaignFunded` (funding was previously invisible to event
  listeners); dead `CampaignInitialised` removed.
- `MAX_MILESTONES = 20`; `submitProof` rejected after deadline.
- `ICampaignEscrow` is now actually used by both oracle contracts instead of
  importing all of `CampaignEscrow`; removed dead `MilestoneLib.isPending` and
  `MetricsConsumer.onlyAuthorisedEscrow`.

**Deliberate non-fix:** `pendingRequests` entries are never deleted — cleaning
them would save gas but costs the replay guard.

## Tests

**146 passing, 0 failing** (was 27 passing / 41 failing).

| Suite | Tests |
|---|---|
| CampaignEscrow | 50 |
| CampaignFactory | 27 |
| ReputationToken | 23 |
| AutomationHandler | 19 |
| OracleFlow | 14 |
| MetricsConsumer | 13 |

New mocks: `MockMetricsConsumer` (can be told to revert), `MockFunctionsRouter`
(drives the DON callback without a live router).

Gotchas baked into the tests:
- Deadlines derive from the **latest block timestamp**, never `Date.now()` —
  `advanceTime` moves chain time cumulatively and wall-clock deadlines drift
  into the past, making failures order-dependent.
- `beforeEach(helperWithDefaultArg)` breaks: node:test passes a TestContext as
  the first argument. Wrap: `beforeEach(() => helper())`.
- Tests must pass an explicit `gasLimit` when driving `fulfillRequest` — ethers'
  gas estimation settles on a budget where the inner escrow call runs out of gas
  and gets swallowed by the try/catch.

## Deployability fixes

- **ABI export (was the hard blocker).** The server read ABIs from `artifacts/`
  at runtime — gitignored, outside `server/`, and built from a computed path no
  bundler can trace. Added `scripts/exportAbis.js` → generates the committed
  `server/src/abis/index.js`; `blockchain.js` now imports it statically.
  Regenerate with `npm run build:abis`. **Verified the server boots and serves
  /health with `artifacts/` deleted.**
- `.env.example` was missing 7 vars the server actually reads (`SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`, `PINATA_JWT`, `PINATA_GATEWAY`, `WEBHOOK_SECRET`,
  `CLIENT_URL`, `PORT`). Both templates now verified complete against the code.
- Both SQL migrations are now re-runnable (`drop ... if exists` before every
  trigger and policy — Postgres has no `create trigger/policy if not exists`).

## Serverless note

Earlier advice to avoid Vercel for the server was **wrong**. It was based on
`listenToEscrowEvents`, which is defined in `blockchain.js` but **never called**.
The server is pure request/response and sync runs through `/webhooks/*`, which
is serverless-native. Vercel is fine for both client and server. (This only
changes if sync is ever switched to direct chain listening.)

---

# Current status — setup progress

| Item | State |
|---|---|
| Contracts | ✅ fixed, 146 tests green |
| Server ABI loading | ✅ fixed, verified without `artifacts/` |
| Supabase database | ✅ **done** — all 6 tables, both migrations applied |
| `.env` / `client/.env.local` | ✅ filled and validated |
| Amoy POL in deploy wallet | ❌ **blocked — wallet had 0 POL** |
| Contracts deployed | ❌ not yet — `deployments.json` still null |

**Deploy wallet:** `0xc4B0fb7d23e59fD49259F6244F15047A518DDCc5` (MetaMask
Account 2, `m/44'/60'/0'/0/1`). Key verified to derive this address. Account 1
is the user's main wallet — never use it.

**RPC gotcha (cost real time):** `https://rpc-amoy.polygon.technology` is
**dead** — it was why the wallet "wouldn't connect to Amoy". Working endpoint,
already set in `.env`:

```
https://polygon-amoy-bor-rpc.publicnode.com
```

The user also had to change the RPC on MetaMask's Amoy network. Verify any RPC
before recommending it:

```bash
curl -s -X POST <url> -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

`client/.env.local` previously held **Base Sepolia** contract addresses that do
not exist on Amoy — blanked deliberately, since an empty value fails loudly and
a stale one fails silently much later. Must be filled from the deploy output.

---

# Next steps, in order

1. **Fund** `0xc4B0…DCc5` with Amoy POL (faucet.polygon.technology, or the
   Google Cloud / Alchemy Amoy faucets). 0.1 POL is plenty.
2. **Deploy:** `npx hardhat run scripts/deploy.js --network polygonAmoy`
3. **Paste the printed addresses** into `.env` (4 vars) and `client/.env.local`
   (3 `VITE_` vars, currently blank — including `VITE_USDC_ADDRESS`, which has
   no fallback).
4. **Smoke test:** `cd server && npm run dev` (:3001) and `cd client && npm run
   dev` (:5173). Connect wallet → create campaign → apply from a second wallet →
   select → submit proof → `MockMetricsOracle.submitMetric()` above threshold →
   confirm USDC lands and the reputation NFT mints.
5. Optional: `npx hardhat run scripts/verify.js --network polygonAmoy` (needs an
   Etherscan **V2** key from etherscan.io — Polygonscan V1 keys are dead).

## Still pending after that

**Demo quality (Phase 3)**
- **Browse is wallet-gated** — visitors without MetaMask see nothing. Highest
  leverage change for a portfolio.
- No faucet button, so a second wallet cannot get test USDC without calling
  `MockUSDC.faucet()` from PolygonScan directly.
- Badge NFTs will not render: nothing calls `setTokenMetadataURI` and the base
  URI has no `{id}` template. Needs the backend to pin metadata JSON at mint.

**Oracle go-live (Phase 2)**
- No script deploys `MetricsConsumer` / `AutomationHandler`, nor does the four
  wiring calls they need (`consumer.setCampaignFactory`,
  `consumer.setAutomationHandler`, `handler.setCampaignFactory`,
  `factory.setAutomationHandler`).
- Chainlink subscription + LINK, DON secrets, `setSourceCode` uploads, then
  `setForwarder` after registering the upkeep.
- `checkInterval` has a 1-hour minimum — awkward for live demos; consider an
  owner-only `forceCheck`.

**Hardening / modernization (not bugs)**
- SafeERC20, custom errors, EIP-1167 clones. Best as one pass now that a green
  suite exists to catch regressions.
- Hardhat 3.4.5 → 3.17; `hre.network.connect()` is deprecated (warns on every
  test and deploy run).

**Docs are stale** — `DOCUMENTATION.md` / `.docx` / `.pdf` (generated
2026-09-11) still list several now-fixed items as open gaps. Regenerate with
pandoc + Chrome; see the pipeline notes in that session if repeating.

---

# Session log — 2026-09-21 (part 2)

Done while the user was waiting on Amoy faucet funds — everything here is
deploy-independent.

## Oracle layer is now scriptable

- **`scripts/deployOracle.js`** (`npm run deploy:oracle`) — the piece that never
  existed. Deploys `MetricsConsumer` + `AutomationHandler`, does the four wiring
  calls (`consumer.setCampaignFactory`, `consumer.setAutomationHandler`,
  `handler.setCampaignFactory`, `factory.setAutomationHandler`), uploads the
  per-platform DON source with `setSourceCode`, and repoints the factory from
  the mock at the real consumer. Prints the manual steps it cannot do
  (subscription funding, DON secrets, upkeep registration, `setForwarder`).
  Needs `FUNCTIONS_ROUTER_ADDRESS`, `FUNCTIONS_SUBSCRIPTION_ID`,
  `FUNCTIONS_DON_ID` — all added to `.env.example`.
- **`AutomationHandler.forceCheck(campaignId)`** (owner-only) — runs a check
  immediately. `checkInterval` has a one-hour floor, which makes a live demo
  impractical.
- **`test/OracleWiring.test.js`** (7 tests) reproduces the deployOracle sequence
  and drives a campaign all the way through it: create → auto-authorise →
  auto-register → upkeep → DON request → fulfilment → creator paid + NFT minted.
  Asserts the request is filed against the **escrow**, not the handler — the bug
  that would have silently broken every payout. Drop any one wiring call and
  this suite fails.

## Demo blockers cleared

- **Browse is public.** `RoleGuard` removed — the page reads the public
  `/campaigns/open` endpoint and never touched `useAccount`, so the gate meant
  anyone without MetaMask saw an empty site.
- **CampaignDetail is publicly readable.** `WalletGuard` removed; every action
  panel was already conditioned on `connectedAddress`. `ApplyPanel` now requires
  a connected wallet, and a new `ConnectToApplyPanel` invites the visitor to
  connect instead of hiding the page.
- **`TestnetFaucet`** (`components/shared/TestnetFaucet.jsx`, mounted in the
  Dashboard header) — shows the wallet's USDC balance and mints 1,000 test USDC
  via `MockUSDC.faucet()`. Testnet-gated on `EXPECTED_CHAIN_ID !== 137`, since
  real USDC has no faucet. Required adding `faucet` to `USDC_ABI`.
  Only the deploy wallet gets minted any USDC, so without this a second wallet
  cannot act as a creator.

**Note:** `client/src/pages/CampaignDetail.jsx` and `Dashboard.jsx` carry 8 and 5
pre-existing `no-unused-vars` lint errors respectively. Verified against `HEAD` —
not introduced by these changes. `npm run build` passes.

## Tests: 156 passing, 0 failing

CampaignEscrow 50 · CampaignFactory 27 · ReputationToken 23 ·
AutomationHandler 22 · OracleFlow 14 · MetricsConsumer 13 · OracleWiring 7

## Docs regenerated

`DOCUMENTATION.md` / `.docx` / `.pdf` rebuilt (22 A4 pages) — status, contract
behaviour, test counts, route gates, the ABI change, and a fully rewritten
"Known gaps" now match reality. Also fixed the stray `itds` keystroke in the H1.

Pipeline, if repeating: mermaid → SVG via headless Chrome `--dump-dom` → PNG at
2x; `pandoc` + a patched `reference.docx` for Word; `pandoc` → HTML + `print.css`
→ Chrome `--print-to-pdf` for the PDF. The architecture diagram needs a narrower
print variant — the source layout renders 1912px wide, which puts labels at ~4pt
on a portrait page.

---

# Current status — 2026-09-21 (part 2)

| Item | State |
|---|---|
| Contracts | ✅ hardened, 156 tests green |
| Oracle deploy script | ✅ written + tested (`npm run deploy:oracle`) |
| Server ABI loading | ✅ fixed, verified without `artifacts/` |
| Supabase database | ✅ done |
| `.env` / `client/.env.local` | ✅ filled and validated |
| Public browse + faucet button | ✅ done |
| Docs | ✅ regenerated, accurate |
| **Amoy POL in deploy wallet** | ❌ **the only blocker** |
| Contracts deployed | ❌ not yet |

**Next action is unchanged:** fund
`0xc4B0fb7d23e59fD49259F6244F15047A518DDCc5`, then
`npx hardhat run scripts/deploy.js --network polygonAmoy`, then paste the
printed addresses into `.env` (4 vars) and `client/.env.local` (3, blank).

## What is left after deploying

- Badge NFT metadata — nothing calls `setTokenMetadataURI`, base URI has no
  `{id}` template, so NFTs will not render in a wallet. Needs backend pinning.
- Seed a few campaigns so the marketplace is not empty.
- Chainlink go-live: subscription + LINK, DON secrets, upkeep registration,
  `setForwarder`. The script handles everything on-chain.
- Hardening pass: SafeERC20, custom errors, EIP-1167 clones; Hardhat 3.17 and
  the `hre.network.connect()` deprecation.

## Working agreement

Make no changes to project files without an explicit request. Explain shell
commands before/when running them. This file is the only one Claude Code may
freely update for its own reference.
