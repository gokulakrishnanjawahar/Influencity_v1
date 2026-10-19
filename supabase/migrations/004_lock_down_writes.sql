-- ─────────────────────────────────────────────
-- 004 — Lock down writes
-- ─────────────────────────────────────────────
-- Run AFTER the server's SUPABASE_SERVICE_KEY holds the real service_role
-- key. The service role bypasses RLS; this migration makes sure nothing else
-- can write.
--
-- The live database accepted inserts into campaigns, milestones and users
-- with the anon key — the key that ships to every browser — so anyone could
-- write campaign state directly. All writes belong to the backend, so:
--   1. RLS is enabled on every app table (it was evidently off on some)
--   2. every policy that is not read-only is dropped
-- The public read policies from 001/002 are kept. Idempotent.

alter table users                 enable row level security;
alter table campaigns             enable row level security;
alter table milestones            enable row level security;
alter table reputation_events     enable row level security;
alter table content_proofs        enable row level security;
alter table campaign_applications enable row level security;
alter table auth_nonces           enable row level security;
alter table sync_state            enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd <> 'SELECT'
      and tablename in (
        'users', 'campaigns', 'milestones', 'reputation_events',
        'content_proofs', 'campaign_applications', 'auth_nonces', 'sync_state'
      )
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'dropped write policy % on %', p.policyname, p.tablename;
  end loop;
end $$;
