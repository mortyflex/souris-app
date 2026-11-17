-- BeautIzzy — Online booking: service publication and public service metadata
--
-- The professional chooses, herself, which of her EXISTING catalogue services
-- may be booked online — and the public service list says what a customer
-- needs to choose one: its description, its price and its category.
--
--   rules (no API role)
--     online_booking_service_issue(active, deleted_at, minutes)   THE eligibility rule
--     online_booking_public_text(text, max)                       a text as a public page may show it
--     online_booking_service_category_json(business, category)    THE category shape
--     online_booking_public_services(business, service?)          THE public shape of a bookable service
--     online_booking_service_publication_json(business)           the owner's view of her catalogue
--   owner (authenticated, ownership checked first)
--     online_booking_read_service_publication(business)
--     online_booking_set_service_publication(business, service ids, selected)
--   replaced in place (same signature, same privileges)
--     online_booking_bookable_services      its predicate is now THE eligibility rule
--     online_booking_availability_json      each service also carries price_cents,
--                                           description and category
--
-- The choice. `business_bookable_services` (Sprint 3B) stays THE record: one
-- row = the professional selected that service; no row = private. Nothing is
-- copied: the catalogue Service (synced, edited in « Prestations & tarifs »)
-- stays the only source of the name, the price, the phases, the description
-- and the category, and its id stays the identifier. A new Service has no
-- row, so it is never published by itself. Until now the SQL Editor was the
-- only writer; the owner now writes it through ONE function.
--
-- Selected is not bookable. A service is offered only while THE eligibility
-- rule accepts it — active, not deleted, lasting 1 … 720 minutes — and it is
-- decided when the list is READ, never stored:
--   * a selected service that becomes inactive keeps its row and leaves the
--     public list; reactivated, it is offered again without a new choice
--     (the owner's view says « selected, not eligible: INACTIVE »);
--   * a deleted (tombstoned) service is never offered and never listed; its
--     row is removed at the owner's next change of the selection;
--   * selecting needs a service that is eligible NOW — a choice already made
--     is never judged again, so a repeated request stays a no-op.
--
-- Ownership. Both owner functions start with is_business_owner (42501
-- otherwise). A service id is looked up inside THAT Business only: an id of
-- another Business and an id that does not exist get the same UNKNOWN_SERVICE
-- and nothing is written. Editing the selection needs NO subscription — like
-- the draft of the page. What the public may see is still decided at every
-- public read by the existing gate (published, booking_enabled, the operator
-- switch and verified Plus access): this migration does not touch it.
--
-- Locking. The write locks THE Business row booking creation locks
-- (business_booking_profiles … FOR UPDATE), so a change of the selection and
-- a booking in flight are serialized: the booking commits first and stays, or
-- the selection commits first and the booking is refused (UNKNOWN_SERVICE,
-- nothing written). It takes no lock of its own on a synced table. The one
-- lock it shares with the sync is the foreign key's: selecting a service
-- holds a key-share on THAT service row until this short transaction ends,
-- so a push of that very service waits for it and then applies — never
-- refused; a push of anything else, and a withdrawal, wait for nothing.
--
-- The public contract. online_booking_public_availability(slug, service, date)
-- keeps its signature, its grant and its gate. Each service of its answer —
-- `services[]` and `service` — keeps `id`, `name` and `duration_minutes`
-- exactly as before, in the same order (name, id), and GAINS:
--     price_cents   the catalogue price, in cents. 0 is NOT « free »: the
--                   catalogue cannot tell a free service from a price that
--                   was never set, so a client shows « Tarif à confirmer ».
--     description   the Service description as plain text, or null: line
--                   endings normalized to \n, at most one blank line in a
--                   row, no control character and no bidirectional override,
--                   at most 1000 characters (the catalogue's own limit).
--                   Never markup: a client shows it as text.
--     category      { id, name, position } of the professional's category, or
--                   null (none, or one that no longer exists).
-- Only bookable services are ever listed. No phase, no type, no active flag,
-- no category description, no Business id. A website deployed before this
-- migration reads the three original keys and ignores the rest.
--
-- Booking creation (online_booking_create_booking, online_booking_book), the
-- slot rule (online_booking_compute_slots, online_booking_slot_is_available)
-- and the request limits are NOT redefined: ONE service per booking, as
-- before. Their one shared dependency, online_booking_bookable_services,
-- answers exactly what it answered.
--
-- Order of application. Requires 20260914120000 (services, service_phases,
-- is_business_owner), 20261010120000 (service_categories, services.category_id
-- and description), 20261015120000 (business_booking_profiles), 20261017120000
-- (the opt-in table, the rules, the availability answer) and 20261018120000
-- (online_booking_clean_text). It does NOT require 20261020120000 (location
-- privacy) and shares no object with it: it never defines
-- online_booking_public_profile nor online_booking_owner_profile_json, reads
-- no address column and alters no table. Either one may be applied first; the
-- result is the same (docs/architecture/ONLINE_BOOKING.md §12.8).
--
-- Only functions: no table, column, constraint, index, trigger, policy, flag
-- or row is created, altered or removed. The only rows it lets anyone write
-- are the owner's own opt-ins. Outside the offline sync: no sync RPC, no
-- aggregate, no payload key. Safe to re-run: `create or replace` only.

-- ---------------------------------------------------------------------------
-- 1. THE eligibility rule of one catalogue service
-- ---------------------------------------------------------------------------
-- NULL when the service could be offered online, else why not. The length
-- limit is THE one of online_booking_rules (Sprint 3B).
create or replace function public.online_booking_service_issue(
  p_active boolean,
  p_deleted_at timestamptz,
  p_minutes integer
) returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_deleted_at is not null then 'DELETED'
    when p_active is not true then 'INACTIVE'
    when coalesce(p_minutes, 0) < 1 then 'NO_DURATION'
    when p_minutes > r.max_service_minutes then 'TOO_LONG'
  end
  from public.online_booking_rules() r;
$$;

comment on function public.online_booking_service_issue(boolean, timestamptz, integer) is
  'Online booking: THE eligibility rule of a catalogue service — NULL when it could be offered online, else DELETED, INACTIVE, NO_DURATION or TOO_LONG. Reads no table. No API role.';

revoke all on function public.online_booking_service_issue(boolean, timestamptz, integer) from public, anon, authenticated, service_role;

-- Bookable = selected AND eligible, decided at each read. Replaced in place:
-- same signature, same rows, same order — its predicate is now THE rule above
-- instead of its own copy of it.
create or replace function public.online_booking_bookable_services(
  p_business_id uuid,
  p_service_id text default null
) returns table (service_id text, name text, duration_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, d.minutes
    from public.business_bookable_services b
    join public.services s
      on s.business_id = b.business_id and s.id = b.service_id
    cross join lateral (
      select coalesce(sum(p.duration_minutes), 0)::integer as minutes
        from public.service_phases p
       where p.business_id = s.business_id and p.service_id = s.id
    ) d
   where b.business_id = p_business_id
     and (p_service_id is null or b.service_id = p_service_id)
     and public.online_booking_service_issue(s.active, s.deleted_at, d.minutes) is null
   order by s.name, s.id;
$$;

comment on function public.online_booking_bookable_services(uuid, text) is
  'Online booking: the services a customer may book — selected by the professional (business_bookable_services) AND accepted by online_booking_service_issue at this instant — with their duration (the sum of their catalog phases). No API role.';

revoke all on function public.online_booking_bookable_services(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A catalogue text as a public page may show it
-- ---------------------------------------------------------------------------
-- The device normalizes a description before it stores it, but the column
-- takes whatever a push sends: the public answer is bounded and cleaned HERE,
-- whoever wrote the row. Plain text in, plain text out — never markup. Line
-- breaks are kept (\r\n, \r and the Unicode line separators become \n; three
-- or more in a row become one blank line); a tab becomes a space; control
-- characters and bidirectional overrides are removed; the edges are trimmed
-- as the device trims them; a text with no visible character is no text.
create or replace function public.online_booking_public_text(p_text text, p_max integer)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when t.cleaned ~ '[^\s\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]' then t.cleaned
  end
  from (
    select public.online_booking_clean_text(
             left(
               public.online_booking_clean_text(
                 regexp_replace(
                   regexp_replace(
                     regexp_replace(
                       regexp_replace(coalesce(p_text, ''), '\r\n?|[\u2028\u2029]', E'\n', 'g'),
                       '\t', ' ', 'g'),
                     '[\x01-\x09\x0B-\x1F\x7F-\x9F\u202A-\u202E\u2066-\u2069]', '', 'g'),
                   '\n{3,}', E'\n\n', 'g')),
               greatest(coalesce(p_max, 0), 0))) as cleaned
  ) t;
$$;

comment on function public.online_booking_public_text(text, integer) is
  'Online booking: a catalogue text as a public page may show it — plain text, line breaks kept and normalized, no control character or bidirectional override, trimmed, at most p_max characters; NULL when nothing visible remains. No API role.';

revoke all on function public.online_booking_public_text(text, integer) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. THE category shape — the owner's view and the public list share it
-- ---------------------------------------------------------------------------
-- NULL for no category and for a category that no longer exists: the
-- reference is catalogue metadata, never a constraint (docs/domain/SERVICES.md
-- §11.1). The category's own description is never returned.
create or replace function public.online_booking_service_category_json(
  p_business_id uuid,
  p_category_id text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'position', c.position)
    from public.service_categories c
   where c.business_id = p_business_id
     and c.id = p_category_id
     and c.deleted_at is null;
$$;

comment on function public.online_booking_service_category_json(uuid, text) is
  'Online booking: { id, name, position } of a live category of this Business, or NULL. No API role.';

revoke all on function public.online_booking_service_category_json(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. THE public shape of a bookable service
-- ---------------------------------------------------------------------------
-- Built on online_booking_bookable_services, so a service that is not
-- bookable can never appear here. Same order as before: name, then id.
-- The description is bounded by the catalogue's own limit
-- (SERVICE_DESCRIPTION_MAX_LENGTH, src/domain/services/description.ts).
create or replace function public.online_booking_public_services(
  p_business_id uuid,
  p_service_id text default null
) returns table (service_id text, name text, service jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select b.service_id,
         b.name,
         jsonb_build_object(
           'id', b.service_id,
           'name', b.name,
           'duration_minutes', b.duration_minutes,
           'price_cents', s.price_cents,
           'description', public.online_booking_public_text(s.description, 1000),
           'category', public.online_booking_service_category_json(s.business_id, s.category_id))
    from public.online_booking_bookable_services(p_business_id, p_service_id) b
    join public.services s
      on s.business_id = p_business_id and s.id = b.service_id
   order by b.name, b.service_id;
$$;

comment on function public.online_booking_public_services(uuid, text) is
  'Online booking: THE public shape of each bookable service of a Business — id, name, duration_minutes, price_cents (0 = not confirmed, never « free »), description (plain text or null) and category ({ id, name, position } or null). Bookable services only. No API role.';

revoke all on function public.online_booking_public_services(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The public answer — the same answer, each service with its metadata
-- ---------------------------------------------------------------------------
-- Replaced in place: same signature, same statuses, same window, same slots.
-- `services[]` and `service` are now built by online_booking_public_services.
create or replace function public.online_booking_availability_json(
  p_business_id uuid,
  p_service_id text,
  p_date date,
  p_now timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
  v_slot_minutes integer;
  v_first_date date;
  v_last_date date;
  v_answer jsonb;
  v_service record;
  v_slots jsonb;
  v_service_id text := nullif(btrim(coalesce(p_service_id, '')), '');
begin
  select p.time_zone into v_time_zone
    from public.business_booking_profiles p
   where p.business_id = p_business_id;
  if v_time_zone is null or p_now is null then
    return null;
  end if;

  select r.slot_minutes into v_slot_minutes from public.online_booking_rules() r;
  select w.first_date, w.last_date into v_first_date, v_last_date
    from public.online_booking_window(v_time_zone, p_now) w;

  v_answer := jsonb_build_object(
    'time_zone', v_time_zone,
    'slot_minutes', v_slot_minutes,
    'first_date', to_char(v_first_date, 'YYYY-MM-DD'),
    'last_date', to_char(v_last_date, 'YYYY-MM-DD'),
    'services', coalesce(
      (select jsonb_agg(s.service order by s.name, s.service_id)
         from public.online_booking_public_services(p_business_id, null) s),
      '[]'::jsonb));

  if v_service_id is null then
    return v_answer || jsonb_build_object('status', 'CHOOSE_SERVICE');
  end if;

  select s.service_id, s.service into v_service
    from public.online_booking_public_services(p_business_id, v_service_id) s;
  if not found then
    return v_answer || jsonb_build_object('status', 'UNKNOWN_SERVICE');
  end if;

  v_answer := v_answer || jsonb_build_object('service', v_service.service);

  if p_date is null then
    return v_answer || jsonb_build_object('status', 'CHOOSE_DATE');
  end if;

  v_answer := v_answer || jsonb_build_object('date', to_char(p_date, 'YYYY-MM-DD'));
  if p_date < v_first_date or p_date > v_last_date then
    return v_answer || jsonb_build_object('status', 'OUT_OF_WINDOW');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'starts_at', to_char(s.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'ends_at', to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'local_time', s.local_time)
         order by s.starts_at), '[]'::jsonb)
    into v_slots
    from public.online_booking_compute_slots(p_business_id, v_service.service_id, p_date, p_now) s;

  return v_answer || jsonb_build_object('status', 'SLOTS', 'slots', v_slots);
end;
$$;

comment on function public.online_booking_availability_json(uuid, text, date, timestamptz) is
  'Online booking: the public availability answer of a Business at a given instant — window, bookable services in their public shape (online_booking_public_services), and the slots of one service on one local date. No API role.';

revoke all on function public.online_booking_availability_json(uuid, text, date, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The owner's view of her catalogue
-- ---------------------------------------------------------------------------
-- { max_service_minutes, selected_count, bookable_count, services: [{ id,
--   name, type, active, price_cents, duration_minutes, description, category,
--   selected, eligible, ineligible_reason, bookable }] } — every LIVE service
-- of the Business (a deleted one is gone from her catalogue), by name then
-- id. `selected` is her choice, `eligible` THE rule, `bookable` both: exactly
-- the services the public list holds. `description` and `category` are the
-- public forms, so she sees what a customer would.
create or replace function public.online_booking_service_publication_json(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with catalogue as (
    select s.id,
           s.name,
           s.type,
           s.active,
           s.price_cents,
           d.minutes,
           public.online_booking_public_text(s.description, 1000) as description,
           public.online_booking_service_category_json(s.business_id, s.category_id) as category,
           exists (
             select 1 from public.business_bookable_services b
              where b.business_id = s.business_id and b.service_id = s.id) as selected,
           public.online_booking_service_issue(s.active, s.deleted_at, d.minutes) as issue
      from public.services s
      cross join lateral (
        select coalesce(sum(p.duration_minutes), 0)::integer as minutes
          from public.service_phases p
         where p.business_id = s.business_id and p.service_id = s.id
      ) d
     where s.business_id = p_business_id
       and s.deleted_at is null
  )
  select jsonb_build_object(
    'max_service_minutes', (select r.max_service_minutes from public.online_booking_rules() r),
    'selected_count', (select count(*) from catalogue c where c.selected),
    'bookable_count', (select count(*) from catalogue c where c.selected and c.issue is null),
    'services', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'type', c.type,
                'active', c.active,
                'price_cents', c.price_cents,
                'duration_minutes', c.minutes,
                'description', c.description,
                'category', c.category,
                'selected', c.selected,
                'eligible', c.issue is null,
                'ineligible_reason', c.issue,
                'bookable', c.selected and c.issue is null)
              order by c.name, c.id)
         from catalogue c),
      '[]'::jsonb));
$$;

comment on function public.online_booking_service_publication_json(uuid) is
  'Online booking: the owner''s view of her live catalogue for online booking — each service with her choice (selected), THE eligibility rule (eligible, ineligible_reason) and whether it is offered (bookable). Reads only. No API role: the owner RPCs call it after checking ownership.';

revoke all on function public.online_booking_service_publication_json(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Owner RPCs
-- ---------------------------------------------------------------------------
-- The owner reads her catalogue with her choices. Writes nothing — not even
-- the draft of the page.
create or replace function public.online_booking_read_service_publication(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;
  return public.online_booking_service_publication_json(p_business_id);
end;
$$;

comment on function public.online_booking_read_service_publication(uuid) is
  'Online booking: the owner reads her live catalogue services with their online-booking choice and eligibility. Needs no subscription. Writes nothing.';

revoke all on function public.online_booking_read_service_publication(uuid) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_read_service_publication(uuid) to authenticated;

-- The owner selects (p_selected = true) or withdraws (false) one or several of
-- her services — ONE service is an array of one; « Tout proposer » and « Tout
-- retirer » send the ids the screen shows, never « everything »: a service
-- she has not seen is never swept in. All or nothing.
--   UPDATED          + the owner's view (online_booking_service_publication_json)
--   UNKNOWN_SERVICE  + service_id: not a live service of THIS Business
--                    (another Business's id and an unknown id read the same)
--   NOT_ELIGIBLE     + service_id, reason: selecting needs a service THE rule
--                    accepts now; one already selected is never judged again
-- Withdrawing never needs eligibility. A repeated request changes nothing.
create or replace function public.online_booking_set_service_publication(
  p_business_id uuid,
  p_service_ids text[],
  p_selected boolean
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_locked uuid;
  v_unknown text;
  v_refused record;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;
  if p_selected is null
     or p_service_ids is null
     or coalesce(array_ndims(p_service_ids), 0) <> 1
     or cardinality(p_service_ids) not between 1 and 200
     or exists (
          select 1 from unnest(p_service_ids) as u(id)
           where u.id is null or char_length(u.id) not between 1 and 200) then
    raise exception 'online booking: a choice and 1 to 200 service ids are required' using errcode = '22023';
  end if;

  select array_agg(distinct u.id order by u.id) into v_ids
    from unnest(p_service_ids) as u(id);

  -- THE Business lock of booking creation (online_booking_book): a change of
  -- the selection and a booking in flight are serialized. The row is the
  -- same empty, unpublished draft the first read of the page creates.
  insert into public.business_booking_profiles (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  select p.business_id into v_locked
    from public.business_booking_profiles p
   where p.business_id = p_business_id
     for update;

  -- Every id is a live service of THIS Business, or nothing is written.
  select u.id into v_unknown
    from unnest(v_ids) as u(id)
   where not exists (
           select 1 from public.services s
            where s.business_id = p_business_id and s.id = u.id and s.deleted_at is null)
   order by u.id
   limit 1;
  if v_unknown is not null then
    return jsonb_build_object('status', 'UNKNOWN_SERVICE', 'service_id', v_unknown);
  end if;

  if p_selected then
    select s.id, public.online_booking_service_issue(s.active, s.deleted_at, d.minutes) as issue
      into v_refused
      from public.services s
      cross join lateral (
        select coalesce(sum(p.duration_minutes), 0)::integer as minutes
          from public.service_phases p
         where p.business_id = s.business_id and p.service_id = s.id
      ) d
     where s.business_id = p_business_id
       and s.id = any (v_ids)
       and public.online_booking_service_issue(s.active, s.deleted_at, d.minutes) is not null
       and not exists (
             select 1 from public.business_bookable_services b
              where b.business_id = s.business_id and b.service_id = s.id)
     order by s.id
     limit 1;
    if found then
      return jsonb_build_object(
        'status', 'NOT_ELIGIBLE', 'service_id', v_refused.id, 'reason', v_refused.issue);
    end if;

    insert into public.business_bookable_services (business_id, service_id)
    select p_business_id, u.id from unnest(v_ids) as u(id)
    on conflict (business_id, service_id) do nothing;
  else
    delete from public.business_bookable_services b
     where b.business_id = p_business_id
       and b.service_id = any (v_ids);
  end if;

  -- The choice of a deleted service does not outlive her next change.
  delete from public.business_bookable_services b
   where b.business_id = p_business_id
     and not exists (
           select 1 from public.services s
            where s.business_id = b.business_id and s.id = b.service_id and s.deleted_at is null);

  return jsonb_build_object('status', 'UPDATED')
    || public.online_booking_service_publication_json(p_business_id);
end;
$$;

comment on function public.online_booking_set_service_publication(uuid, text[], boolean) is
  'Online booking: the owner selects or withdraws one or several of her own catalogue services for online booking, all or nothing, under the Business lock of booking creation. Answers UPDATED + her view, UNKNOWN_SERVICE (not a live service of this Business) or NOT_ELIGIBLE + reason (selecting an inactive or unbookable service). Needs no subscription; what the public sees stays behind the publication gate.';

revoke all on function public.online_booking_set_service_publication(uuid, text[], boolean) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_set_service_publication(uuid, text[], boolean) to authenticated;
