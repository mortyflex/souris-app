-- BeautIzzy — Online booking, Sprint 3C-A: secure booking creation (backend only)
--
-- ONE server-side operation that turns a customer's request into a real
-- Appointment of the professional — the canonical, synced Appointment, with
-- its item and phase snapshots, that every installed build already pulls and
-- understands. No public form exists yet; nothing here is reachable by a
-- browser, by `anon` or by `authenticated` (the owner's conflict read apart).
--
--   flag     ONLINE_BOOKING_CREATION          operator switch, DISABLED
--   table    online_bookings                  the durable booking record + idempotency
--   trigger  clients_online_booking_reattach  a deleted Client never orphans a booking
--
--   rules (no API role)
--     online_booking_creation_enabled()                    the switch
--     online_booking_staff_member_id()                     THE professional of an online booking
--     online_booking_appointment_note()                    the note that marks the Appointment
--     online_booking_clean_text(text)                      a text as it is stored (the device's trim)
--     online_booking_is_plain_text(text, max)              presentable single-line text
--     online_booking_text_key(text)                        comparison key of a name
--     online_booking_request_issue(…)                      THE request validation rule
--     online_booking_find_client(business, first, last, email)   THE client matching rule
--     online_booking_booking_json(booking)                 the public answer of one booking
--     online_booking_book(…, now)                          THE booking transaction
--     online_booking_conflicts(business, now)              what overlaps an online booking
--   website (service_role, ONE function)
--     online_booking_create_booking(slug, service, start, first, last, email, phone, key)
--   owner (authenticated)
--     online_booking_read_conflicts(business)              her own overlaps, nothing else
--   operator (table owner, SQL Editor)
--     online_booking_set_creation_enabled(boolean)
--
-- The booking transaction (online_booking_book), all or nothing:
--
--   1. the switch is ON, the request is well-formed, the slug names a profile;
--   2. the Business is LOCKED — its booking profile row, FOR UPDATE, waiting
--      at most 3 seconds (answer BUSY, nothing written); the slug and the
--      time zone are read from the locked row: a slug that no longer names
--      this Business answers NULL, as an unknown one does;
--   3. the idempotency key is looked up: the same request answers the stored
--      booking again and writes nothing; a different request under the same
--      key is refused;
--   4. under the lock, everything is decided again from committed data: the
--      page is published, accepts bookings and passes THE publication rule;
--      the service is opted in, active, not deleted; the start is still
--      offered by THE Sprint 3B rule (online_booking_slot_is_available);
--   5. the customer becomes a Client of THAT Business — an existing one only
--      when the match is reliable (same email, same name), never modified;
--      otherwise a new one, identity and contact only, no consent;
--   6. the Appointment, its item and its phases are written exactly as a
--      device would write them (same id shapes, SCHEDULED, snapshot of the
--      catalog service at this instant);
--   7. the booking record is written with the idempotency key.
--
-- The business id, the staff member, the duration, the price, the phases,
-- the subscription state and the availability are ALL resolved here. The
-- caller supplies a slug, a service id, an instant, a name, a contact and a
-- key — nothing else is read from it.
--
-- Concurrency. Two bookings of one Business never run step 3–7 at the same
-- time (the row lock), and each statement of a READ COMMITTED transaction
-- sees what the previous holder committed: the second request for a slot is
-- refused by step 4. The function refuses to run under any other isolation
-- level. Nothing is held in application memory.
--
-- The professional's own sync push takes NO such lock, on purpose: her
-- schedule is hers, overlapping appointments are allowed (CLAUDE.md §16) and
-- an appointment created offline must never be refused or dropped. An
-- overlap between an online booking and anything she synchronizes later is
-- therefore possible — and never silent: online_booking_conflicts derives it
-- from the committed calendar every time it is asked (nothing stored, so
-- nothing stale and no race), and the owner reads hers through
-- online_booking_read_conflicts.
--
-- The offline sync is NOT changed: no sync RPC is replaced, no payload key is
-- added, no status is introduced. A booking reaches the device through the
-- normal pull (updated_at of the writing transaction, well inside the pull's
-- five-minute overlap: the lock wait is bounded). ONE trigger is added to
-- `clients` so that the server keeps the invariant every device keeps — a
-- live Appointment names a live Client: when a device deletes a Client it
-- could not know was just booked online, the booking's Appointment is moved
-- to a new Client built from the booking's own contact, in the same
-- transaction.
--
-- ALSO replaced in place: online_booking_busy_intervals. Its appointment
-- lookup started 7 days before the window — an appointment longer than that
-- was silently ignored. Nothing bounds the length of an appointment, so the
-- lower bound is removed: every appointment that starts before the end of
-- the window is measured.
--
-- Privileges (the Sprint 2 / 3A / 3B model): the new table has RLS enabled,
-- NO policy and no grant; every new function is revoked from public, anon,
-- authenticated AND service_role, then granted to exactly one role when a
-- caller exists. The switch ships DISABLED and this migration enables
-- nothing: no flag, no profile, no opt-in.
--
-- Additive: one new table, one new flag row (disabled), new functions, one
-- new trigger, one function replaced with the same signature and grants. No
-- existing row, column, policy or grant is touched. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The operator switch — one disabled row
-- ---------------------------------------------------------------------------
insert into public.server_feature_flags (flag, enabled, note)
values (
  'ONLINE_BOOKING_CREATION',
  false,
  'Online booking: when enabled, the website server may create real appointments through online_booking_create_booking. Staging only until the public booking flow is approved. Flip with online_booking_set_creation_enabled(boolean).')
on conflict (flag) do nothing;

create or replace function public.online_booking_creation_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.server_feature_flags f
      where f.flag = 'ONLINE_BOOKING_CREATION'),
    false);
