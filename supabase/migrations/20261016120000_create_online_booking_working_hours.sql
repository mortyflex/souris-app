-- BeautIzzy — Online booking, Sprint 3A: the weekly working hours of a Business
--
-- When the professional works, week after week: seven days, each open or
-- closed; an open day is one to four working intervals, and a break is the
-- gap between two of them. NOTHING here books anything or computes a slot:
-- no availability, no appointment, no customer, no payment.
--
--   table    business_working_hours            one row per (Business, ISO weekday)
--
--   owner (authenticated, through RPCs only)
--     online_booking_read_working_hours(business)                       the week
--     online_booking_save_working_day(business, weekday, open, intervals) one day
--   server contract (NO API role — for the future availability engine)
--     online_booking_working_intervals(business, from, to)              instants
--
-- Separate from everything that schedules: appointments, appointment phases,
-- calendar blocks and the offline sync never read or write this table, and
-- nothing here reads them. Working hours do not constrain manual scheduling:
-- the professional's Agenda stays free (CLAUDE.md §16 / §17). The table is not
-- a sync aggregate; the device never queues a change to it.
--
-- Time. An interval is a pair of WALL-CLOCK minutes after local midnight —
-- 540 = 09:00 — in THE time zone of the Business: the `time_zone` of its
-- booking profile (Sprint 2, Europe/Paris today). Never an instant, never a
-- UTC offset. A concrete date is resolved only when it is asked for, by ONE
-- rule (online_booking_working_intervals): `(date + minutes) AT TIME ZONE tz`.
-- The weekday is the ISO weekday of the LOCAL civil date (1 = Monday …
-- 7 = Sunday), never of a UTC instant. Hence across a daylight-saving change
-- 09:00 stays 09:00 local and only its UTC offset moves; on the change day
-- itself a wall-clock interval lasts what the clock says it lasts (an
-- interval spanning the skipped hour is one hour shorter, one spanning the
-- repeated hour one hour longer). A wall-clock time that does not exist (the
-- skipped hour) or exists twice (the repeated hour) is resolved by
-- PostgreSQL's own rule — read as standard time — the same way every time.
--
-- Validation lives in ONE immutable function, used by the table's CHECK
-- constraint AND by the save RPC: a stored day can never be malformed,
-- overlapping or contradictory, whoever writes it. Adjacent intervals are
-- allowed: ends are exclusive, like every interval of the product.
--
-- Privileges, explicit and minimal (the Sprint 2 model): RLS enabled with NO
-- policy and no grant on the table; every new function is revoked from
-- public, anon, authenticated AND service_role first, then granted back to
-- exactly one role when a caller exists. `anon` receives nothing, and the
-- website receives nothing either: the ONE public read stays
-- online_booking_public_profile. Editing the hours needs ownership only — no
-- subscription, like the draft of the public profile.
--
-- Only ADDS objects: no existing table, column, policy, grant, function or
-- flag is touched, so installed builds are unaffected. Safe to re-run:
-- `if not exists`, `create or replace`, `drop trigger if exists` on the new
-- table's own trigger only.

-- ---------------------------------------------------------------------------
-- 1. THE validation rule of one day
-- ---------------------------------------------------------------------------
-- NULL when the day is valid, otherwise the first broken rule:
--   INVALID_DAY           not an array, or a missing open state
--   INTERVAL_REQUIRED     open without any interval
--   CLOSED_DAY_INTERVALS  closed with intervals
--   TOO_MANY_INTERVALS    more than four intervals
--   INVALID_INTERVAL      not exactly { start_minute, end_minute } as whole
--                         minutes, outside 0 … 1440, or an end not after its start
--   OVERLAP               an interval starts before the previous one ends
-- Expects ascending order (the stored form): an unsorted array reads as
-- overlapping. The save RPC sorts before asking.
create or replace function public.online_booking_working_day_issue(
  p_is_open boolean,
  p_intervals jsonb
) returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_item jsonb;
  v_start integer;
  v_end integer;
  v_previous_end integer := 0;
