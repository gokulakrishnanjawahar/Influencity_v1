-- ─────────────────────────────────────────────
-- Influencity Database Schema
-- Migration 002 — Open Campaign Marketplace
-- ─────────────────────────────────────────────
-- Campaigns become public listings: a brand posts a campaign with no creator,
-- creators apply, and the brand selects one to form the agreement.
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- CAMPAIGNS — creator is now optional, add 'open' status
-- ─────────────────────────────────────────────
-- An open listing has no creator until the brand selects an applicant.

alter table campaigns alter column creator_address drop not null;

-- Replace the status check to include 'open'
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check
  check (status in ('open', 'pending', 'active', 'completed', 'cancelled'));

-- New campaigns default to 'open' (waiting for applicants)
alter table campaigns alter column status set default 'open';

-- ─────────────────────────────────────────────
-- CAMPAIGN APPLICATIONS
-- ─────────────────────────────────────────────
-- A creator's application to an open campaign listing.
-- social_links holds the creator's social profile URLs as JSON, e.g.
--   { "youtube": "...", "twitch": "...", "linkedin": "...", "other": "..." }
-- status: 'pending'   — awaiting brand review
--         'selected'  — brand chose this creator (agreement formed)
--         'rejected'  — brand chose someone else
--         'withdrawn' — creator withdrew their application

create table if not exists campaign_applications (
  id               uuid primary key default uuid_generate_v4(),
  campaign_id      uuid references campaigns(id) on delete cascade,
  creator_id       uuid references users(id) on delete set null,
  creator_address  text not null,
  pitch_message    text,
  social_links     jsonb not null default '{}'::jsonb,
  status           text not null default 'pending'
                     check (status in ('pending', 'selected', 'rejected', 'withdrawn')),
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now(),
  -- a creator may only apply once per campaign
  unique(campaign_id, creator_address)
);

create index if not exists idx_applications_campaign on campaign_applications(campaign_id);
create index if not exists idx_applications_creator  on campaign_applications(creator_address);
create index if not exists idx_applications_status   on campaign_applications(status);

-- Keep updated_at fresh on every row update
drop trigger if exists update_applications_updated_at on campaign_applications;
create trigger update_applications_updated_at
  before update on campaign_applications
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
-- Consistent with the rest of the schema: publicly readable,
-- writes happen only via the backend service role key.

alter table campaign_applications enable row level security;

drop policy if exists "Applications are publicly readable" on campaign_applications;
create policy "Applications are publicly readable"
  on campaign_applications for select
  using (true);
