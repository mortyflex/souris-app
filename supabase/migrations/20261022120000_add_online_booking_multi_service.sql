-- BeautIzzy — Online booking: several services in ONE appointment (catalogue unit D1)
--
-- A customer may book an ORDERED selection of 1 to 8 distinct bookable
-- services as ONE Appointment holding one item per service, in her order,
-- each item with its own phases — the Appointment the app itself builds
-- (src/features/appointments/creation/build-appointment.ts). Database and
-- server contract only: the website keeps its single-service flow until its
-- own unit (D2) calls these functions.
--
--   rules (no API role)
--     online_booking_compute_slots_for_minutes(business, minutes, date, now)  THE slot rule, by length
--     online_booking_compute_slots(business, service, date, now)              replaced in place: delegates
--     online_booking_minutes_slot_is_available(business, minutes, start, now) revalidation of one start
--     online_booking_selection_rules()                  THE selection limits (8 services, 720 minutes)
--     online_booking_selection_issue(service ids)       THE shape rule of a selection
--     online_booking_resolve_selection(business, ids)   the bookable services of a selection, in order
--     online_booking_selection_fingerprint(snapshot)    what the customer was shown, hashed
--     online_booking_selection_availability_json(business, ids, date, now)
--     online_booking_selection_request_issue(…)          THE validation rule of a selection booking
--     online_booking_selection_booking_json(booking)     the public answer of one selection booking
--     online_booking_book_selection(…, now)             THE selection booking transaction
--   website (service_role only)
--     online_booking_public_selection_availability(slug, service ids, date?)
--     online_booking_create_selection_booking(slug, service ids, start, first name, last name,
--                                             email, phone, selection fingerprint, idempotency key)
--   table (additive)
--     online_bookings.services       nullable jsonb — the ordered snapshot of a selection booking
--     online_bookings.service_id / service_name   NOT NULL relaxed: NULL on a selection booking
--     online_bookings_shape          CHECK: exactly one representation per record
--
-- Scheduling — the domain's own rule (APPOINTMENTS.md, calculateAppointmentTimeline):
-- the items of an Appointment run one after the other, in their order, each
-- through its ordered phases. The selection therefore lasts the SUM of its
-- services' catalogue phases — waiting phases included — and occupies that
-- whole span, exactly as an appointment occupies its full span in the slot
-- rule (online_booking_busy_intervals, conservative: nothing is booked during
-- a waiting phase). A selection is offered a start only when the WHOLE span
-- fits inside one working interval and meets no busy interval: THE slot rule,
-- now written once by length (online_booking_compute_slots_for_minutes) and
-- used by the single service (its catalogue length) and by a selection (the
-- sum). online_booking_compute_slots keeps its signature and its answers
-- (shown identical before and after this migration on a populated database).
--
-- Order: the customer's. Items are written in the order of the ids sent
-- (item_order 0, 1, 2…), never sorted; the order is part of the request and
-- of its idempotency fingerprint.
--
-- Prices, durations and names are the catalogue's at the instant of the
-- booking, decided under the Business lock — never read from the caller.
-- The availability answer carries a `fingerprint` of what the customer was
-- shown (each service's id, name, length and price, in order); the booking
-- sends it back, and a selection whose catalogue details changed meanwhile
-- answers SELECTION_CHANGED and books nothing.
--
-- Security, the Sprint 2 – 3C model: the two website functions are granted to
-- service_role only, keyed by the public slug, behind the same publication
-- gate (published, booking_enabled, online_booking_may_be_public at read
-- time) and the same operator switch for creation (ONLINE_BOOKING_CREATION);
-- every other function is granted to nobody; no table privilege changes.
--
-- Order of application: requires 20261015 (profiles), 20261016 (working
-- hours), 20261017 (the slot rule), 20261018 (booking creation, online_bookings,
-- clean_text, the client rule) and 20261021 (service publication: the
-- eligibility rule and the public service shape). It does NOT require
-- 20261020 (location privacy) and shares no object with it: either order
-- gives the same result.
--
-- Only adds objects, replaces ONE function in place (online_booking_compute_slots,
-- same signature, same answers) and relaxes two NOT NULL columns of a
-- server-only table behind a CHECK every existing row satisfies. No row is
-- written, no flag is flipped, no sync RPC is touched. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. THE slot rule, by length — one place for the single service and the selection
-- ---------------------------------------------------------------------------
-- The body of the Sprint 3B rule, the service's length now a parameter: the
-- starts offered for `p_minutes` on the local date `p_date`, seen at `p_now`.
-- Empty for a length outside 1 … max_service_minutes, an unknown Business,
-- a date outside the window. Deterministic.
create or replace function public.online_booking_compute_slots_for_minutes(
  p_business_id uuid,
  p_minutes integer,
  p_date date,
  p_now timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz, local_time text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_slot_minutes integer;
  v_notice_minutes integer;
  v_max_minutes integer;
  v_time_zone text;
  v_first_date date;
  v_last_date date;
begin
  if p_business_id is null or p_minutes is null or p_date is null or p_now is null then
    return;
  end if;

  select r.slot_minutes, r.minimum_notice_minutes, r.max_service_minutes
    into v_slot_minutes, v_notice_minutes, v_max_minutes
    from public.online_booking_rules() r;
  if p_minutes < 1 or p_minutes > v_max_minutes then
    return;
  end if;

  select p.time_zone into v_time_zone
    from public.business_booking_profiles p
   where p.business_id = p_business_id;
  if v_time_zone is null then
    return;
  end if;

  select w.first_date, w.last_date into v_first_date, v_last_date
    from public.online_booking_window(v_time_zone, p_now) w;
  if p_date < v_first_date or p_date > v_last_date then
    return;
  end if;

  return query
    with working as (
      select w.starts_at as work_start, w.ends_at as work_end
        from public.online_booking_working_intervals(p_business_id, p_date, p_date) w
    ),
    candidates as (
      select g.local_minute,
             (p_date + make_interval(mins => g.local_minute)) at time zone v_time_zone as slot_start
        from generate_series(0, 24 * 60 - v_slot_minutes, v_slot_minutes) as g(local_minute)
       -- A wall-clock time that does not exist never comes back as itself.
       where ((p_date + make_interval(mins => g.local_minute)) at time zone v_time_zone) at time zone v_time_zone
             = p_date + make_interval(mins => g.local_minute)
    ),
    busy as (
      select b.starts_at as busy_start, b.ends_at as busy_end
        from public.online_booking_busy_intervals(
               p_business_id,
               (select min(work_start) from working),
               (select max(work_end) from working)) b
    )
    select c.slot_start,
           c.slot_start + make_interval(mins => p_minutes),
           lpad((c.local_minute / 60)::text, 2, '0') || ':' || lpad((c.local_minute % 60)::text, 2, '0')
      from candidates c
     where c.slot_start >= p_now + make_interval(mins => v_notice_minutes)
       and exists (
             select 1 from working w
              where w.work_start <= c.slot_start
                and c.slot_start + make_interval(mins => p_minutes) <= w.work_end)
       and not exists (
             select 1 from busy b
              where b.busy_start < c.slot_start + make_interval(mins => p_minutes)
                and c.slot_start < b.busy_end)
     order by c.slot_start;
end;
$$;

comment on function public.online_booking_compute_slots_for_minutes(uuid, integer, date, timestamptz) is
  'Online booking: THE slot rule, by length — the starts offered for an appointment of p_minutes on a local date at a given instant: whole span inside one working interval, notice and horizon, 15-minute local grid, DST-safe, conservative blocking by appointments (full span) and calendar blocks. Read-only. No API role.';

revoke all on function public.online_booking_compute_slots_for_minutes(uuid, integer, date, timestamptz) from public, anon, authenticated, service_role;

-- Replaced in place: the same signature and the same answers — the single
-- service's catalogue length handed to THE rule above.
create or replace function public.online_booking_compute_slots(
  p_business_id uuid,
  p_service_id text,
  p_date date,
  p_now timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz, local_time text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_duration integer;
begin
  if p_business_id is null or p_service_id is null or p_date is null or p_now is null then
    return;
  end if;

  select s.duration_minutes into v_duration
    from public.online_booking_bookable_services(p_business_id, p_service_id) s;
  if v_duration is null then
    return;
  end if;

  return query
    select s.starts_at, s.ends_at, s.local_time
      from public.online_booking_compute_slots_for_minutes(p_business_id, v_duration, p_date, p_now) s
     order by s.starts_at;
end;
$$;

comment on function public.online_booking_compute_slots(uuid, text, date, timestamptz) is
  'Online booking: the starts offered for ONE bookable service on a local date at a given instant — THE slot rule (online_booking_compute_slots_for_minutes) applied to its catalogue length. Read-only. No API role.';

revoke all on function public.online_booking_compute_slots(uuid, text, date, timestamptz) from public, anon, authenticated, service_role;

-- Whether ONE start would still be offered for an appointment of p_minutes —
-- the revalidation the selection booking runs under the Business lock.
create or replace function public.online_booking_minutes_slot_is_available(
  p_business_id uuid,
  p_minutes integer,
  p_starts_at timestamptz,
  p_now timestamptz
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select exists (
      select 1
        from public.online_booking_compute_slots_for_minutes(
               p_business_id, p_minutes, (p_starts_at at time zone p.time_zone)::date, p_now) s
       where s.starts_at = p_starts_at)
      from public.business_booking_profiles p
     where p.business_id = p_business_id), false);
$$;

comment on function public.online_booking_minutes_slot_is_available(uuid, integer, timestamptz, timestamptz) is
  'Online booking: whether one start is still offered by THE slot rule for an appointment of p_minutes — called by the selection booking after locking the Business. No API role.';

revoke all on function public.online_booking_minutes_slot_is_available(uuid, integer, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. THE selection rules
-- ---------------------------------------------------------------------------
-- At most 8 distinct services; at most the length of the longest bookable
-- service (online_booking_rules, 12 hours) for the whole selection.
create or replace function public.online_booking_selection_rules()
returns table (max_services integer, max_minutes integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select 8, r.max_service_minutes from public.online_booking_rules() r;
$$;

comment on function public.online_booking_selection_rules() is
  'Online booking: THE selection limits — 8 distinct services, the booking rules'' maximum length (12 hours) for the whole selection.';

revoke all on function public.online_booking_selection_rules() from public, anon, authenticated, service_role;

-- NULL when the ids can form a selection, else why not. A pure rule of the
-- input: it reads no table, so it says nothing about any Business.
--   EMPTY       no id
--   MALFORMED   not one list, a null or blank id, edge spaces, more than 200 characters
--   TOO_MANY    more than 8 ids
--   DUPLICATE   the same id twice — one occurrence of each service
create or replace function public.online_booking_selection_issue(p_service_ids text[])
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_service_ids is null or cardinality(p_service_ids) = 0 then 'EMPTY'
    when array_ndims(p_service_ids) <> 1 then 'MALFORMED'
    when cardinality(p_service_ids) > (select l.max_services from public.online_booking_selection_rules() l) then 'TOO_MANY'
    when exists (
           select 1 from unnest(p_service_ids) as u(id)
            where u.id is null or char_length(u.id) not between 1 and 200 or u.id <> btrim(u.id)) then 'MALFORMED'
    when (select count(distinct u.id) from unnest(p_service_ids) as u(id)) <> cardinality(p_service_ids) then 'DUPLICATE'
  end;
$$;

comment on function public.online_booking_selection_issue(text[]) is
  'Online booking: THE shape rule of a selection — NULL, or EMPTY, MALFORMED, TOO_MANY (more than 8) or DUPLICATE. Reads no table.';

revoke all on function public.online_booking_selection_issue(text[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. A selection, resolved against the bookable services — in HER order
-- ---------------------------------------------------------------------------
-- One row per id that names a bookable service of THIS Business (selected by
-- the professional AND eligible: online_booking_bookable_services, through
-- the public shape of 20261021), with the catalogue facts of this instant —
-- and `snapshot`, what is booked of it: { id, name, duration_minutes,
-- price_cents }. An id that is not bookable has no row: the callers compare
-- the counts.
create or replace function public.online_booking_resolve_selection(
  p_business_id uuid,
  p_service_ids text[]
) returns table (
  item_order integer,
  service_id text,
  name text,
  type text,
  price_cents integer,
  duration_minutes integer,
  service jsonb,
  snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select (u.ordinality - 1)::integer,
         s.id,
         s.name,
         s.type,
         s.price_cents,
         (p.service ->> 'duration_minutes')::integer,
         p.service,
         jsonb_build_object('id', s.id, 'name', s.name,
                            'duration_minutes', (p.service ->> 'duration_minutes')::integer,
                            'price_cents', s.price_cents)
    from unnest(p_service_ids) with ordinality as u(id, ordinality)
    join public.online_booking_public_services(p_business_id, null) p on p.service_id = u.id
    join public.services s on s.business_id = p_business_id and s.id = u.id
   order by u.ordinality;
$$;

comment on function public.online_booking_resolve_selection(uuid, text[]) is
  'Online booking: the bookable services of a selection of this Business, in the order given, with their catalogue name, type, price, length, public shape and booked snapshot at this instant; an id that is not bookable has no row. No API role.';

revoke all on function public.online_booking_resolve_selection(uuid, text[]) from public, anon, authenticated, service_role;

-- What the customer was shown of her selection — the ordered snapshots
-- (each service's id, name, length and price, in her order) — hashed. Shown
-- with the availability, sent back with the booking, which compares it with
-- the snapshots it is about to write, read in ONE statement under the lock:
-- a difference means the catalogue changed meanwhile. The description and the
-- category are not part of it: they change nothing of what is booked. The
-- `services` of a selection record hash to the fingerprint it was booked with.
create or replace function public.online_booking_selection_fingerprint(p_snapshot jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(sha256(convert_to('selection-v1' || coalesce(p_snapshot, '[]'::jsonb)::text, 'UTF8')), 'hex');
$$;

comment on function public.online_booking_selection_fingerprint(jsonb) is
  'Online booking: sha256 of the ordered snapshots of a selection ([{ id, name, duration_minutes, price_cents }]) — what the customer is shown, and what is booked. No API role.';

revoke all on function public.online_booking_selection_fingerprint(jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The availability of a selection — the public answer
-- ---------------------------------------------------------------------------
-- { time_zone, slot_minutes, first_date, last_date, services: [public shape…],
--   status, … } where status is, in this order of decision:
--   INVALID_SELECTION   + reason (online_booking_selection_issue)
--   UNKNOWN_SERVICE     + service_id: the first id that is not a bookable
--                       service of this page, whatever the reason
--   SELECTION_TOO_LONG  + selection, max_minutes: longer than 12 hours
--   DOES_NOT_FIT        + selection, longest_interval_minutes: longer than any
--                       working interval of the window — no date can fit it
--   CHOOSE_DATE         + selection
--   OUT_OF_WINDOW       + selection, date
--   SLOTS               + selection, date, slots: [{ starts_at, ends_at, local_time }]
-- selection = { services: [public shape, in her order], duration_minutes, fingerprint }
create or replace function public.online_booking_selection_availability_json(
  p_business_id uuid,
  p_service_ids text[],
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
  v_max_minutes integer;
  v_first_date date;
  v_last_date date;
  v_answer jsonb;
  v_issue text;
  v_missing text;
  v_minutes integer;
  v_services jsonb;
  v_snapshot jsonb;
  v_selection jsonb;
  v_longest integer;
  v_slots jsonb;
begin
  select p.time_zone into v_time_zone
    from public.business_booking_profiles p
   where p.business_id = p_business_id;
  if v_time_zone is null or p_now is null then
    return null;
  end if;

  select r.slot_minutes into v_slot_minutes from public.online_booking_rules() r;
  select l.max_minutes into v_max_minutes from public.online_booking_selection_rules() l;
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

  v_issue := public.online_booking_selection_issue(p_service_ids);
  if v_issue is not null then
    return v_answer || jsonb_build_object('status', 'INVALID_SELECTION', 'reason', v_issue);
  end if;

  select u.id into v_missing
    from unnest(p_service_ids) with ordinality as u(id, ordinality)
   where not exists (select 1 from public.online_booking_bookable_services(p_business_id, u.id))
   order by u.ordinality
   limit 1;
  if v_missing is not null then
    return v_answer || jsonb_build_object('status', 'UNKNOWN_SERVICE', 'service_id', v_missing);
  end if;

  select coalesce(sum(r.duration_minutes), 0)::integer,
         jsonb_agg(r.service order by r.item_order),
         jsonb_agg(r.snapshot order by r.item_order)
    into v_minutes, v_services, v_snapshot
    from public.online_booking_resolve_selection(p_business_id, p_service_ids) r;
  v_selection := jsonb_build_object(
    'services', v_services,
    'duration_minutes', v_minutes,
    'fingerprint', public.online_booking_selection_fingerprint(v_snapshot));

  if v_minutes > v_max_minutes then
    return v_answer || jsonb_build_object('status', 'SELECTION_TOO_LONG', 'selection', v_selection, 'max_minutes', v_max_minutes);
  end if;

  -- Longer than every working interval of the window: no date can ever offer
  -- it — said once, instead of every date answering an empty day. A Business
  -- without any working interval in the window answers empty days, exactly as
  -- for one service: its selection is not "too long", its agenda is closed.
  select coalesce(max(round(extract(epoch from (w.ends_at - w.starts_at)) / 60)), 0)::integer
    into v_longest
    from public.online_booking_working_intervals(p_business_id, v_first_date, v_last_date) w;
  if v_longest > 0 and v_minutes > v_longest then
    return v_answer || jsonb_build_object('status', 'DOES_NOT_FIT', 'selection', v_selection, 'longest_interval_minutes', v_longest);
  end if;

  v_answer := v_answer || jsonb_build_object('selection', v_selection);
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
    from public.online_booking_compute_slots_for_minutes(p_business_id, v_minutes, p_date, p_now) s;

  return v_answer || jsonb_build_object('status', 'SLOTS', 'slots', v_slots);
end;
$$;

comment on function public.online_booking_selection_availability_json(uuid, text[], date, timestamptz) is
  'Online booking: the public availability answer of an ordered selection of services of a Business at a given instant — the selection validated and resolved (public shapes, total length, fingerprint), then the starts of THE slot rule for its whole length on one local date. No API role.';

revoke all on function public.online_booking_selection_availability_json(uuid, text[], date, timestamptz) from public, anon, authenticated, service_role;

-- The website's read — ONE narrowly scoped entry point, the gate of the
-- single-service read: NULL for an unknown or malformed slug, a draft, a page
-- that does not accept bookings, a lapsed subscription, the switch off.
create or replace function public.online_booking_public_selection_availability(
  p_slug text,
  p_service_ids text[],
  p_date date default null
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.online_booking_selection_availability_json(p.business_id, p_service_ids, p_date, now())
    from public.business_booking_profiles p
   where p.slug = lower(btrim(p_slug))
     and p.published
     and p.booking_enabled
     and public.online_booking_may_be_public(p.business_id);
$$;

comment on function public.online_booking_public_selection_availability(text, text[], date) is
  'Online booking: the starts offered for an ordered selection of 1 to 8 bookable services of a page that is online AND accepts bookings — or NULL. Public service shapes, total length, fingerprint and times. Read-only. service_role only (the website server).';

revoke all on function public.online_booking_public_selection_availability(text, text[], date) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_public_selection_availability(text, text[], date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The booking record of a selection — additive
-- ---------------------------------------------------------------------------
-- A selection booking keeps its ordered snapshot in `services`
-- ([{ id, name, duration_minutes, price_cents }, …]) and NULL in the two
-- single-service columns, which would otherwise name one service of several.
-- `duration_minutes` is the booked length in both shapes (the sum, for a
-- selection). Every existing row is a single-service record and stays as it is.
alter table public.online_bookings add column if not exists services jsonb;
alter table public.online_bookings alter column service_id drop not null;
alter table public.online_bookings alter column service_name drop not null;

comment on column public.online_bookings.services is
  'Selection bookings only: the ordered snapshot of the booked services [{ id, name, duration_minutes, price_cents }] at booking time. NULL on a single-service record, which names its service in service_id / service_name.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.online_bookings'::regclass
       and conname = 'online_bookings_shape'
  ) then
    alter table public.online_bookings
      add constraint online_bookings_shape check (
        (services is null and service_id is not null and service_name is not null)
        or (services is not null and service_id is null and service_name is null
            and case when jsonb_typeof(services) = 'array'
                     then jsonb_array_length(services) between 1 and 8
                     else false end)
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. THE validation rule of a selection booking — reads no table
-- ---------------------------------------------------------------------------
-- The first unacceptable field, or NULL: the idempotency key, the selection
-- (online_booking_selection_issue), the fingerprint (64 hex digits), then
-- every other field through THE single-service rule (online_booking_request_issue).
create or replace function public.online_booking_selection_request_issue(
  p_service_ids text[],
  p_selection_fingerprint text,
  p_starts_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_idempotency_key text
) returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then 'idempotency_key'
    when public.online_booking_selection_issue(p_service_ids) is not null then 'service_ids'
    when p_selection_fingerprint is null or p_selection_fingerprint !~ '^[0-9a-f]{64}$' then 'selection_fingerprint'
    else public.online_booking_request_issue(
           (select u.id from unnest(p_service_ids) with ordinality as u(id, ordinality) order by u.ordinality limit 1),
           p_starts_at, p_first_name, p_last_name, p_email, p_phone, p_idempotency_key)
  end;
$$;

comment on function public.online_booking_selection_request_issue(text[], text, timestamptz, text, text, text, text, text) is
  'Online booking: THE validation rule of a selection booking request — the first unacceptable field, or NULL. Reads no table.';

revoke all on function public.online_booking_selection_request_issue(text[], text, timestamptz, text, text, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The public answer of one selection booking — from the record only
-- ---------------------------------------------------------------------------
-- The first answer and every replay are identical. A reference, the booked
-- services in order with their snapshot name and length, the total length,
-- the instants and the wall-clock label — never a Business, Client or
-- Appointment id, never an amount (as for one service, §9.2: the prices are
-- recorded, and were shown with the availability).
create or replace function public.online_booking_selection_booking_json(p_booking public.online_bookings)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'BOOKED',
    'booking', jsonb_build_object(
      'reference', p_booking.id,
      'services', (
        select jsonb_agg(jsonb_build_object(
                 'id', e.item ->> 'id',
                 'name', e.item ->> 'name',
                 'duration_minutes', (e.item ->> 'duration_minutes')::integer) order by e.ordinality)
          from jsonb_array_elements(p_booking.services) with ordinality as e(item, ordinality)),
      'duration_minutes', p_booking.duration_minutes,
      'starts_at', to_char(p_booking.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'ends_at', to_char(p_booking.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'local_date', to_char(p_booking.starts_at at time zone p_booking.time_zone, 'YYYY-MM-DD'),
      'local_time', to_char(p_booking.starts_at at time zone p_booking.time_zone, 'HH24:MI'),
      'time_zone', p_booking.time_zone));
$$;

revoke all on function public.online_booking_selection_booking_json(public.online_bookings) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. THE selection booking transaction
-- ---------------------------------------------------------------------------
-- Answers (jsonb), or NULL — the single-service answers (§9.2), plus:
--   INVALID_REQUEST     + field (+ reason for service_ids)
--   UNKNOWN_SERVICE     + service_id: the first id not bookable any more
--   SELECTION_CHANGED   the name, length or price of a selected service is
--                       not what the customer was shown (fingerprint)
--   SELECTION_TOO_LONG  longer than 12 hours
--   BOOKED              + booking (online_booking_selection_booking_json)
-- All or nothing: ONE Appointment, one item per service in her order, each
-- with its catalogue phases; the Client rule and the booking record of §9.
create or replace function public.online_booking_book_selection(
  p_slug text,
  p_service_ids text[],
  p_starts_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_selection_fingerprint text,
  p_idempotency_key text,
  p_now timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_issue text;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_business_id uuid;
  v_locked_slug text;
  v_time_zone text;
  v_first_name text := public.online_booking_clean_text(p_first_name);
  v_last_name text := public.online_booking_clean_text(p_last_name);
  v_email text := public.online_booking_clean_text(p_email);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_request_hash text;
  v_previous_lock_timeout text;
  v_existing public.online_bookings;
  v_missing text;
  v_count integer;
  v_minutes integer;
  v_max_minutes integer;
  v_snapshot jsonb;
  v_items jsonb;
  v_service record;
  v_client_id text;
  v_appointment_id text;
  v_item_id text;
  v_booking public.online_bookings;
  v_answer jsonb;
begin
  if p_now is null then
    raise exception 'online booking: an instant is required' using errcode = '22023';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'online booking: booking creation requires READ COMMITTED' using errcode = '25001';
  end if;

  if not public.online_booking_creation_enabled() then
    return null;
  end if;

  v_issue := public.online_booking_selection_request_issue(
    p_service_ids, p_selection_fingerprint, p_starts_at, p_first_name, p_last_name, p_email, p_phone,
    p_idempotency_key);
  if v_issue = 'service_ids' then
    return jsonb_build_object('status', 'INVALID_REQUEST', 'field', v_issue,
                              'reason', public.online_booking_selection_issue(p_service_ids));
  elsif v_issue is not null then
    return jsonb_build_object('status', 'INVALID_REQUEST', 'field', v_issue);
  end if;

  select p.business_id into v_business_id
    from public.business_booking_profiles p
   where p.slug = v_slug;
  if v_business_id is null then
    return null;
  end if;

  if not exists (select 1 from public.business_booking_profiles p
                  where p.business_id = v_business_id and p.published and p.booking_enabled)
     and not exists (select 1 from public.online_bookings b
                      where b.business_id = v_business_id and b.idempotency_key = p_idempotency_key) then
    return null;
  end if;

  -- The request, canonical: its kind, the ids IN ORDER, what was shown, the
  -- start, the customer. A different order is a different request.
  v_request_hash := encode(sha256(convert_to(concat_ws(E'\n',
    'selection-v1',
    to_jsonb(p_service_ids)::text,
    p_selection_fingerprint,
    to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    public.online_booking_text_key(v_first_name),
    public.online_booking_text_key(v_last_name),
    lower(v_email),
    public.communications_client_phone_e164(v_phone)), 'UTF8')), 'hex');

  v_previous_lock_timeout := current_setting('lock_timeout');
  perform set_config('lock_timeout', '3s', true);

  begin
    -- THE lock of every booking and of the owner's page and selection changes.
    select p.slug, p.time_zone into v_locked_slug, v_time_zone
      from public.business_booking_profiles p
     where p.business_id = v_business_id
       for update;

    select * into v_existing
      from public.online_bookings b
     where b.business_id = v_business_id and b.idempotency_key = p_idempotency_key;
    if v_locked_slug is distinct from v_slug then
      v_answer := null;
    elsif v_existing.id is not null then
      if v_existing.request_hash = v_request_hash then
        v_answer := public.online_booking_selection_booking_json(v_existing);
      else
        v_answer := jsonb_build_object('status', 'IDEMPOTENCY_KEY_REUSED');
      end if;
    elsif not exists (
            select 1 from public.business_booking_profiles p
             where p.business_id = v_business_id and p.published and p.booking_enabled)
          or not public.online_booking_may_be_public(v_business_id, p_now) then
      v_answer := null;
    else
      -- Every service decided AGAIN under the lock, from committed data.
      select u.id into v_missing
        from unnest(p_service_ids) with ordinality as u(id, ordinality)
       where not exists (select 1 from public.online_booking_bookable_services(v_business_id, u.id))
       order by u.ordinality
       limit 1;

      -- ONE read of the catalogue: what is compared with what was shown, what
      -- is recorded and what the items are written from are the same rows.
      select count(*)::integer,
             coalesce(sum(r.duration_minutes), 0)::integer,
             jsonb_agg(r.snapshot order by r.item_order),
             jsonb_agg(jsonb_build_object(
               'item_order', r.item_order, 'service_id', r.service_id, 'name', r.name,
               'type', r.type, 'price_cents', r.price_cents) order by r.item_order)
        into v_count, v_minutes, v_snapshot, v_items
        from public.online_booking_resolve_selection(v_business_id, p_service_ids) r;
      select l.max_minutes into v_max_minutes from public.online_booking_selection_rules() l;

      if v_missing is not null or v_count <> cardinality(p_service_ids) then
        v_answer := jsonb_build_object('status', 'UNKNOWN_SERVICE', 'service_id', v_missing);
      elsif public.online_booking_selection_fingerprint(v_snapshot) <> p_selection_fingerprint then
        v_answer := jsonb_build_object('status', 'SELECTION_CHANGED');
      elsif v_minutes > v_max_minutes then
        v_answer := jsonb_build_object('status', 'SELECTION_TOO_LONG');
      elsif not public.online_booking_minutes_slot_is_available(v_business_id, v_minutes, p_starts_at, p_now) then
        v_answer := jsonb_build_object('status', 'SLOT_UNAVAILABLE');
      else
        -- THE Client rule of §9.3: a reliable match is reused, never modified;
        -- otherwise a new Client with identity and contact only.
        v_client_id := public.online_booking_find_client(v_business_id, v_first_name, v_last_name, v_email);
        if v_client_id is null then
          v_client_id := gen_random_uuid()::text;
          insert into public.clients (business_id, id, first_name, last_name, phone, email)
          values (v_business_id, v_client_id, v_first_name, v_last_name, v_phone, v_email);
        end if;

        -- ONE Appointment, as a device writes one…
        v_appointment_id := gen_random_uuid()::text;
        insert into public.appointments
          (business_id, id, client_id, staff_member_id, start_at, status, notes)
        values
          (v_business_id, v_appointment_id, v_client_id, public.online_booking_staff_member_id(),
           p_starts_at, 'SCHEDULED', public.online_booking_appointment_note());

        -- …one item per service, in HER order, each the snapshot read above,
        -- with its catalogue phases under their own ids.
        for v_service in
          select i.item_order, i.service_id, i.name, i.type, i.price_cents
            from jsonb_to_recordset(v_items) as i(item_order integer, service_id text, name text, type text, price_cents integer)
           order by i.item_order
        loop
          v_item_id := v_appointment_id || '-item-' || v_service.item_order;
          insert into public.appointment_items
            (business_id, appointment_id, id, item_order, service_id, service_option_id,
             service_name, service_type, price_cents)
          values
            (v_business_id, v_appointment_id, v_item_id, v_service.item_order, v_service.service_id, null,
             v_service.name, v_service.type, v_service.price_cents);

          insert into public.appointment_phases
            (business_id, appointment_id, appointment_item_id, id, position, name,
             duration_minutes, requires_staff)
          select v_business_id, v_appointment_id, v_item_id, ph.id,
                 (row_number() over (order by ph.position, ph.id))::integer - 1,
                 ph.name, ph.duration_minutes, ph.requires_staff
            from public.service_phases ph
           where ph.business_id = v_business_id and ph.service_id = v_service.service_id;
        end loop;

        -- What was written must be what was validated: every item, each with
        -- phases of exactly its snapshot length (a catalogue change committed
        -- between the read above and the copy of the phases fails the whole
        -- booking; the website retries it with the same key).
        if (select count(*) from public.appointment_items i
             where i.business_id = v_business_id and i.appointment_id = v_appointment_id) <> v_count
           or exists (
                select 1
                  from jsonb_array_elements(v_snapshot) with ordinality as e(item, ordinality)
                 where (e.item ->> 'duration_minutes')::integer <> (
                         select coalesce(sum(ph.duration_minutes), 0)
                           from public.appointment_phases ph
                          where ph.business_id = v_business_id
                            and ph.appointment_id = v_appointment_id
                            and ph.appointment_item_id = v_appointment_id || '-item-' || (e.ordinality - 1))) then
          raise exception 'online booking: the selection changed while it was being booked' using errcode = '40001';
        end if;

        insert into public.online_bookings
          (business_id, idempotency_key, request_hash, appointment_id,
           service_id, service_name, services, duration_minutes, starts_at, ends_at, time_zone,
           customer_first_name, customer_last_name, customer_email, customer_phone)
        values
          (v_business_id, p_idempotency_key, v_request_hash, v_appointment_id,
           null, null, v_snapshot, v_minutes, p_starts_at,
           p_starts_at + make_interval(mins => v_minutes), v_time_zone,
           v_first_name, v_last_name, v_email, v_phone)
        returning * into v_booking;

        v_answer := public.online_booking_selection_booking_json(v_booking);
      end if;
    end if;
  exception
    when lock_not_available then
      perform set_config('lock_timeout', v_previous_lock_timeout, true);
      return jsonb_build_object('status', 'BUSY');
  end;

  perform set_config('lock_timeout', v_previous_lock_timeout, true);
  return v_answer;
end;
$$;

comment on function public.online_booking_book_selection(text, text[], timestamptz, text, text, text, text, text, text, timestamptz) is
  'Online booking: THE selection booking transaction, seen at a given instant — validates, locks the Business (3 s at most), replays an idempotency key, decides eligibility, every service, the fingerprint and the whole span again under the lock, resolves or creates the Client, writes ONE Appointment with one item per service in the order given, and records the booking. All or nothing. No API role.';

revoke all on function public.online_booking_book_selection(text, text[], timestamptz, text, text, text, text, text, text, timestamptz) from public, anon, authenticated, service_role;

-- The website's write — ONE narrowly scoped entry point, behind the creation
-- switch. Keyed by the public slug: no Business, staff member, length, price
-- or phase is accepted.
create or replace function public.online_booking_create_selection_booking(
  p_slug text,
  p_service_ids text[],
  p_starts_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_selection_fingerprint text,
  p_idempotency_key text
) returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.online_booking_book_selection(
    p_slug, p_service_ids, p_starts_at, p_first_name, p_last_name, p_email, p_phone,
    p_selection_fingerprint, p_idempotency_key, now());
$$;

comment on function public.online_booking_create_selection_booking(text, text[], timestamptz, text, text, text, text, text, text) is
  'Online booking: creates ONE real appointment holding an ordered selection of 1 to 8 services for a customer on a page that accepts bookings — or answers why not (NULL, INVALID_REQUEST, BUSY, IDEMPOTENCY_KEY_REUSED, UNKNOWN_SERVICE, SELECTION_CHANGED, SELECTION_TOO_LONG, SLOT_UNAVAILABLE). Atomic, idempotent by key. service_role only (the website server), behind the ONLINE_BOOKING_CREATION switch.';

revoke all on function public.online_booking_create_selection_booking(text, text[], timestamptz, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_create_selection_booking(text, text[], timestamptz, text, text, text, text, text, text) to service_role;
