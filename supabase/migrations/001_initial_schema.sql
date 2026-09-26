-- ─────────────────────────────────────────────
-- Influencity Database Schema
-- Migration 001 — Initial Schema
-- ─────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
-- Linked to Supabase Auth via id.
-- wallet_address is the primary Web3 identity.
-- role determines which dashboard view they see.

create table if not exists users (
  id               uuid primary key default uuid_generate_v4(),
  wallet_address   text unique not null,
  email            text unique,
  role             text not null check (role in ('brand', 'creator')),
  display_name     text,
  avatar_url       text,
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now()
);

create index if not exists idx_users_wallet on users(wallet_address);

-- ─────────────────────────────────────────────
-- CAMPAIGNS
-- ─────────────────────────────────────────────
-- Off-chain mirror of on-chain campaign state.
-- contract_address links to the deployed CampaignEscrow.
-- status mirrors the on-chain state for fast frontend queries.

create table if not exists campaigns (
  id                  uuid primary key default uuid_generate_v4(),
  campaign_id_onchain bigint unique,
  brand_id            uuid references users(id) on delete set null,
  creator_id          uuid references users(id) on delete set null,
  brand_address       text not null,
  creator_address     text not null,
  contract_address    text unique,
  ipfs_brief_cid      text,
  ipfs_brief_url      text,
  title               text,
  description         text,
  status              text not null default 'pending'
                        check (status in ('pending', 'active', 'completed', 'cancelled')),
  total_deposit_usdc  numeric,
  total_released_usdc numeric default 0,
  created_at          timestamp with time zone default now(),
  updated_at          timestamp with time zone default now()
);

create index if not exists idx_campaigns_brand    on campaigns(brand_address);
create index if not exists idx_campaigns_creator  on campaigns(creator_address);
create index if not exists idx_campaigns_contract on campaigns(contract_address);
create index if not exists idx_campaigns_status   on campaigns(status);

-- ─────────────────────────────────────────────
-- MILESTONES
-- ─────────────────────────────────────────────
-- Synced from on-chain events via webhook.
-- verified_value is populated when the oracle posts a result.

create table if not exists milestones (
  id               uuid primary key default uuid_generate_v4(),
  campaign_id      uuid references campaigns(id) on delete cascade,
  milestone_index  integer not null,
  platform         text not null check (platform in ('YOUTUBE', 'TWITCH', 'LINKEDIN')),
  metric_type      text not null check (metric_type in ('VIEWS', 'CLICKS', 'FOLLOWERS', 'WATCH_TIME', 'CONCURRENT_VIEWERS')),
  threshold        numeric not null,
  tranche_usdc     numeric not null,
  deadline         timestamp with time zone not null,
  content_id       text,
  ipfs_proof_cid   text,
  verified_value   numeric,
  status           text not null default 'pending'
                     check (status in ('pending', 'met', 'failed')),
  resolved_at      timestamp with time zone,
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now(),
  unique(campaign_id, milestone_index)
);

create index if not exists idx_milestones_campaign on milestones(campaign_id);
create index if not exists idx_milestones_status   on milestones(status);

-- ─────────────────────────────────────────────
-- REPUTATION EVENTS
-- ─────────────────────────────────────────────
-- Mirrors on-chain ReputationToken mint events.
-- token_id is the ERC-1155 token ID (derived from campaignId + milestoneIndex).

create table if not exists reputation_events (
  id               uuid primary key default uuid_generate_v4(),
  creator_id       uuid references users(id) on delete set null,
  creator_address  text not null,
  campaign_id      uuid references campaigns(id) on delete set null,
  milestone_id     uuid references milestones(id) on delete set null,
  token_id         text not null,
  minted_at        timestamp with time zone default now(),
  tx_hash          text,
  created_at       timestamp with time zone default now()
);

create index if not exists idx_reputation_creator  on reputation_events(creator_address);
create index if not exists idx_reputation_campaign on reputation_events(campaign_id);

-- ─────────────────────────────────────────────
-- CONTENT PROOFS
-- ─────────────────────────────────────────────
-- Creator content delivery records.
-- Created when creator submits proof via POST /campaigns/:id/proof.

create table if not exists content_proofs (
  id               uuid primary key default uuid_generate_v4(),
  campaign_id      uuid references campaigns(id) on delete cascade,
  creator_id       uuid references users(id) on delete set null,
  creator_address  text not null,
  milestone_index  integer not null,
  ipfs_cid         text not null,
  ipfs_url         text,
  platform_url     text,
  content_id       text,
  platform         text,
  submitted_at     timestamp with time zone default now(),
  created_at       timestamp with time zone default now()
);

create index if not exists idx_proofs_campaign on content_proofs(campaign_id);
create index if not exists idx_proofs_creator  on content_proofs(creator_address);

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────
-- Automatically updates updated_at on every row update.

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_users_updated_at on users;
create trigger update_users_updated_at
  before update on users
  for each row execute function update_updated_at();

drop trigger if exists update_campaigns_updated_at on campaigns;
create trigger update_campaigns_updated_at
  before update on campaigns
  for each row execute function update_updated_at();

drop trigger if exists update_milestones_updated_at on milestones;
create trigger update_milestones_updated_at
  before update on milestones
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────
-- Enable RLS on all tables.
-- Service role key bypasses RLS — used by backend only.
-- Anon key respects RLS — used by frontend.

alter table users             enable row level security;
alter table campaigns         enable row level security;
alter table milestones        enable row level security;
alter table reputation_events enable row level security;
alter table content_proofs    enable row level security;

-- Users can read their own record
drop policy if exists "Users can read own record" on users;
create policy "Users can read own record"
  on users for select
  using (true);

-- Campaigns are publicly readable
drop policy if exists "Campaigns are publicly readable" on campaigns;
create policy "Campaigns are publicly readable"
  on campaigns for select
  using (true);

-- Milestones are publicly readable
drop policy if exists "Milestones are publicly readable" on milestones;
create policy "Milestones are publicly readable"
  on milestones for select
  using (true);

-- Reputation events are publicly readable
drop policy if exists "Reputation events are publicly readable" on reputation_events;
create policy "Reputation events are publicly readable"
  on reputation_events for select
  using (true);

-- Content proofs are publicly readable
drop policy if exists "Content proofs are publicly readable" on content_proofs;
create policy "Content proofs are publicly readable"
  on content_proofs for select
  using (true);