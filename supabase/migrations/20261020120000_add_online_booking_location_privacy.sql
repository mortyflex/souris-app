-- BeautIzzy — Online booking: the location privacy contract of the public page
--
-- Where a professional works is HER decision. She chooses ONE publication
-- level, and the database alone decides what leaves it:
--
--   address_visibility   what online_booking_public_profile returns
--   ------------------   ----------------------------------------------------
--   FULL_ADDRESS         the street, the postal code, the city, and a plain
--                        directions destination built from those three
--   CITY_ONLY            the city — nothing else, no destination
--   HIDDEN               no location at all
--   NULL (unconfigured)  no location at all — the SAME answer as HIDDEN
--
-- Approved product decisions (November 2026):
--
--   1. A profile without an explicit choice is PRIVATE. The free-text
--      `address` written before this migration is KEPT, untouched, for the
--      professional, and is never returned to the website again.
--   2. CITY_ONLY returns the city name only: no street, no number, no postal
--      code, no full address, no coordinates, no directions query.
--   3. A booking never overrides the choice: the booking flow, its
--      confirmation and every later confirmation channel read the SAME public
--      contract, so a page that hides its address hides it after a booking too.
--   4. No level is preselected: the owner RPC refuses a save without one, and
--      "unconfigured" can never be chosen back — HIDDEN is the explicit private
--      choice.
--
--   table     business_booking_profiles      + address_visibility, address_street,
--                                               address_postal_code, address_city
--                                               (nullable, no default, CHECKed by
--                                               THE location rule)
--   owner     online_booking_update_location(business, visibility, street,
--             postal code, city)               authenticated, ownership first
--             online_booking_read_profile      unchanged signature; its answer
--                                               gains the four stored values
--   website   online_booking_public_profile    unchanged signature; its answer
--                                               gains `location`, and `address`
--                                               becomes the FULL_ADDRESS-only
--                                               compatibility alias
--
-- No coordinates are stored or computed. No map, no provider key, no URL is
-- built here: a directions destination is plain text that a client encodes
-- itself.
--
-- Compatibility. Only ADDS columns, a constraint, three functions, and
-- replaces the bodies of two functions with the same signatures:
--   - installed app builds keep calling online_booking_update_profile(…,
--     p_address, …) unchanged; that free text is still stored and read back
--     to the owner, but it is private: its form label (« Adresse postale
--     affichée sur votre page ») is no longer true for those builds — see
--     docs/architecture/ONLINE_BOOKING.md §11.6;
--   - a website deployed before this migration reads `address` only: it shows
--     the complete address of a FULL_ADDRESS page and nothing otherwise — the
--     city of a CITY_ONLY page appears only once the website reads `location`.
-- Publication, Plus access, availability, booking creation, request limits
-- and every grant they carry are not touched.
--
-- Depends on 20261015120000 (the table, the owner view, the public read) and
-- 20261018120000 (online_booking_clean_text, online_booking_is_plain_text).
--
-- Safe to re-run: `add column if not exists`, a guarded constraint,
-- `create or replace`, idempotent revokes and grants. No row is rewritten.

-- ---------------------------------------------------------------------------
-- 1. THE location rule
-- ---------------------------------------------------------------------------
-- NULL when the four stored values may coexist, otherwise the first broken
-- rule:
--   INVALID_VISIBILITY   not NULL and not FULL_ADDRESS / CITY_ONLY / HIDDEN
--   INVALID_STREET       not 1 … 200 characters of plain single-line text, or
--                        not in its stored (cleaned) form
--   INVALID_POSTAL_CODE  not 3 … 10 letters or digits, single inner spaces or
--                        hyphens allowed (e.g. 69001, 1000, SW1A 1AA, 12345-678)
--   INVALID_CITY         not 1 … 100 characters of plain single-line text, or
--                        not in its stored (cleaned) form
--   MISSING_STREET       FULL_ADDRESS without a street
--   MISSING_POSTAL_CODE  FULL_ADDRESS without a postal code
--   MISSING_CITY         FULL_ADDRESS or CITY_ONLY without a city
-- HIDDEN and NULL require nothing: what is stored stays private.
-- Backs the table's CHECK AND the owner RPC, so no writer — the SQL Editor
-- included — can store a level its data cannot honor.
create or replace function public.online_booking_location_issue(
  p_visibility text,
  p_street text,
  p_postal_code text,
  p_city text
) returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_visibility is not null
         and p_visibility not in ('FULL_ADDRESS', 'CITY_ONLY', 'HIDDEN') then 'INVALID_VISIBILITY'
    when p_street is not null
         and (p_street <> public.online_booking_clean_text(p_street)
              or not public.online_booking_is_plain_text(p_street, 200)) then 'INVALID_STREET'
    when p_postal_code is not null
         and (char_length(p_postal_code) not between 3 and 10
              or p_postal_code !~ '^[0-9A-Za-z]+([ -][0-9A-Za-z]+)*$') then 'INVALID_POSTAL_CODE'
    when p_city is not null
         and (p_city <> public.online_booking_clean_text(p_city)
              or not public.online_booking_is_plain_text(p_city, 100)) then 'INVALID_CITY'
    when p_visibility = 'FULL_ADDRESS' and p_street is null then 'MISSING_STREET'
    when p_visibility = 'FULL_ADDRESS' and p_postal_code is null then 'MISSING_POSTAL_CODE'
    when p_visibility in ('FULL_ADDRESS', 'CITY_ONLY') and p_city is null then 'MISSING_CITY'
  end;
