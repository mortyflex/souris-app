-- BeautIzzy — Online booking, Sprint 3B: the read-only availability engine
--
-- Which start times a customer could be OFFERED for one bookable service on
-- one local date of a professional whose online booking is open. It READS
-- the calendar; it never writes an appointment, never holds a slot, never
-- books anything. Booking creation is a later sprint.
--
--   table    business_bookable_services        opt-in: which services may be booked online
--
--   rules (no API role)
--     online_booking_rules()                                 THE default booking rules
--     online_booking_window(time zone, now)                  first and last bookable local dates
--     online_booking_bookable_services(business, service?)   bookable services and their duration
--     online_booking_busy_intervals(business, from, to)      what occupies the professional
--     online_booking_compute_slots(business, service, date, now)       THE slot rule
--     online_booking_slot_is_available(business, service, start, now) revalidation of one start
--     online_booking_availability_json(business, service, date, now)  the public answer
--   website (service_role, ONE function)
--     online_booking_public_availability(slug, service?, date?)
--
-- A slot is offered only when ALL hold (online_booking_compute_slots):
--
--   * the page is online and accepts bookings: published, booking_enabled
--     and THE publication rule (operator switch + verified Plus) at read time;
--   * the service is opted in (business_bookable_services), active, not
--     deleted, and lasts 1 … 720 minutes — the sum of its catalog phases;
--   * the local date lies in the window: from the date of now + notice to
--     today + horizon;
--   * the start is on the local 15-minute grid, exists on the wall clock
--     (never inside the skipped hour) and is at least the notice after now;
--   * the WHOLE service fits inside ONE working interval of that date
--     (Sprint 3A): it never crosses a break, a closed day or midnight;
--   * it intersects no busy interval — conservatively:
--       an appointment occupies its FULL span, start_at + every phase of
--       every item, processing phases included, whatever its staff member,
--       unless CANCELLED or NO_SHOW (doesAppointmentOccupySchedule) or
--       tombstoned; a calendar block occupies [start_at, end_at).
--
-- Ends are exclusive everywhere: a slot may end exactly when an appointment,
-- a block or a working interval begins or ends.
--
-- Time. Candidate starts are LOCAL wall-clock minutes of the date in the
-- Business time zone (business_booking_profiles.time_zone), turned into
-- instants by the Sprint 3A rule `(date + minutes) AT TIME ZONE tz`. A
-- candidate that does not survive the round trip back to the same wall-clock
-- time does not exist (spring forward) and is dropped. A wall-clock time that
-- exists twice (fall back) is offered ONCE, as its standard-time occurrence
-- (PostgreSQL's rule, the same as Sprint 3A). So no slot is ever nonexistent
-- or duplicated, and durations are real minutes. Nothing depends on the
-- session or the server time zone; answers carry UTC instants (`…Z`) plus
-- the local wall-clock label.
--
-- One professional per Business today (CLAUDE.md §18): every appointment and
-- every calendar block of the Business occupies THE bookable professional,
-- whatever its staff_member_id. A multi-staff engine will take a staff
-- member explicitly; none is accepted from the outside here.
--
-- What the server cannot see: an appointment created on a device and not
-- synchronized yet. An offered slot is never a guarantee; the future booking
-- creation must lock the Business and call online_booking_slot_is_available
-- again inside the same transaction (docs/architecture/ONLINE_BOOKING.md §8).
--
-- Privileges (the Sprint 2 / 3A model): the new table has RLS enabled, NO
-- policy and no grant; every new function is revoked from public, anon,
-- authenticated AND service_role, and only the public read is granted, to
-- service_role. The Sprint 3A contract online_booking_working_intervals keeps
-- its zero-grant boundary: only these SECURITY DEFINER functions, owned by
-- the same owner, call it. The answer names services and times only — never
-- a Business id, a client, an appointment, a note or an amount.
--
-- Only ADDS objects: no existing table, column, row, policy, grant, function
-- or flag is touched; appointments, calendar blocks, services and the sync
-- are read, never written. Safe to re-run: `if not exists`, `create or replace`.

-- ---------------------------------------------------------------------------
-- 1. Bookable services — an explicit opt-in, outside the offline sync
-- ---------------------------------------------------------------------------
-- A service is NOT bookable online unless a row says so (docs/domain/SERVICES.md
-- §12: private by default). Kept server-side like the profile and the working
-- hours, so no sync aggregate changes. No writer exists yet besides the
-- operator (SQL Editor); the professional's editor is a later sprint.
create table if not exists public.business_bookable_services (
  business_id uuid not null,
  service_id text not null,
  created_at timestamptz not null default now(),
  primary key (business_id, service_id),
  constraint business_bookable_services_service_fk
    foreign key (business_id, service_id)
    references public.services (business_id, id) on delete cascade
);

comment on table public.business_bookable_services is
  'Online booking: the catalog services a Business opted in to online booking (absent = not bookable). Server-only, outside the offline sync. No table access for any API role.';

alter table public.business_bookable_services enable row level security;
revoke all on table public.business_bookable_services from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. THE default booking rules — one place
-- ---------------------------------------------------------------------------
create or replace function public.online_booking_rules()
returns table (
  slot_minutes integer,
  minimum_notice_minutes integer,
  horizon_days integer,
  max_service_minutes integer
)
language sql
immutable
security invoker
set search_path = ''
as $$
  select 15, 24 * 60, 30, 12 * 60;
$$;

comment on function public.online_booking_rules() is
  'Online booking: THE default booking rules — a start every 15 local minutes, 24 hours of notice, 30 days of horizon, services of at most 12 hours.';

revoke all on function public.online_booking_rules() from public, anon, authenticated, service_role;

-- First bookable local date = the date of now + notice; last = today + horizon.
create or replace function public.online_booking_window(p_time_zone text, p_now timestamptz)
returns table (first_date date, last_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select ((p_now + make_interval(mins => r.minimum_notice_minutes)) at time zone p_time_zone)::date,
         (p_now at time zone p_time_zone)::date + r.horizon_days
    from public.online_booking_rules() r;
$$;

revoke all on function public.online_booking_window(text, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Bookable services and their real duration
-- ---------------------------------------------------------------------------
-- The duration is the sum of the catalog phases — the duration an
-- appointment of that service gets (calculateAppointmentTimeline).
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
    cross join public.online_booking_rules() r
   where b.business_id = p_business_id
     and (p_service_id is null or b.service_id = p_service_id)
     and s.active
     and s.deleted_at is null
     and d.minutes between 1 and r.max_service_minutes
   order by s.name, s.id;
$$;

revoke all on function public.online_booking_bookable_services(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. What occupies the professional — conservative
-- ---------------------------------------------------------------------------
-- Every busy interval of the Business intersecting [p_from, p_to): its
-- appointments (full span, processing included) and its calendar blocks.
-- Appointments are looked up from 7 days before p_from (the start_at index).
create or replace function public.online_booking_busy_intervals(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.start_at, a.start_at + make_interval(mins => t.minutes)
    from public.appointments a
    cross join lateral (
      select coalesce(sum(ph.duration_minutes), 0)::integer as minutes
        from public.appointment_phases ph
       where ph.business_id = a.business_id and ph.appointment_id = a.id
    ) t
   where a.business_id = p_business_id
     and a.deleted_at is null
     and a.status not in ('CANCELLED', 'NO_SHOW')
     and a.start_at >= p_from - interval '7 days'
     and a.start_at < p_to
     and t.minutes > 0
     and a.start_at + make_interval(mins => t.minutes) > p_from
  union all
  select c.start_at, c.end_at
    from public.calendar_blocks c
   where c.business_id = p_business_id
     and c.deleted_at is null
     and c.start_at < p_to
     and c.end_at > p_from;
$$;

revoke all on function public.online_booking_busy_intervals(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. THE slot rule
-- ---------------------------------------------------------------------------
-- The starts offered for `p_service_id` on the local date `p_date`, seen at
-- `p_now`, chronological. Empty when anything is missing or not bookable.
-- Deterministic: the same data and the same `p_now` give the same answer.
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
  v_slot_minutes integer;
  v_notice_minutes integer;
  v_time_zone text;
  v_duration integer;
  v_first_date date;
  v_last_date date;
begin
  if p_business_id is null or p_service_id is null or p_date is null or p_now is null then
    return;
  end if;

  select r.slot_minutes, r.minimum_notice_minutes
    into v_slot_minutes, v_notice_minutes
    from public.online_booking_rules() r;

  select p.time_zone into v_time_zone
    from public.business_booking_profiles p
   where p.business_id = p_business_id;
  if v_time_zone is null then
    return;
  end if;

  select s.duration_minutes into v_duration
    from public.online_booking_bookable_services(p_business_id, p_service_id) s;
  if v_duration is null then
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
           c.slot_start + make_interval(mins => v_duration),
           lpad((c.local_minute / 60)::text, 2, '0') || ':' || lpad((c.local_minute % 60)::text, 2, '0')
      from candidates c
     where c.slot_start >= p_now + make_interval(mins => v_notice_minutes)
       and exists (
             select 1 from working w
              where w.work_start <= c.slot_start
                and c.slot_start + make_interval(mins => v_duration) <= w.work_end)
       and not exists (
             select 1 from busy b
              where b.busy_start < c.slot_start + make_interval(mins => v_duration)
                and c.slot_start < b.busy_end)
     order by c.slot_start;
end;
$$;

comment on function public.online_booking_compute_slots(uuid, text, date, timestamptz) is
  'Online booking: THE slot rule — the starts offered for a bookable service on a local date at a given instant: whole service inside one working interval, notice and horizon, 15-minute local grid, DST-safe, conservative blocking by appointments (full span, unless CANCELLED / NO_SHOW / deleted) and calendar blocks. Read-only. No API role.';

revoke all on function public.online_booking_compute_slots(uuid, text, date, timestamptz) from public, anon, authenticated, service_role;

-- Whether ONE start would still be offered — the revalidation the future
-- booking creation runs inside its own transaction, after locking.
create or replace function public.online_booking_slot_is_available(
  p_business_id uuid,
  p_service_id text,
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
        from public.online_booking_compute_slots(
               p_business_id, p_service_id, (p_starts_at at time zone p.time_zone)::date, p_now) s
       where s.starts_at = p_starts_at)
      from public.business_booking_profiles p
     where p.business_id = p_business_id), false);
$$;

comment on function public.online_booking_slot_is_available(uuid, text, timestamptz, timestamptz) is
  'Online booking: whether one start is still offered by online_booking_compute_slots — for the future booking creation, to be called after locking the Business. No API role.';

revoke all on function public.online_booking_slot_is_available(uuid, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The public answer
-- ---------------------------------------------------------------------------
-- { time_zone, slot_minutes, first_date, last_date, services: [{id, name,
--   duration_minutes}], status, service?, date?, slots? } where status is
--   CHOOSE_SERVICE   no service asked
--   UNKNOWN_SERVICE  not a bookable service of this Business (whatever the reason)
--   CHOOSE_DATE      a service, no date
--   OUT_OF_WINDOW    a date outside [first_date, last_date]
--   SLOTS            slots: [{ starts_at, ends_at, local_time }], possibly empty
-- Dates are `YYYY-MM-DD` local dates; instants are UTC `YYYY-MM-DDTHH:MI:SSZ`.
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
      (select jsonb_agg(jsonb_build_object(
                'id', s.service_id, 'name', s.name, 'duration_minutes', s.duration_minutes)
              order by s.name, s.service_id)
         from public.online_booking_bookable_services(p_business_id, null) s),
      '[]'::jsonb));

  if v_service_id is null then
    return v_answer || jsonb_build_object('status', 'CHOOSE_SERVICE');
  end if;

  select s.service_id, s.name, s.duration_minutes into v_service
    from public.online_booking_bookable_services(p_business_id, v_service_id) s;
  if not found then
    return v_answer || jsonb_build_object('status', 'UNKNOWN_SERVICE');
  end if;

  v_answer := v_answer || jsonb_build_object('service', jsonb_build_object(
    'id', v_service.service_id, 'name', v_service.name, 'duration_minutes', v_service.duration_minutes));

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

revoke all on function public.online_booking_availability_json(uuid, text, date, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The website's read — ONE narrowly scoped entry point
-- ---------------------------------------------------------------------------
-- NULL — the same NULL — for an unknown or malformed slug, a draft, a page
-- that does not accept bookings, a lapsed subscription, or any slug while
-- the operator switch is off. Keyed by the public slug only: no Business id,
-- no staff member is accepted. One local date and one service per call.
-- service_role ONLY: the website calls it from server-only code.
create or replace function public.online_booking_public_availability(
  p_slug text,
  p_service_id text default null,
  p_date date default null
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.online_booking_availability_json(p.business_id, p_service_id, p_date, now())
    from public.business_booking_profiles p
   where p.slug = lower(btrim(p_slug))
     and p.published
     and p.booking_enabled
     and public.online_booking_may_be_public(p.business_id);
$$;

comment on function public.online_booking_public_availability(text, text, date) is
  'Online booking: the start times offered for one bookable service on one local date of a page that is online AND accepts bookings — or NULL. Service names, durations and times only. Read-only. service_role only (the website server).';

revoke all on function public.online_booking_public_availability(text, text, date) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_public_availability(text, text, date) to service_role;