begin
  if p_is_open is null or p_intervals is null or jsonb_typeof(p_intervals) <> 'array' then
    return 'INVALID_DAY';
  end if;

  v_count := jsonb_array_length(p_intervals);
  if p_is_open and v_count = 0 then
    return 'INTERVAL_REQUIRED';
  end if;
  if not p_is_open and v_count > 0 then
    return 'CLOSED_DAY_INTERVALS';
  end if;
  if v_count > 4 then
    return 'TOO_MANY_INTERVALS';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_intervals) with ordinality as e(value, position) order by e.position loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 2
       or jsonb_typeof(v_item -> 'start_minute') is distinct from 'number'
       or jsonb_typeof(v_item -> 'end_minute') is distinct from 'number'
       or (v_item ->> 'start_minute') !~ '^[0-9]{1,4}$'
       or (v_item ->> 'end_minute') !~ '^[0-9]{1,4}$' then
      return 'INVALID_INTERVAL';
    end if;
    v_start := (v_item ->> 'start_minute')::integer;
    v_end := (v_item ->> 'end_minute')::integer;
    if v_end > 1440 or v_end <= v_start then
      return 'INVALID_INTERVAL';
    end if;
    if v_start < v_previous_end then
      return 'OVERLAP';
    end if;
    v_previous_end := v_end;
  end loop;

  return null;
end;
$$;

comment on function public.online_booking_working_day_issue(boolean, jsonb) is
  'Online booking: THE validation rule of one working day — NULL when valid, else the first broken rule. Used by the business_working_hours CHECK constraint and by online_booking_save_working_day.';

revoke all on function public.online_booking_working_day_issue(boolean, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The table
-- ---------------------------------------------------------------------------
create table if not exists public.business_working_hours (
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- ISO 8601 weekday of the LOCAL date: 1 = Monday … 7 = Sunday (extract(isodow …)).
  weekday smallint not null check (weekday between 1 and 7),
  is_open boolean not null,
  -- [{ "start_minute": 540, "end_minute": 720 }, …]: wall-clock minutes after
  -- local midnight, ascending. Empty for a closed day.
  intervals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, weekday),
  constraint business_working_hours_valid_day
    check (public.online_booking_working_day_issue(is_open, intervals) is null)
);

comment on table public.business_working_hours is
  'Online booking: the weekly working hours of a Business — one row per ISO weekday, a missing row reads as closed. Wall-clock minutes in the time zone of the Business booking profile. Server-authoritative, outside the offline sync, never read by manual scheduling. No table access for any API role — the owner goes through online_booking_read_working_hours / online_booking_save_working_day.';

create or replace function public.business_working_hours_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.business_id := old.business_id;
    new.weekday := old.weekday;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.business_working_hours_before_write() from public, anon, authenticated, service_role;

drop trigger if exists business_working_hours_before_write on public.business_working_hours;
create trigger business_working_hours_before_write
  before insert or update on public.business_working_hours
  for each row
  execute function public.business_working_hours_before_write();

alter table public.business_working_hours enable row level security;
revoke all on table public.business_working_hours from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The owner's view of the week
-- ---------------------------------------------------------------------------
-- { "time_zone", "days": [ { "weekday", "is_open", "intervals" } × 7 ] },
-- Monday first. A day without a row is closed.
create or replace function public.online_booking_working_hours_json(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'time_zone', (select p.time_zone from public.business_booking_profiles p
                   where p.business_id = p_business_id),
    'days', (select jsonb_agg(jsonb_build_object(
                      'weekday', d.weekday,
                      'is_open', coalesce(h.is_open, false),
                      'intervals', coalesce(h.intervals, '[]'::jsonb))
                    order by d.weekday)
               from generate_series(1, 7) as d(weekday)
               left join public.business_working_hours h
                 on h.business_id = p_business_id and h.weekday = d.weekday));
$$;

revoke all on function public.online_booking_working_hours_json(uuid) from public, anon, authenticated, service_role;

-- The time zone of the Business lives on its booking profile, so both owner
-- RPCs make sure the profile row exists — the same empty, unpublished draft
-- the first read of Réservation en ligne creates. Nothing else of it changes.
create or replace function public.online_booking_read_working_hours(p_business_id uuid)
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

  return public.online_booking_working_hours_json(p_business_id);
end;
$$;

comment on function public.online_booking_read_working_hours(uuid) is
  'Online booking: the owner reads her weekly working hours — seven days, Monday first, with the time zone they are expressed in.';