$$;

comment on function public.online_booking_creation_enabled() is
  'Online booking: whether booking creation is open. A missing row reads as closed.';

revoke all on function public.online_booking_creation_enabled() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The booking record — durable idempotency, outside the offline sync
-- ---------------------------------------------------------------------------
-- One row per online booking. The Appointment it created is the schedule;
-- this row is what the server must remember about the REQUEST: its key, its
-- fingerprint, what was answered, and the contact the customer gave for this
-- booking (an existing Client is never rewritten from public input, so her
-- record may say something else). Deleted with its Appointment or its
-- Business (administrative hard deletes only: the API tombstones).
create table if not exists public.online_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  -- sha256 of the normalized request: the same key with another request is refused.
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  appointment_id text not null,
  -- The answer, as given: later edits of the catalog or of the Appointment never change it.
  service_id text not null,
  service_name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null,
  -- The contact given for THIS booking — identity and contact only.
  customer_first_name text not null,
  customer_last_name text not null,
  customer_email text not null,
  customer_phone text not null,
  created_at timestamptz not null default now(),
  constraint online_bookings_idempotency_key unique (business_id, idempotency_key),
  constraint online_bookings_appointment unique (business_id, appointment_id),
  constraint online_bookings_appointment_fk
    foreign key (business_id, appointment_id)
    references public.appointments (business_id, id) on delete cascade,
  constraint online_bookings_span check (ends_at > starts_at)
);

comment on table public.online_bookings is
  'Online booking: one row per booking created by online_booking_create_booking — the idempotency key, the request fingerprint, the answer given and the contact the customer gave. The Appointment itself is the canonical synced row. Server-only, outside the offline sync. No table access for any API role.';

alter table public.online_bookings enable row level security;
revoke all on table public.online_bookings from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. What occupies the professional — no lookback bound any more
-- ---------------------------------------------------------------------------
-- Replaced in place (same signature, same zero-grant boundary). Sprint 3B
-- read appointments from 7 days before the window only: an appointment whose
-- phases add up to more than 7 days was silently ignored. No rule bounds the
-- length of an appointment (any number of items, any phase duration), so NO
-- lower bound is safe. Every live appointment that starts before the end of
-- the window is measured; the (business_id, start_at) index still bounds the
-- upper side. The cost grows with the history of ONE Business (one phase-sum
-- probe per appointment) — measured, see docs/architecture/ONLINE_BOOKING.md §9.6.
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
-- 4. Constants of an online Appointment — one place each
-- ---------------------------------------------------------------------------
-- One professional per Business (CLAUDE.md §18): the app stamps every
-- Appointment and Calendar Block with ONE placeholder
-- (src/features/appointments/current-staff-member.ts). An online booking is
-- hers too and must carry the very same identifier, or the Calendar Block
-- rule of the app would not see it. Never taken from the caller.
create or replace function public.online_booking_staff_member_id()
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select 'staff-amelie'::text;
$$;

