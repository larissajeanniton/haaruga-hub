-- ============================================================================
-- Bama Hub — DB fixes: missing tables + weekly-digest support
-- Run this ONCE in Supabase -> SQL Editor -> New query -> Run.
-- Safe to run even if some pieces already exist (each step is idempotent).
-- ============================================================================

-- 1) Newsletter signups (the "Subscribe" box on the Bulletin page inserts here).
--    This table was documented in SETUP-GUIDE.md but was never actually created,
--    which is why every subscribe attempt has been failing with a raw DB error.
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);
alter table subscribers enable row level security;
drop policy if exists "anyone can subscribe" on subscribers;
create policy "anyone can subscribe" on subscribers
  for insert with check (true);
-- No select/update/delete policy for the public: subscriber emails stay private,
-- readable only from the dashboard or by server code using the service_role key.

-- 2) Abuse/spam reports (profiles, bulletin posts, locations all use this).
--    Also referenced by the app but never created -- every "report" click has
--    been failing with a raw DB error instead of showing "Reported -- thank you."
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,       -- 'profile' | 'post' | 'location'
  item_id text not null,
  reason text,
  created_at timestamptz default now()
);
alter table reports enable row level security;
drop policy if exists "anyone can report" on reports;
create policy "anyone can report" on reports
  for insert with check (true);
-- Again: no public select -- reports are only visible from the dashboard
-- (or from an admin dashboard later, via the service_role key).

-- 3) Track which bulletin posts have already gone out in a weekly digest, so the
--    automated digest only ever includes NEW posts, not every post ever made.
alter table posts add column if not exists digested_at timestamptz;

-- 4) One row per weekly digest run: holds the compiled preview + a one-time
--    approve/skip token emailed to the admin. Locked down -- RLS enabled with NO
--    policies, so it's reachable only by server code using the service_role key
--    (the anon key the browser uses can't read or write it at all).
create table if not exists digest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  post_ids jsonb not null default '[]'::jsonb,
  subject text,
  html text,
  token text unique not null,
  status text not null default 'pending' check (status in ('pending','sent','skipped')),
  resolved_at timestamptz,
  recipient_count int
);
alter table digest_runs enable row level security;

-- ============================================================================
-- Note: MAINTENANCE-AND-ROADMAP.md previously had an example-profile cleanup
-- query using a column (is_example) that doesn't exist on `profiles` -- it
-- would have errored if run. That's been corrected in the roadmap doc; no
-- action needed here since the demo profiles (Maya/Ron/Tamar) are already gone.
-- ============================================================================