$$;

comment on function public.online_booking_location_issue(text, text, text, text) is
  'Online booking: THE location rule — NULL when the publication level and the structured address may coexist, else the first broken rule. Backs the business_booking_profiles CHECK and online_booking_update_location.';

revoke all on function public.online_booking_location_issue(text, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The columns — nullable, no default: every existing row is unconfigured
-- ---------------------------------------------------------------------------
alter table public.business_booking_profiles
  add column if not exists address_visibility text,
  add column if not exists address_street text,
  add column if not exists address_postal_code text,
  add column if not exists address_city text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.business_booking_profiles'::regclass
       and conname = 'business_booking_profiles_location_rule'
  ) then
    alter table public.business_booking_profiles
      add constraint business_booking_profiles_location_rule
      check (public.online_booking_location_issue(
        address_visibility, address_street, address_postal_code, address_city) is null);
  end if;
end;
$$;

comment on column public.business_booking_profiles.address is
  'Online booking: the free-text address of builds that predate the location contract. PRIVATE: read back to the owner only, never returned by online_booking_public_profile (20261020120000).';
comment on column public.business_booking_profiles.address_visibility is
  'Online booking: the publication level of the location chosen by the owner — FULL_ADDRESS, CITY_ONLY or HIDDEN. NULL = never chosen = private.';
comment on column public.business_booking_profiles.address_street is
  'Online booking: street and number. Public only under FULL_ADDRESS.';
comment on column public.business_booking_profiles.address_postal_code is
  'Online booking: postal code. Public only under FULL_ADDRESS.';
comment on column public.business_booking_profiles.address_city is
  'Online booking: city. Public under FULL_ADDRESS and CITY_ONLY.';

-- ---------------------------------------------------------------------------
-- 3. THE public location — what may leave the database
-- ---------------------------------------------------------------------------
-- NULL unless the stored values pass THE location rule AND the level
-- publishes something. Fails closed: a combination the rule refuses publishes
-- nothing, never a degraded part of it. The destination is plain text from
-- the three validated single-line fields; it is never a URL.
create or replace function public.online_booking_public_location(
  p_visibility text,
  p_street text,
  p_postal_code text,
  p_city text
) returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when public.online_booking_location_issue(p_visibility, p_street, p_postal_code, p_city) is not null then null
    when p_visibility = 'FULL_ADDRESS' then jsonb_build_object(
      'visibility', 'FULL_ADDRESS',
      'street', p_street,
      'postal_code', p_postal_code,
      'city', p_city,
      'directions_destination', p_street || ', ' || p_postal_code || ' ' || p_city)
    when p_visibility = 'CITY_ONLY' then jsonb_build_object(
      'visibility', 'CITY_ONLY',
      'city', p_city)
    else null
  end;
$$;

comment on function public.online_booking_public_location(text, text, text, text) is
  'Online booking: THE public location of a profile — { visibility, street, postal_code, city, directions_destination } under FULL_ADDRESS, { visibility, city } under CITY_ONLY, NULL otherwise. Not client-callable.';