comment on function public.online_booking_staff_member_id() is
  'Online booking: THE staff identifier of an online Appointment — the single placeholder of the app (current-staff-member.ts). Never taken from the caller.';

revoke all on function public.online_booking_staff_member_id() from public, anon, authenticated, service_role;

-- The Appointment model has no origin field; the existing free-text note is
-- the one place the professional can read where it came from.
create or replace function public.online_booking_appointment_note()
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select 'Réservation en ligne'::text;
$$;

comment on function public.online_booking_appointment_note() is
  'Online booking: the note written on an Appointment created online, so the professional can tell where it came from.';

revoke all on function public.online_booking_appointment_note() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. THE request validation rule
-- ---------------------------------------------------------------------------
-- A text as it is stored: without the leading and trailing characters the
-- device's own `String.prototype.trim()` removes. The device validates every
-- pulled row with that trim, and ONE row it refuses stops the whole pull
-- (CLOUD_SYNC.md §16.2): a first name made of a no-break space must never be
-- written. `btrim` removes spaces only, and `[[:space:]]` follows the
-- database locale, so the code points are spelled out.
create or replace function public.online_booking_clean_text(p_text text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select regexp_replace(
    coalesce(p_text, ''),
    '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$',
    '', 'g');
$$;

comment on function public.online_booking_clean_text(text) is
  'Online booking: a text without the leading and trailing characters JavaScript trim() removes — what the device will accept as non-blank.';

revoke all on function public.online_booking_clean_text(text) from public, anon, authenticated, service_role;

-- TRUE when a cleaned text is a presentable single-line value: 1 … p_max
-- characters, at least one visible character, no control character, no line
-- or paragraph separator, no bidirectional override.
create or replace function public.online_booking_is_plain_text(p_text text, p_max integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_text is not null
     and char_length(p_text) between 1 and p_max
     and p_text ~ '[^\s\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]'
     and p_text !~ '[\x01-\x1F\x7F-\x9F\u2028\u2029\u202A-\u202E\u2066-\u2069]';
$$;

revoke all on function public.online_booking_is_plain_text(text, integer) from public, anon, authenticated, service_role;

-- Comparison key of a name: cleaned, inner whitespace collapsed, lowercased.
-- Never stored.
create or replace function public.online_booking_text_key(p_text text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(regexp_replace(public.online_booking_clean_text(p_text), '[\s\u00A0]+', ' ', 'g'));
$$;

revoke all on function public.online_booking_text_key(text) from public, anon, authenticated, service_role;

-- The first field that makes a request unacceptable, or NULL. A pure rule of
-- the input: it reads no table, so it says nothing about any Business.
--   idempotency_key   16 … 128 characters of [A-Za-z0-9_-]
--   service_id        1 … 200 characters
--   starts_at         an instant
--   first_name        1 … 80 characters once cleaned, plain single-line text
--   last_name         1 … 80 characters once cleaned, plain single-line text
--   email             THE email shape rule (communications_is_valid_email),
--                     plain single-line text
--   phone             at most 40 characters, readable by THE phone rule
--                     (communications_client_phone_e164)
create or replace function public.online_booking_request_issue(
  p_service_id text,
  p_starts_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_idempotency_key text
) returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then 'idempotency_key'
    when p_service_id is null or char_length(btrim(p_service_id)) not between 1 and 200 then 'service_id'
    when p_starts_at is null or not isfinite(p_starts_at) then 'starts_at'
    when not public.online_booking_is_plain_text(public.online_booking_clean_text(p_first_name), 80) then 'first_name'
    when not public.online_booking_is_plain_text(public.online_booking_clean_text(p_last_name), 80) then 'last_name'
    when not public.online_booking_is_plain_text(public.online_booking_clean_text(p_email), 320)
      or not public.communications_is_valid_email(public.online_booking_clean_text(p_email))
      or public.online_booking_clean_text(p_email) ~ '[\s\u00A0\u1680\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]' then 'email'
    when p_phone is null
      or char_length(btrim(p_phone)) > 40
      or public.communications_client_phone_e164(p_phone) is null then 'phone'
  end;
$$;

comment on function public.online_booking_request_issue(text, timestamptz, text, text, text, text, text) is
  'Online booking: THE validation rule of a booking request — the first unacceptable field, or NULL. Reads no table.';

revoke all on function public.online_booking_request_issue(text, timestamptz, text, text, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. THE client matching rule
-- ---------------------------------------------------------------------------
-- An existing Client of THIS Business is reused only when the match is
-- reliable: live (not tombstoned), not archived, the same email (trimmed,
-- lowercased — the strong identifier of the import rule) AND a compatible
-- name (same first name; same last name, or none recorded). The oldest one
-- when several qualify. Never another Business: every predicate is scoped by
-- business_id. The row is locked FOR SHARE so a concurrent deletion waits —
-- or, if it won, the row no longer qualifies and a new Client is created.
-- A matched Client is NEVER modified: public input does not rewrite a record
-- the professional keeps.
create or replace function public.online_booking_find_client(
  p_business_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text
) returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select c.id
    from public.clients c
   where c.business_id = p_business_id
     and c.deleted_at is null
     and c.archived_at is null
     and lower(btrim(c.email)) = lower(btrim(p_email))
     and public.online_booking_text_key(c.first_name) = public.online_booking_text_key(p_first_name)
     and (nullif(public.online_booking_text_key(c.last_name), '') is null
          or public.online_booking_text_key(c.last_name) = public.online_booking_text_key(p_last_name))
   order by c.created_at, c.id
   limit 1
     for share;
$$;

comment on function public.online_booking_find_client(uuid, text, text, text) is
  'Online booking: THE client matching rule — the live, non-archived Client of this Business with the same email and a compatible name, locked FOR SHARE, or NULL. Never modifies a Client.';

revoke all on function public.online_booking_find_client(uuid, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The public answer of one booking
-- ---------------------------------------------------------------------------
-- Built from the booking record only, so the first answer and every replay
-- are identical. A reference, the service, the instants and the wall-clock
-- label — never a Business id, a Client id, an Appointment id or an amount.
create or replace function public.online_booking_booking_json(p_booking public.online_bookings)
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
      'service', jsonb_build_object(
        'id', p_booking.service_id,
        'name', p_booking.service_name,
        'duration_minutes', p_booking.duration_minutes),
      'starts_at', to_char(p_booking.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'ends_at', to_char(p_booking.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'local_date', to_char(p_booking.starts_at at time zone p_booking.time_zone, 'YYYY-MM-DD'),
      'local_time', to_char(p_booking.starts_at at time zone p_booking.time_zone, 'HH24:MI'),
      'time_zone', p_booking.time_zone));
$$;

revoke all on function public.online_booking_booking_json(public.online_bookings) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. THE booking transaction
-- ---------------------------------------------------------------------------
-- Answers (jsonb), or NULL:
--   NULL                    nothing can be booked here — the switch is off, the
--                           slug is unknown, the page is a draft, offline,
--                           paused or its Plus access lapsed (the same NULL)
--   INVALID_REQUEST         + "field": the first unacceptable field
--   BUSY                    the Business was locked for more than 3 seconds —
--                           nothing written; retry with the SAME key
--   IDEMPOTENCY_KEY_REUSED  the key already booked a DIFFERENT request
--   UNKNOWN_SERVICE         not a bookable service of this Business (whatever the reason)
--   SLOT_UNAVAILABLE        the start is not offered any more (whatever the reason)
--   BOOKED                  + "booking" (online_booking_booking_json)
-- Anything unexpected raises: the whole transaction is rolled back.
-- `p_now` is explicit so the rule is deterministic; the entry point passes now().
create or replace function public.online_booking_book(
  p_slug text,
  p_service_id text,
  p_starts_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
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
  v_service_id text := btrim(coalesce(p_service_id, ''));
  v_first_name text := public.online_booking_clean_text(p_first_name);
  v_last_name text := public.online_booking_clean_text(p_last_name);
  v_email text := public.online_booking_clean_text(p_email);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_request_hash text;
  v_previous_lock_timeout text;
  v_existing public.online_bookings;
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
  -- Lock, then decide again: only sound when each statement sees what the
  -- previous lock holder committed.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'online booking: booking creation requires READ COMMITTED' using errcode = '25001';
  end if;

  if not public.online_booking_creation_enabled() then
    return null;
  end if;

  v_issue := public.online_booking_request_issue(
    p_service_id, p_starts_at, p_first_name, p_last_name, p_email, p_phone, p_idempotency_key);
  if v_issue is not null then
    return jsonb_build_object('status', 'INVALID_REQUEST', 'field', v_issue);
  end if;

  -- Which Business the address names NOW, before any lock. Only the id is
  -- kept: the address and the time zone are read again under the lock.
  select p.business_id into v_business_id
    from public.business_booking_profiles p
   where p.slug = v_slug;
  if v_business_id is null then
    return null;
  end if;

  -- Nothing is locked for a page that cannot be booked — unless this key
  -- already booked there: a replay must find its booking even if the page
  -- was paused since.
  if not exists (select 1 from public.business_booking_profiles p
                  where p.business_id = v_business_id and p.published and p.booking_enabled)
     and not exists (select 1 from public.online_bookings b
                      where b.business_id = v_business_id and b.idempotency_key = p_idempotency_key) then
    return null;
  end if;

  v_request_hash := encode(sha256(convert_to(concat_ws(E'\n',
    v_service_id,
    to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    public.online_booking_text_key(v_first_name),
    public.online_booking_text_key(v_last_name),
    lower(v_email),
    public.communications_client_phone_e164(v_phone)), 'UTF8')), 'hex');

  v_previous_lock_timeout := current_setting('lock_timeout');
  perform set_config('lock_timeout', '3s', true);

  begin
    -- THE lock: one booking of a Business at a time, and never while its
    -- owner changes the publication state or the address
    -- (online_booking_set_state and online_booking_update_profile lock the
    -- same row). The row comes back as the lock returns it — its latest
    -- committed version — so the address and the time zone are read HERE,
    -- not before the wait: an address renamed or handed to another Business
    -- meanwhile books nothing (the NULL of an unknown address), and the time
    -- zone recorded is the one the slot rule reads.
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
        v_answer := public.online_booking_booking_json(v_existing);
      else
        v_answer := jsonb_build_object('status', 'IDEMPOTENCY_KEY_REUSED');
      end if;
    elsif not exists (
            select 1 from public.business_booking_profiles p
             where p.business_id = v_business_id and p.published and p.booking_enabled)
          or not public.online_booking_may_be_public(v_business_id, p_now) then
      v_answer := null;
    else
      select s.id, s.name, s.type, s.price_cents, b.duration_minutes
        into v_service
        from public.online_booking_bookable_services(v_business_id, v_service_id) b
        join public.services s on s.business_id = v_business_id and s.id = b.service_id;

      if not found then
        v_answer := jsonb_build_object('status', 'UNKNOWN_SERVICE');
      elsif not public.online_booking_slot_is_available(v_business_id, v_service.id, p_starts_at, p_now) then
        v_answer := jsonb_build_object('status', 'SLOT_UNAVAILABLE');
      else
        -- The customer: an existing Client on a reliable match, never
        -- modified; otherwise a new one — identity and contact only, no
        -- note, no birthday, no consent of any kind.
        v_client_id := public.online_booking_find_client(v_business_id, v_first_name, v_last_name, v_email);
        if v_client_id is null then
          v_client_id := gen_random_uuid()::text;
          insert into public.clients (business_id, id, first_name, last_name, phone, email)
          values (v_business_id, v_client_id, v_first_name, v_last_name, v_phone, v_email);
        end if;

        -- The Appointment, as a device writes one: a UUID, SCHEDULED, one
        -- item `<appointment>-item-0`, the catalog phases under their own
        -- ids in order — a snapshot of the service at this instant.
        v_appointment_id := gen_random_uuid()::text;
        v_item_id := v_appointment_id || '-item-0';

        insert into public.appointments
          (business_id, id, client_id, staff_member_id, start_at, status, notes)
        values
          (v_business_id, v_appointment_id, v_client_id, public.online_booking_staff_member_id(),
           p_starts_at, 'SCHEDULED', public.online_booking_appointment_note());

        insert into public.appointment_items
          (business_id, appointment_id, id, item_order, service_id, service_option_id,
           service_name, service_type, price_cents)
        values
          (v_business_id, v_appointment_id, v_item_id, 0, v_service.id, null,
           v_service.name, v_service.type, v_service.price_cents);

        insert into public.appointment_phases
          (business_id, appointment_id, appointment_item_id, id, position, name,
           duration_minutes, requires_staff)
        select v_business_id, v_appointment_id, v_item_id, ph.id,
               (row_number() over (order by ph.position, ph.id))::integer - 1,
               ph.name, ph.duration_minutes, ph.requires_staff
          from public.service_phases ph
         where ph.business_id = v_business_id and ph.service_id = v_service.id;

        -- What was written must be what was validated: the same length.
        if (select coalesce(sum(ph.duration_minutes), 0)
              from public.appointment_phases ph
             where ph.business_id = v_business_id and ph.appointment_id = v_appointment_id)
           <> v_service.duration_minutes then
          raise exception 'online booking: the service changed while it was being booked' using errcode = '40001';
        end if;

        insert into public.online_bookings
          (business_id, idempotency_key, request_hash, appointment_id,
           service_id, service_name, duration_minutes, starts_at, ends_at, time_zone,
           customer_first_name, customer_last_name, customer_email, customer_phone)
        values
          (v_business_id, p_idempotency_key, v_request_hash, v_appointment_id,
           v_service.id, v_service.name, v_service.duration_minutes, p_starts_at,
           p_starts_at + make_interval(mins => v_service.duration_minutes), v_time_zone,
           v_first_name, v_last_name, v_email, v_phone)
        returning * into v_booking;

        v_answer := public.online_booking_booking_json(v_booking);
      end if;
    end if;
  exception
    when lock_not_available then
      -- Everything this block wrote is undone with it.
      perform set_config('lock_timeout', v_previous_lock_timeout, true);
      return jsonb_build_object('status', 'BUSY');
  end;

  perform set_config('lock_timeout', v_previous_lock_timeout, true);
  return v_answer;
end;
$$;

comment on function public.online_booking_book(text, text, timestamptz, text, text, text, text, text, timestamptz) is
  'Online booking: THE booking transaction, seen at a given instant — validates, locks the Business (3 s at most), replays an idempotency key, decides eligibility, service and slot again under the lock (online_booking_slot_is_available), resolves or creates the Client, writes the canonical Appointment with its item and phases, and records the booking. All or nothing. No API role.';

revoke all on function public.online_booking_book(text, text, timestamptz, text, text, text, text, text, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. The website's write — ONE narrowly scoped entry point
-- ---------------------------------------------------------------------------
-- Keyed by the public slug: no Business id, no staff member, no duration, no
-- price, no phase is accepted. service_role ONLY: the website server calls it
-- with the secret key; `anon` and `authenticated` cannot.
create or replace function public.online_booking_create_booking(
  p_slug text,
  p_service_id text,
  p_starts_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_idempotency_key text
) returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.online_booking_book(
    p_slug, p_service_id, p_starts_at, p_first_name, p_last_name, p_email, p_phone,
    p_idempotency_key, now());
$$;

comment on function public.online_booking_create_booking(text, text, timestamptz, text, text, text, text, text) is
  'Online booking: creates ONE real appointment for a customer on a page that accepts bookings — or answers why not (NULL, INVALID_REQUEST, BUSY, IDEMPOTENCY_KEY_REUSED, UNKNOWN_SERVICE, SLOT_UNAVAILABLE). Atomic, idempotent by key. service_role only (the website server), behind the ONLINE_BOOKING_CREATION switch.';

revoke all on function public.online_booking_create_booking(text, text, timestamptz, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_create_booking(text, text, timestamptz, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. A deleted Client never orphans an online booking
-- ---------------------------------------------------------------------------
-- Every device refuses to delete a Client an Appointment still references,
-- and a restore refuses a dataset where a live Appointment names a deleted
-- Client (CLOUD_SYNC.md §16.2). A device cannot apply that guard to a
-- booking it has not pulled yet: it may tombstone the very Client the server
-- just matched. The server then keeps the invariant itself, as if the
-- deletion had come first: each live Appointment of an online booking that
-- names the tombstoned Client is moved to a NEW Client built from the
-- contact the customer gave for THAT booking — same transaction as the
-- tombstone, so no reader ever sees the orphan. The deleted record stays
-- deleted; nothing of it (notes, birthday, consent, photo) is carried over.
--
-- Several bookings may have matched the one Client with DIFFERENT contacts:
-- the matching rule ignores the phone, and a Client without a last name
-- matches any. So ONE new Client per distinct contact (first name, last
-- name, email, phone, exactly as stored), and each Appointment goes to the
-- one built from its own booking: a new Client never carries another
-- booking's details. Bookings that gave the identical contact share one.
--
-- The moves are ordinary writes of this transaction: the appointments' own
-- sync trigger (appointments_sync_before_write) stamps them, like the new
-- Clients and the tombstone, with this transaction's updated_at and a new
-- sync_version, so every device pulls them together, under its usual cursor.
create or replace function public.online_booking_reattach_deleted_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_client_id text;
  v_contact record;
begin
  for v_contact in
    select b.customer_first_name, b.customer_last_name, b.customer_email, b.customer_phone
      from public.online_bookings b
      join public.appointments a
        on a.business_id = b.business_id and a.id = b.appointment_id
     where a.business_id = new.business_id
       and a.client_id = new.id
       and a.deleted_at is null
     group by b.customer_first_name, b.customer_last_name, b.customer_email, b.customer_phone
     order by min(b.created_at), b.customer_email, b.customer_first_name, b.customer_last_name, b.customer_phone
  loop
    v_new_client_id := gen_random_uuid()::text;
    insert into public.clients (business_id, id, first_name, last_name, phone, email)
    values (new.business_id, v_new_client_id, v_contact.customer_first_name,
            v_contact.customer_last_name, v_contact.customer_phone, v_contact.customer_email);

    -- An Appointment has at most one booking (unique (business_id, appointment_id)).
    update public.appointments a
       set client_id = v_new_client_id
      from public.online_bookings b
     where b.business_id = a.business_id
       and b.appointment_id = a.id
       and a.business_id = new.business_id
       and a.client_id = new.id
       and a.deleted_at is null
       and b.customer_first_name = v_contact.customer_first_name
       and b.customer_last_name = v_contact.customer_last_name
       and b.customer_email = v_contact.customer_email
       and b.customer_phone = v_contact.customer_phone;
  end loop;
  return null;
end;
$$;

comment on function public.online_booking_reattach_deleted_client() is
  'Online booking: AFTER a Client is tombstoned, moves each live Appointment of an online booking that names it to a new Client built from THAT booking''s contact — one new Client per distinct contact, never another booking''s details. The server-side form of the device rule "a live Appointment names a live Client".';

revoke all on function public.online_booking_reattach_deleted_client() from public, anon, authenticated, service_role;

drop trigger if exists clients_online_booking_reattach on public.clients;
create trigger clients_online_booking_reattach
  after update of deleted_at on public.clients
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.online_booking_reattach_deleted_client();

-- ---------------------------------------------------------------------------
-- 11. What overlaps an online booking — derived, never stored
-- ---------------------------------------------------------------------------
-- For every online booking whose Appointment still occupies the schedule and
-- has not ended at `p_now`: each OTHER busy interval of the Business that
-- intersects it — an appointment (full span, the engine's conservative rule;
-- CANCELLED, NO_SHOW and deleted ones occupy nothing) or a calendar block.
-- It reads the Appointment as it is NOW (moved, shortened, cancelled), so a
-- conflict disappears the moment the professional resolves it, and one that
-- a late synchronization creates appears without any writer having to
-- notice it.
create or replace function public.online_booking_conflicts(p_business_id uuid, p_now timestamptz)
returns table (
  booking_id uuid,
  appointment_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  conflict_kind text,
  conflict_id text,
  conflict_starts_at timestamptz,
  conflict_ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with spans as (
    select a.id, a.start_at as span_start, a.start_at + make_interval(mins => t.minutes) as span_end
      from public.appointments a
      cross join lateral (
        select coalesce(sum(ph.duration_minutes), 0)::integer as minutes
          from public.appointment_phases ph
         where ph.business_id = a.business_id and ph.appointment_id = a.id
      ) t
     where a.business_id = p_business_id
       and a.deleted_at is null
       and a.status not in ('CANCELLED', 'NO_SHOW')
       and t.minutes > 0
  ),
  booked as (
    select b.id as booking_id, s.id, s.span_start, s.span_end
      from public.online_bookings b
      join spans s on s.id = b.appointment_id
     where b.business_id = p_business_id
       and s.span_end > p_now
  )
  select k.booking_id, k.id, k.span_start, k.span_end, 'APPOINTMENT', o.id, o.span_start, o.span_end
    from booked k
    join spans o on o.id <> k.id and o.span_start < k.span_end and k.span_start < o.span_end
  union all
  select k.booking_id, k.id, k.span_start, k.span_end, 'CALENDAR_BLOCK', c.id, c.start_at, c.end_at
    from booked k
    join public.calendar_blocks c
      on c.business_id = p_business_id
     and c.deleted_at is null
     and c.start_at < k.span_end
     and k.span_start < c.end_at
   order by 3, 2, 5, 7, 6;
$$;

comment on function public.online_booking_conflicts(uuid, timestamptz) is
  'Online booking: every busy interval (appointment full span, calendar block) that intersects the Appointment of an online booking not ended at the given instant. Derived from the committed calendar at each call — nothing stored. No API role.';

revoke all on function public.online_booking_conflicts(uuid, timestamptz) from public, anon, authenticated, service_role;

-- The owner reads the overlaps of HER Business: ids and instants of her own
-- appointments and blocks, nothing of the booking record.
create or replace function public.online_booking_read_conflicts(p_business_id uuid)
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

  return jsonb_build_object('conflicts', coalesce((
    select jsonb_agg(jsonb_build_object(
             'appointment_id', c.appointment_id,
             'starts_at', to_char(c.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'ends_at', to_char(c.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'with', jsonb_build_object(
               'kind', c.conflict_kind,
               'id', c.conflict_id,
               'starts_at', to_char(c.conflict_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'ends_at', to_char(c.conflict_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
           order by c.starts_at, c.appointment_id, c.conflict_kind, c.conflict_starts_at, c.conflict_id)
      from public.online_booking_conflicts(p_business_id, now()) c), '[]'::jsonb));
end;
$$;

comment on function public.online_booking_read_conflicts(uuid) is
  'Online booking: the owner reads what currently overlaps the online bookings of her Business — her own appointment and calendar block ids and instants. Ownership checked (42501).';

revoke all on function public.online_booking_read_conflicts(uuid) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_read_conflicts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. The operator switch — flip, in ONE statement
-- ---------------------------------------------------------------------------
-- Result: { "enabled", "bookings" } — the count is informational. Closing
-- rewrites nothing: existing bookings and their appointments stay. No EXECUTE
-- grant: the table owner (the SQL Editor's `postgres`) is the only caller.
create or replace function public.online_booking_set_creation_enabled(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_enabled is null then
    raise exception 'online booking: enabled must be true or false' using errcode = '22023';
  end if;

  insert into public.server_feature_flags (flag, enabled, enabled_at, updated_at)
  values ('ONLINE_BOOKING_CREATION', p_enabled,
          case when p_enabled then now() end, now())
  on conflict (flag) do update set
    enabled = excluded.enabled,
    enabled_at = case when excluded.enabled then now() end,
    updated_at = now();

  return jsonb_build_object(
    'enabled', p_enabled,
    'bookings', (select count(*)::integer from public.online_bookings));
end;
$$;

comment on function public.online_booking_set_creation_enabled(boolean) is
  'Online booking: the OPERATOR switch of booking creation — opens or closes online_booking_create_booking and reports how many bookings exist. No EXECUTE grant: table owner only.';

revoke all on function public.online_booking_set_creation_enabled(boolean) from public, anon, authenticated, service_role;
