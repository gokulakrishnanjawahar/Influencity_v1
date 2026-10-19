-- ─────────────────────────────────────────────
-- 003 — SIWE nonces + chain indexer state
-- ─────────────────────────────────────────────
-- Run after 001 and 002. Idempotent.

-- ─────────────────────────────────────────────
-- AUTH NONCES
-- ─────────────────────────────────────────────
-- One row per sign-in attempt. The server issues the nonce, the wallet signs a
-- SIWE message containing it, and verification consumes it (sets used_at) so
-- the same signed message can never be replayed.
-- Only the server (service key) touches this table: RLS on, no policies.

create table if not exists auth_nonces (
  nonce       text primary key,
  expires_at  timestamp with time zone not null,
  used_at     timestamp with time zone,
  created_at  timestamp with time zone default now()
);

create index if not exists idx_auth_nonces_expires on auth_nonces(expires_at);

alter table auth_nonces enable row level security;

-- ─────────────────────────────────────────────
-- SYNC STATE
-- ─────────────────────────────────────────────
-- The indexer's cursor: the last block whose events have been applied.
-- Server-only, like auth_nonces.

create table if not exists sync_state (
  id          text primary key,
  last_block  bigint not null,
  updated_at  timestamp with time zone default now()
);

alter table sync_state enable row level security;

-- ─────────────────────────────────────────────
-- MILESTONES — creator's channel
-- ─────────────────────────────────────────────

alter table milestones add column if not exists channel_id text;

-- ─────────────────────────────────────────────
-- REPUTATION EVENTS — idempotent inserts
-- ─────────────────────────────────────────────
-- The indexer may see the same log twice (overlapping syncs, retries). A log
-- is uniquely identified by its transaction hash and index within the block.

alter table reputation_events add column if not exists log_index integer;
alter table reputation_events add column if not exists brand_address text;
alter table reputation_events add column if not exists value_usdc numeric;

create unique index if not exists idx_reputation_tx_log
  on reputation_events(tx_hash, log_index);