revoke all on function public.online_booking_public_location(text, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The owner's view — gains the four stored values (owner only)
-- ---------------------------------------------------------------------------
-- Same signature and keys as 20261015120000, plus address_visibility,
-- address_street, address_postal_code and address_city. The legacy `address`
-- stays in the owner's view: it is her data.
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
    'address_visibility', p.address_visibility,
    'address_street', p.address_street,
    'address_postal_code', p.address_postal_code,
    'address_city', p.address_city,
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

-- ---------------------------------------------------------------------------
-- 5. The owner saves her location and its publication level
-- ---------------------------------------------------------------------------
-- Everything is sent together; a blank text clears the stored value. Texts
-- are stored cleaned (online_booking_clean_text). Needs no subscription and
-- whatever the publication state: the public read applies the level at once.
-- The legacy free-text `address` is never read nor written here. Answers:
--   UPDATED            + the profile (online_booking_owner_profile_json)
--   INVALID_LOCATION   + "reason": INVALID_VISIBILITY (missing or unknown
--                      level — none is ever preselected), or the first rule
--                      THE location rule reports. Nothing is written.
create or replace function public.online_booking_update_location(
  p_business_id uuid,
  p_visibility text,
  p_street text,
  p_postal_code text,
  p_city text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_street text;
  v_postal_code text;
  v_city text;
  v_issue text;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;

  if p_visibility is null or p_visibility not in ('FULL_ADDRESS', 'CITY_ONLY', 'HIDDEN') then
    return jsonb_build_object('status', 'INVALID_LOCATION', 'reason', 'INVALID_VISIBILITY');
  end if;

  v_street := nullif(public.online_booking_clean_text(p_street), '');
  v_postal_code := nullif(public.online_booking_clean_text(p_postal_code), '');
  v_city := nullif(public.online_booking_clean_text(p_city), '');

  v_issue := public.online_booking_location_issue(p_visibility, v_street, v_postal_code, v_city);
  if v_issue is not null then
    return jsonb_build_object('status', 'INVALID_LOCATION', 'reason', v_issue);
  end if;

  insert into public.business_booking_profiles (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  update public.business_booking_profiles set
    address_visibility = p_visibility,
    address_street = v_street,
    address_postal_code = v_postal_code,
    address_city = v_city
  where business_id = p_business_id;

  return jsonb_build_object('status', 'UPDATED')
    || public.online_booking_owner_profile_json(p_business_id);
end;
$$;

comment on function public.online_booking_update_location(uuid, text, text, text, text) is
  'Online booking: the owner saves the structured address of her page and its publication level (FULL_ADDRESS, CITY_ONLY or HIDDEN — always explicit). Needs no subscription. Never touches the legacy free-text address nor the publication state.';

revoke all on function public.online_booking_update_location(uuid, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_update_location(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The website's read — the location as the owner allows it, nothing more
-- ---------------------------------------------------------------------------
-- Same signature, same gate (published AND THE publication rule at read
-- time), same NULL for every page that is not online. The legacy free-text
-- `address` column is NOT read any more. Keys:
--   location   online_booking_public_location — NULL for HIDDEN and unconfigured
--   address    compatibility alias for websites deployed before this
--              migration: the complete address on two lines (street, then
--              postal code and city) under FULL_ADDRESS, NULL otherwise —
--              built from `location`, so it can never say more than it
-- Every other key is unchanged.
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
    'address', case when l.location ->> 'visibility' = 'FULL_ADDRESS'
                    then (l.location ->> 'street') || E'\n'
                         || (l.location ->> 'postal_code') || ' ' || (l.location ->> 'city') end,
    'location', l.location,
    'logo_path', p.logo_path,
    'cover_path', p.cover_path,
    'time_zone', p.time_zone,
    'booking_enabled', p.booking_enabled)
    from public.business_booking_profiles p
    join public.businesses b on b.id = p.business_id
    cross join lateral (
      select public.online_booking_public_location(
        p.address_visibility, p.address_street, p.address_postal_code, p.address_city) as location
    ) l
   where p.slug = lower(btrim(p_slug))
     and p.published
     and public.online_booking_may_be_public(p.business_id);
$$;

comment on function public.online_booking_public_profile(text) is
  'Online booking: the public profile behind a slug — approved public fields only, the location as its publication level allows (20261020120000) — or NULL when no page is online there. service_role only (the website server).';

revoke all on function public.online_booking_public_profile(text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_public_profile(text) to service_role;
