-- BeautIzzy — Online booking, Sprint 2: the public booking profile of a Business
--
-- What a professional shows on her public page (web/, /r/<slug>) and whether
-- that page is online. NOTHING here books anything: no availability, no
-- working hours, no appointment, no customer, no payment.
--
--   table    business_booking_profiles     one row per Business, server-authoritative
--   bucket   business-public-media         PUBLIC, the logo and the cover only
--   flag     ONLINE_BOOKING_PUBLICATION    operator switch, DISABLED
--
--   owner (authenticated, through RPCs only)
--     online_booking_read_profile(business)            her profile (creates the empty draft)
--     online_booking_update_profile(business, …)       the draft fields
--     online_booking_set_state(business, published, booking_enabled)
--   website (service_role, through ONE RPC only)
--     online_booking_public_profile(slug)              the approved public fields, or NULL
--   operator (table owner, SQL Editor)
--     online_booking_set_publication_enabled(boolean)
--
-- Separate from the offline sync on purpose: the table is not an aggregate,
-- no sync RPC reads or writes it, and the device never queues a change to it.
-- An installed build that predates this migration never names any object of
-- it, and NO existing table, column, policy, grant, function or flag row is
-- touched — the migration only ADDS objects.
--
-- Draft vs publication (the approved product rule):
--
--   editing the draft          the owner, always — no subscription needed
--   turning the page ON        the owner AND the operator switch ON AND verified
--   accepting bookings ON      production Plus access of the owner, per THE
--                              existing rule `subscription_has_plus_access`
--                              (trials and complimentary PROMOTIONAL grants
--                              included; Sandbox and Test Store never)
--   turning either OFF         the owner, always
--   being visible publicly     published AND the same two conditions AT READ
--                              TIME: a lapsed subscription or a switched-off
--                              flag takes the page offline without rewriting
--                              a row, and brings it back the same way
--
-- The rule deliberately does NOT go through `business_mutation_is_entitled`:
-- that one answers TRUE while its own enforcement switch is off, which would
-- publish for everyone. Neither existing enforcement switch is read or
-- flipped here. The new switch ships DISABLED: until an operator enables it,
-- nobody can publish and the public RPC answers NULL for every slug.
--
-- Public identifiers: the website never receives a Business id. Image paths
-- start with `media_id`, a random identifier that exists only for that
-- purpose and grants nothing.
--
-- Privileges, explicit and minimal: every new function is revoked from
-- public, anon, authenticated AND service_role first, then granted back to
-- exactly one role when a caller exists. The table has RLS enabled with NO
-- policy and no grant at all. `anon` receives nothing.
--
-- Safe to re-run: `if not exists`, `on conflict do nothing` (a re-run never
-- flips the flag), `drop policy if exists` on this bucket's own policies only,
-- `create or replace`.

-- ---------------------------------------------------------------------------
-- 1. The operator switch — one disabled row
-- ---------------------------------------------------------------------------
insert into public.server_feature_flags (flag, enabled, note)
values (
  'ONLINE_BOOKING_PUBLICATION',
  false,
  'Online booking: when enabled, an owner with verified production Plus access may publish her public booking profile, and published profiles are served to the website. Flip with online_booking_set_publication_enabled(boolean).')
on conflict (flag) do nothing;

create or replace function public.online_booking_publication_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.server_feature_flags f
      where f.flag = 'ONLINE_BOOKING_PUBLICATION'),
    false);
$$;

comment on function public.online_booking_publication_enabled() is
  'Online booking: whether publication is open. A missing row reads as closed.';

