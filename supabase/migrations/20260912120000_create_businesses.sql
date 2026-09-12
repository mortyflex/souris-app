-- Souris — Account & Onboarding V1: the Business table
--
-- One remote table only. Operational data (Clients, Appointments, Services,
-- Products, Sales) stays in the device SQLite database until the Cloud Sync
-- milestone. Security model: Auth + Row Level Security; the mobile app
-- authenticates with the publishable key and can only ever read or write
-- the Business owned by the signed-in user.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  -- One authenticated user owns exactly one Business in V1 (UNIQUE). Staff
  -- memberships may relax this later through a separate table.
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  owner_first_name text not null check (char_length(btrim(owner_first_name)) between 1 and 80),
  owner_last_name text check (owner_last_name is null or char_length(btrim(owner_last_name)) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Stable application vocabulary (HAIRDRESSING, BARBER, NAILS, ESTHETICS,
  -- LASHES_BROWS, OTHER), validated by the application: plain text keeps
  -- the vocabulary easy to extend without a migration.
  activity_type text not null check (char_length(activity_type) between 1 and 40),
  phone text check (phone is null or char_length(btrim(phone)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.businesses is
  'One Souris Business per owner. Account identity only; operational data is not synchronized in V1.';

-- The unique constraint above already indexes owner_user_id, which every
-- policy below filters on.

-- updated_at automation + immutable ownership: a client can never move a
-- Business to another owner or rewrite its creation instant.
create function public.businesses_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.owner_user_id := old.owner_user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger businesses_before_update
  before update on public.businesses
  for each row
  execute function public.businesses_before_update();

-- Row Level Security: owner-only. No policy exists for anon, so the
-- publishable key without a session sees nothing. No DELETE policy in V1.
alter table public.businesses enable row level security;

create policy "businesses: owner can select"
  on public.businesses
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy "businesses: owner can insert"
  on public.businesses
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy "businesses: owner can update"
  on public.businesses
  for update
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

revoke all on table public.businesses from anon;
grant select, insert, update on table public.businesses to authenticated;