revoke all on function public.online_booking_read_working_hours(uuid) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_read_working_hours(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The owner saves one day
-- ---------------------------------------------------------------------------
-- Replaces the open state and the intervals of ONE weekday. The intervals may
-- arrive in any order; they are stored ascending. Answers:
--   UPDATED      + the week
--   INVALID_DAY  + "reason": the rule the day breaks (section 1); nothing is written
create or replace function public.online_booking_save_working_day(
  p_business_id uuid,
  p_weekday integer,
  p_is_open boolean,
  p_intervals jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_intervals jsonb := coalesce(p_intervals, '[]'::jsonb);
  v_item jsonb;
  v_sorted jsonb;
  v_issue text;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'online booking: not the owner of this Business' using errcode = '42501';
  end if;
  if p_weekday is null or p_weekday not between 1 and 7 or p_is_open is null then
    raise exception 'online booking: a weekday (1-7) and an open state are required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_intervals) <> 'array' then
    return jsonb_build_object('status', 'INVALID_DAY', 'reason', 'INVALID_DAY');
  end if;

  -- Each interval on its own first: ordering needs well-formed minutes.
  for v_item in select e.value from jsonb_array_elements(v_intervals) as e(value) loop
    v_issue := public.online_booking_working_day_issue(true, jsonb_build_array(v_item));
    if v_issue is not null then
      return jsonb_build_object('status', 'INVALID_DAY', 'reason', v_issue);
    end if;
  end loop;

  select coalesce(
           jsonb_agg(jsonb_build_object(
                       'start_minute', (e.value ->> 'start_minute')::integer,
                       'end_minute', (e.value ->> 'end_minute')::integer)
                     order by (e.value ->> 'start_minute')::integer, (e.value ->> 'end_minute')::integer),
           '[]'::jsonb)
    into v_sorted
    from jsonb_array_elements(v_intervals) as e(value);

  v_issue := public.online_booking_working_day_issue(p_is_open, v_sorted);
  if v_issue is not null then
    return jsonb_build_object('status', 'INVALID_DAY', 'reason', v_issue);
  end if;

  insert into public.business_booking_profiles (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  insert into public.business_working_hours (business_id, weekday, is_open, intervals)
  values (p_business_id, p_weekday, p_is_open, v_sorted)
  on conflict (business_id, weekday) do update set
    is_open = excluded.is_open,
    intervals = excluded.intervals;

  return jsonb_build_object('status', 'UPDATED')
    || public.online_booking_working_hours_json(p_business_id);
end;
$$;

comment on function public.online_booking_save_working_day(uuid, integer, boolean, jsonb) is
  'Online booking: the owner replaces the open state and the working intervals of one weekday. Validated by online_booking_working_day_issue; needs ownership only, no subscription.';

revoke all on function public.online_booking_save_working_day(uuid, integer, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_save_working_day(uuid, integer, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE server contract of the future availability engine — read-only
-- ---------------------------------------------------------------------------
-- The working intervals of a Business between two LOCAL dates (both
-- inclusive, at most 92 days), resolved to instants by THE time rule of this
-- file: `(local date + minutes) AT TIME ZONE <profile time zone>`. One row
-- per interval, chronological. Independent of the session time zone.
--
-- This is working time only — never a bookable slot: appointments, calendar
-- blocks, phases, lead time and horizon are the engine's business. It asks
-- nothing about publication or subscription either: the caller decides.
-- No EXECUTE grant: only SECURITY DEFINER functions owned by the table owner
-- (the future engine) and the SQL Editor can call it. No public client can.
create or replace function public.online_booking_working_intervals(
  p_business_id uuid,
  p_from date,
  p_to date
) returns table (local_date date, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_business_id is null or p_from is null or p_to is null
     or p_to < p_from or p_to - p_from >= 92 then
    raise exception 'online booking: a range of 1 to 92 local dates is required' using errcode = '22023';
  end if;

  return query
    select d.day,
           (d.day + make_interval(mins => (i.value ->> 'start_minute')::integer)) at time zone p.time_zone,
           (d.day + make_interval(mins => (i.value ->> 'end_minute')::integer)) at time zone p.time_zone
      from public.business_booking_profiles p
      cross join lateral (
        select p_from + n as day from generate_series(0, p_to - p_from) as s(n)
      ) d
      join public.business_working_hours h
        on h.business_id = p.business_id
       and h.weekday = extract(isodow from d.day)::integer
       and h.is_open
      cross join lateral jsonb_array_elements(h.intervals) as i(value)
     where p.business_id = p_business_id
     order by 2, 3;
end;
$$;

comment on function public.online_booking_working_intervals(uuid, date, date) is
  'Online booking: THE read-only contract of the future availability engine — the working intervals of a Business between two local dates (inclusive, at most 92), resolved to instants in the time zone of its booking profile, DST-safe. Working time only, never slots. No API role may call it.';

revoke all on function public.online_booking_working_intervals(uuid, date, date) from public, anon, authenticated, service_role;