revoke all on function public.online_booking_publication_enabled() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Slug shape
-- ---------------------------------------------------------------------------
-- Lowercase letters, digits and single hyphens, 3 to 60 characters — the same
-- rule as web/src/features/public-profile/slug.ts and src/domain/online-booking.
-- A short reserved list keeps a professional from posing as BeautIzzy.
create or replace function public.online_booking_is_valid_slug(p_slug text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_slug is not null
     and char_length(p_slug) between 3 and 60
     and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
$$;

create or replace function public.online_booking_is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_slug in (
    'beautizzy', 'beautizzy-plus', 'admin', 'support', 'contact', 'aide',
    'api', 'www', 'reserver', 'reservation', 'test', 'demo');
$$;

revoke all on function public.online_booking_is_valid_slug(text) from public, anon, authenticated, service_role;
revoke all on function public.online_booking_is_reserved_slug(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The table
-- ---------------------------------------------------------------------------
create table if not exists public.business_booking_profiles (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  -- First folder of this Business's objects in the public bucket. Public by
  -- nature (it appears in image URLs); never the Business id.
  media_id uuid not null unique default gen_random_uuid(),
  -- NULL while the draft has no address yet. Stored normalized.
  slug text unique,
  -- IANA name. Europe/Paris for every Business today; no editing surface yet.
  time_zone text not null default 'Europe/Paris'
    check (char_length(time_zone) between 1 and 64),
  -- NULL = the Business name (public.businesses.name) is shown; never a copy of it.
  public_name text check (public_name is null or char_length(btrim(public_name)) between 1 and 120),
  description text check (description is null or char_length(description) between 1 and 1000),
  public_phone text check (public_phone is null or char_length(btrim(public_phone)) between 1 and 40),
  public_email text check (public_email is null or public.communications_is_valid_email(public_email)),
  address text check (address is null or char_length(btrim(address)) between 1 and 200),
  -- Object paths in business-public-media. Never a URL, never image bytes.
  logo_path text,
  cover_path text,
  published boolean not null default false,
  booking_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_booking_profiles_slug_shape
    check (slug is null or public.online_booking_is_valid_slug(slug)),
  constraint business_booking_profiles_published_requires_slug
    check (not published or slug is not null),
  constraint business_booking_profiles_booking_requires_published
    check (not booking_enabled or published),
  constraint business_booking_profiles_logo_path_shape
    check (logo_path is null
      or logo_path ~ ('^' || media_id::text || '/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')),
  constraint business_booking_profiles_cover_path_shape
    check (cover_path is null
      or cover_path ~ ('^' || media_id::text || '/cover/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'))
);

comment on table public.business_booking_profiles is
  'Online booking: the public booking profile of a Business (draft or published), server-authoritative and outside the offline sync. No table access for any API role — the owner goes through online_booking_read_profile / online_booking_update_profile / online_booking_set_state, the website through online_booking_public_profile.';

create or replace function public.business_booking_profiles_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.business_id := old.business_id;
    new.media_id := old.media_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.business_booking_profiles_before_write() from public, anon, authenticated, service_role;

drop trigger if exists business_booking_profiles_before_write on public.business_booking_profiles;
create trigger business_booking_profiles_before_write
  before insert or update on public.business_booking_profiles
  for each row
  execute function public.business_booking_profiles_before_write();

alter table public.business_booking_profiles enable row level security;
revoke all on table public.business_booking_profiles from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. THE publication rule
-- ---------------------------------------------------------------------------
-- TRUE when the page of this Business may be online at `p_at`: publication is
-- open AND its owner holds verified production Plus access per THE existing
-- access rule. Never re-implements that rule. FALSE for an unknown Business.
create or replace function public.online_booking_may_be_public(
  p_business_id uuid,
  p_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.online_booking_publication_enabled()
     and coalesce(
       (select public.subscription_has_plus_access(b.owner_user_id, coalesce(p_at, now()))
          from public.businesses b
         where b.id = p_business_id),
       false);
$$;

comment on function public.online_booking_may_be_public(uuid, timestamptz) is
  'Online booking: THE publication rule — the operator switch is ON and the owner holds verified production Plus access (subscription_has_plus_access). Asked when publishing AND at every public read. Not client-callable.';

revoke all on function public.online_booking_may_be_public(uuid, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The owner's view of her profile
-- ---------------------------------------------------------------------------
create or replace function public.online_booking_owner_profile_json(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', p.slug,
    'business_name', b.name,
    'public_name', p.public_name,
    'description', p.description,
    'public_phone', p.public_phone,
    'public_email', p.public_email,
    'address', p.address,
    'logo_path', p.logo_path,
    'cover_path', p.cover_path,
    'media_id', p.media_id,
    'time_zone', p.time_zone,
    'published', p.published,
    'booking_enabled', p.booking_enabled,
    'publication_open', public.online_booking_publication_enabled(),
    'plus_access', public.subscription_has_plus_access(b.owner_user_id, now()))
    from public.business_booking_profiles p
    join public.businesses b on b.id = p.business_id
   where p.business_id = p_business_id;
$$;

revoke all on function public.online_booking_owner_profile_json(uuid) from public, anon, authenticated, service_role;

-- Reads the profile; the FIRST read creates the empty draft (unpublished,
-- bookings off), because the profile's `media_id` must exist before the
-- owner can upload an image.
create or replace function public.online_booking_read_profile(p_business_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;

  insert into public.business_booking_profiles (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  return public.online_booking_owner_profile_json(p_business_id);
end;
$$;

comment on function public.online_booking_read_profile(uuid) is
  'Online booking: the owner reads her booking profile. Creates the empty unpublished draft on first use. Also tells her whether publication is open and whether her Plus access is verified.';

revoke all on function public.online_booking_read_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_read_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The owner edits the draft fields
-- ---------------------------------------------------------------------------
-- Every field is sent; a blank text clears it. Allowed without a subscription
-- and whatever the publication state — except that a published page keeps an
-- address. Answers:
--   UPDATED            + the profile
--   INVALID_SLUG       malformed, or cleared while published
--   SLUG_UNAVAILABLE   taken by another Business, or reserved
--   INVALID_VALUE      + "field": which one
create or replace function public.online_booking_update_profile(
  p_business_id uuid,
  p_slug text,
  p_public_name text,
  p_description text,
  p_public_phone text,
  p_public_email text,
  p_address text,
  p_logo_path text,
  p_cover_path text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.business_booking_profiles;
  v_slug text := nullif(lower(btrim(coalesce(p_slug, ''))), '');
  v_name text := nullif(btrim(coalesce(p_public_name, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_phone text := nullif(btrim(coalesce(p_public_phone, '')), '');
  v_email text := nullif(btrim(coalesce(p_public_email, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_logo text := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_cover text := nullif(btrim(coalesce(p_cover_path, '')), '');
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;

  insert into public.business_booking_profiles (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  select * into v_profile
    from public.business_booking_profiles
   where business_id = p_business_id
     for update;

  if v_slug is null then
    if v_profile.published then
      return jsonb_build_object('status', 'INVALID_SLUG');
    end if;
  elsif not public.online_booking_is_valid_slug(v_slug) then
    return jsonb_build_object('status', 'INVALID_SLUG');
  elsif public.online_booking_is_reserved_slug(v_slug)
     or exists (select 1 from public.business_booking_profiles o
                 where o.slug = v_slug and o.business_id <> p_business_id) then
    return jsonb_build_object('status', 'SLUG_UNAVAILABLE');
  end if;

  if v_name is not null and char_length(v_name) > 120 then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'public_name');
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'description');
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'public_phone');
  end if;
  if v_email is not null and not public.communications_is_valid_email(v_email) then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'public_email');
  end if;
  if v_address is not null and char_length(v_address) > 200 then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'address');
  end if;
  -- An image path may only point inside this profile's own media folder.
  if v_logo is not null
     and v_logo !~ ('^' || v_profile.media_id::text || '/logo/' || v_uuid || '\.jpg$') then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'logo_path');
  end if;
  if v_cover is not null
     and v_cover !~ ('^' || v_profile.media_id::text || '/cover/' || v_uuid || '\.jpg$') then
    return jsonb_build_object('status', 'INVALID_VALUE', 'field', 'cover_path');
  end if;

  begin
    update public.business_booking_profiles set
      slug = v_slug,
      public_name = v_name,
      description = v_description,
      public_phone = v_phone,
      public_email = v_email,
      address = v_address,
      logo_path = v_logo,
      cover_path = v_cover
    where business_id = p_business_id;
  exception when unique_violation then
    -- Two owners asked for the same address at the same instant.
    return jsonb_build_object('status', 'SLUG_UNAVAILABLE');
  end;

  return jsonb_build_object('status', 'UPDATED')
    || public.online_booking_owner_profile_json(p_business_id);
end;
$$;

comment on function public.online_booking_update_profile(uuid, text, text, text, text, text, text, text, text) is
  'Online booking: the owner replaces the draft fields of her booking profile (slug, public name, description, contact, image paths). Needs no subscription. Never changes the publication state.';

revoke all on function public.online_booking_update_profile(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_update_profile(uuid, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The owner publishes / unpublishes, opens / pauses bookings
-- ---------------------------------------------------------------------------
-- Both switches are always sent. Bookings can only be open on a published
-- page, so unpublishing pauses them. Turning a switch ON that is not already
-- on is refused unless THE publication rule holds; turning OFF and keeping an
-- ON switch on are never refused. Answers:
--   UPDATED                  + the profile
--   INCOMPLETE_PROFILE       publishing without an address
--   PUBLICATION_UNAVAILABLE  the operator switch is off
--   ENTITLEMENT_REQUIRED     no verified production Plus access
create or replace function public.online_booking_set_state(
  p_business_id uuid,
  p_published boolean,
  p_booking_enabled boolean
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.business_booking_profiles;
  v_booking boolean;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;
  if p_published is null or p_booking_enabled is null then
    raise exception 'online booking: both switches are required' using errcode = '22023';
  end if;

  insert into public.business_booking_profiles (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  select * into v_profile
    from public.business_booking_profiles
   where business_id = p_business_id
     for update;

  v_booking := p_published and p_booking_enabled;

  if (p_published and not v_profile.published)
     or (v_booking and not v_profile.booking_enabled) then
    if v_profile.slug is null then
      return jsonb_build_object('status', 'INCOMPLETE_PROFILE');
    end if;
    if not public.online_booking_publication_enabled() then
      return jsonb_build_object('status', 'PUBLICATION_UNAVAILABLE');
    end if;
    if not public.online_booking_may_be_public(p_business_id) then
      return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');
    end if;
  end if;

  update public.business_booking_profiles set
    published = p_published,
    booking_enabled = v_booking
  where business_id = p_business_id;

  return jsonb_build_object('status', 'UPDATED')
    || public.online_booking_owner_profile_json(p_business_id);
end;
$$;

comment on function public.online_booking_set_state(uuid, boolean, boolean) is
  'Online booking: the owner publishes or unpublishes her page and opens or pauses bookings. Turning either ON requires the operator switch AND verified production Plus access (online_booking_may_be_public); turning OFF never does.';

revoke all on function public.online_booking_set_state(uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_set_state(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The website's read — the approved public fields only
-- ---------------------------------------------------------------------------
-- NULL — the same NULL — for an unknown slug, a malformed one, a draft, a
-- profile whose owner lost Plus access and any slug while the operator switch
-- is off. Never a Business id, an owner, a subscription fact, a client, an
-- appointment or an amount. service_role ONLY: the website calls it from
-- server-only code with the secret key; `anon` and `authenticated` cannot.
create or replace function public.online_booking_public_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', p.slug,
    'name', coalesce(p.public_name, b.name),
    'description', p.description,
    'phone', p.public_phone,
    'email', p.public_email,
    'address', p.address,
    'logo_path', p.logo_path,
    'cover_path', p.cover_path,
    'time_zone', p.time_zone,
    'booking_enabled', p.booking_enabled)
    from public.business_booking_profiles p
    join public.businesses b on b.id = p.business_id
   where p.slug = lower(btrim(p_slug))
     and p.published
     and public.online_booking_may_be_public(p.business_id);
$$;

comment on function public.online_booking_public_profile(text) is
  'Online booking: the public profile behind a slug — approved public fields only — or NULL when no page is online there. service_role only (the website server).';

revoke all on function public.online_booking_public_profile(text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_public_profile(text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Public branding images
-- ---------------------------------------------------------------------------
-- A NEW public bucket: the private business-media bucket (Client and Product
-- photos) is not touched and stays private. JPEG only, 2 MB. An object is
-- readable by anyone who knows its URL — that is the purpose — but nobody can
-- list the bucket, and only the owner can add or delete in her own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-public-media', 'business-public-media', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- TRUE when the object path is `<media_id>/<logo|cover>/<uuid>.jpg` and
-- `media_id` is the profile of a Business the signed-in user owns.
create or replace function public.online_booking_is_media_owner(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
     and exists (
       select 1
         from public.business_booking_profiles p
         join public.businesses b on b.id = p.business_id
        where p.media_id::text = split_part(object_name, '/', 1)
          and b.owner_user_id = (select auth.uid()));
$$;

comment on function public.online_booking_is_media_owner(text) is
  'Online booking: Storage RLS predicate of business-public-media — a well-formed logo/cover path inside the media folder of a Business the signed-in user owns.';

revoke all on function public.online_booking_is_media_owner(text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_is_media_owner(text) to authenticated;

drop policy if exists "business-public-media: owner can select" on storage.objects;
drop policy if exists "business-public-media: owner can insert" on storage.objects;
drop policy if exists "business-public-media: owner can delete" on storage.objects;

create policy "business-public-media: owner can select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'business-public-media' and public.online_booking_is_media_owner(name));

create policy "business-public-media: owner can insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'business-public-media' and public.online_booking_is_media_owner(name));

create policy "business-public-media: owner can delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'business-public-media' and public.online_booking_is_media_owner(name));

-- ---------------------------------------------------------------------------
-- 10. The operator switch — flip, in ONE statement
-- ---------------------------------------------------------------------------
-- Result: { "enabled", "published_profiles", "published_without_plus" } — the
-- counts are informational. Nothing is rewritten: a published profile whose
-- owner lacks Plus simply stays offline. No EXECUTE grant: the table owner
-- (the SQL Editor's `postgres`) is the only caller.
create or replace function public.online_booking_set_publication_enabled(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_published integer;
  v_without_plus integer;
begin
  if p_enabled is null then
    raise exception 'online booking: enabled must be true or false' using errcode = '22023';
  end if;

  insert into public.server_feature_flags (flag, enabled, enabled_at, updated_at)
  values ('ONLINE_BOOKING_PUBLICATION', p_enabled,
          case when p_enabled then now() end, now())
  on conflict (flag) do update set
    enabled = excluded.enabled,
    enabled_at = case when excluded.enabled then now() end,
    updated_at = now();

  select count(*)::integer,
         (count(*) filter (where not public.subscription_has_plus_access(b.owner_user_id, now())))::integer
    into v_published, v_without_plus
    from public.business_booking_profiles p
    join public.businesses b on b.id = p.business_id
   where p.published;

  return jsonb_build_object(
    'enabled', p_enabled,
    'published_profiles', v_published,
    'published_without_plus', v_without_plus);
end;
$$;

comment on function public.online_booking_set_publication_enabled(boolean) is
  'Online booking: the OPERATOR switch — opens or closes publication of public booking profiles and reports how many published profiles exist and how many lack verified Plus access. No EXECUTE grant: table owner only.';

revoke all on function public.online_booking_set_publication_enabled(boolean) from public, anon, authenticated, service_role;
