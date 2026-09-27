-- Souris — Client lifecycle SMS (SMS pivot Phase 2)
--
-- docs/architecture/COMMUNICATIONS.md §34–§44. The server-authoritative
-- client lifecycle SMS engine for EXACTLY two automations:
--
--   CLIENT_BIRTHDAY_OFFER       a birthday offer on the client's birthday
--   INACTIVE_CLIENT_FOLLOWUP    a win-back offer after a period of inactivity
--
-- What this migration adds:
--
--   1. explicit promotional SMS consent on `public.clients` — three additive
--      nullable columns (`sms_marketing_consent`, `…_updated_at`,
--      `…_source`). NULL consent = UNKNOWN. Only OPTED_IN may ever receive a
--      lifecycle SMS; UNKNOWN and OPTED_OUT never do. A phone number by
--      itself is NEVER consent, and NO existing row is rewritten: every
--      existing client stays UNKNOWN;
--   2. the `CLIENT_BIRTHDAY_OFFER` kind — an additive CHECK replacement on
--      the queue vocabulary (the Lot A pattern);
--   3. `business_lifecycle_sms_preferences` — one row per Business, both
--      automations OFF by default. Deliberately SEPARATE from the deprecated
--      appointment-SMS field `business_communication_preferences.
--      sms_reminders_enabled`, which stays dormant;
--   4. two narrow owner RPCs (read/update the lifecycle preferences) in the
--      exact security model of the Lot B preference RPCs;
--   5. the daily lifecycle reconciliation —
--      `communications_reconcile_client_lifecycle(business)` and
--      `…_all()` — which derives the authoritative current state (birthday
--      FIRST, win-back second), enqueues idempotently into the ONE existing
--      queue and cancels stale pending lifecycle rows;
--   6. trigger extensions: a client who becomes ineligible (consent revoked
--      or reset, archived, deleted, phone unusable) loses her pending
--      lifecycle SMS at once; a new future valid appointment cancels the
--      pending win-back (never the birthday offer); disabling one automation
--      cancels ITS pending rows only;
--   7. the sync RPCs replaced IN PLACE so the CLIENT aggregate carries the
--      consent (usual missing-key rule: an older build can never erase it).
--
-- PRODUCT RULES pinned here (docs/architecture/COMMUNICATIONS.md):
--
--   * completed visit  = appointments.status = 'COMPLETED' AND deleted_at IS
--     NULL; the LATEST one orders by start_at DESC, id DESC. Never derived
--     from start_at < now(), paid_at, sales or checkout;
--   * a client with ZERO completed appointments is NOT eligible for win-back
--     (imported address books never get "ça fait longtemps");
--   * win-back requires NO future valid appointment (deleted_at IS NULL,
--     status IN (SCHEDULED, CONFIRMED), start_at > now());
--   * inactivity episode identity: client:<id>:winback:<last completed
--     appointment id> — one completed visit yields at most ONE win-back
--     episode, FAILED stays terminal for the episode, and a fresh episode
--     needs a fresh completed visit;
--   * birthday identity: client:<id>:birthday:<Europe/Paris civil year> —
--     annual dedupe, FAILED terminal for the year;
--   * birthday matching uses the Europe/Paris CIVIL date and mirrors the app
--     domain exactly: a 29 February birthday is celebrated on 28 February in
--     a year without a 29th. Never the UTC date;
--   * offer expiry: valid_until = Europe/Paris civil enqueue date +
--     validity_days, inclusive (27/09 + 7 → valid through 04/10), snapshotted
--     into the payload and never recomputed;
--   * promotional cooldown (V1 product constant, 30 days, not a setting):
--     win-back is blocked while ANY lifecycle promotional SMS of the client
--     is SCHEDULED/PROCESSING, was SENT within the last 30 days, or a
--     birthday offer was created today (birthday priority — a same-day
--     birthday defers the win-back without consuming its episode). The
--     birthday automation itself is annual-dedupe driven ONLY and is never
--     suppressed by a prior win-back;
--   * the payload is a minimal offer snapshot — business_name,
--     client_first_name, discount_percent, valid_until — never a phone, an
--     appointment id, services, notes, history or consent detail; later
--     Business setting changes never mutate an already-enqueued offer;
--   * no coupon/voucher/redemption model: the communication row is the audit
--     record of the promise.
--
-- SCHEDULING: the daily reconciliation is designed for a pg_cron job at
-- 08:30 UTC (`30 8 * * *` — 09:30 Paris in winter, 10:30 in summer; the
-- seasonal drift is accepted in V1). THE CRON JOB IS DELIBERATELY NOT
-- CREATED HERE — installing it is a manual, controlled step
-- (supabase/README.md), exactly like the worker cron.
--
-- PRODUCTION SAFETY — applying this migration alone:
--
--   * enables ZERO automations (the preferences table starts EMPTY and both
--     switches default FALSE; no row is inserted or updated);
--   * changes ZERO consent (no backfill: every existing client stays
--     UNKNOWN semantically — NULL);
--   * enqueues ZERO communications and sends ZERO SMS (nothing calls the
--     reconciliation: no cron exists, and the triggers only CANCEL);
--   * rewrites NO row: no updated_at / sync_version moves, no device
--     re-pulls anything.
--
-- Safe to re-run: `add column if not exists`, `create table if not exists`,
-- `create or replace`, `drop trigger if exists`, and the CHECK replacement
-- drops with `if exists` before re-adding.

-- ---------------------------------------------------------------------------
-- 1. Client promotional SMS consent — additive, UNKNOWN by default
-- ---------------------------------------------------------------------------
-- NULL = UNKNOWN (never asked / never recorded). The three columns travel
-- together: a recorded consent always carries the instant and the source of
-- the record, and clearing back to UNKNOWN clears the audit pair with it.
-- CLIENT_STOP is reserved for a future inbound unsubscribe mechanism; Phase 2
-- only records PROFESSIONAL captures.
alter table public.clients add column if not exists sms_marketing_consent text;
alter table public.clients add column if not exists sms_marketing_consent_updated_at timestamptz;
alter table public.clients add column if not exists sms_marketing_consent_source text;

alter table public.clients drop constraint if exists clients_sms_marketing_consent_check;
alter table public.clients add constraint clients_sms_marketing_consent_check
  check (sms_marketing_consent is null or sms_marketing_consent in ('OPTED_IN', 'OPTED_OUT'));

alter table public.clients drop constraint if exists clients_sms_marketing_consent_source_check;
alter table public.clients add constraint clients_sms_marketing_consent_source_check
  check (sms_marketing_consent_source is null
         or sms_marketing_consent_source in ('PROFESSIONAL', 'CLIENT_STOP'));

alter table public.clients drop constraint if exists clients_sms_marketing_consent_audit_check;
alter table public.clients add constraint clients_sms_marketing_consent_audit_check
  check (((sms_marketing_consent is null) = (sms_marketing_consent_updated_at is null))
     and ((sms_marketing_consent is null) = (sms_marketing_consent_source is null)));

comment on column public.clients.sms_marketing_consent is
  'Explicit promotional SMS consent (SMS pivot Phase 2): OPTED_IN | OPTED_OUT, NULL = UNKNOWN. Only OPTED_IN may receive lifecycle SMS; a phone number alone is never consent. Never backfilled.';
comment on column public.clients.sms_marketing_consent_updated_at is
  'Instant the consent was last recorded. Travels with sms_marketing_consent; NULL while UNKNOWN.';
comment on column public.clients.sms_marketing_consent_source is
  'Who recorded the consent: PROFESSIONAL (Phase 2) | CLIENT_STOP (reserved for the future unsubscribe mechanism). NULL while UNKNOWN.';

-- ---------------------------------------------------------------------------
-- 2. The CLIENT_BIRTHDAY_OFFER kind — additive constraint replacement
-- ---------------------------------------------------------------------------
alter table public.scheduled_communications
  drop constraint if exists scheduled_communications_kind_check;
alter table public.scheduled_communications
  add constraint scheduled_communications_kind_check
  check (kind in (
    'APPOINTMENT_REMINDER',
    'APPOINTMENT_RESCHEDULED',
    'APPOINTMENT_CANCELLED',
    'INACTIVE_CLIENT_FOLLOWUP',
    'CLIENT_BIRTHDAY_OFFER'
  ));

-- ---------------------------------------------------------------------------
-- 3. Business lifecycle SMS preferences — separate table, both automations OFF
-- ---------------------------------------------------------------------------
-- NOT `business_communication_preferences.sms_reminders_enabled`: that field
-- is the retired appointment-SMS compatibility state and stays dormant. The
-- lifecycle automations get their OWN server-authoritative row, empty until
-- the owner touches it; a missing row reads as both OFF with the V1 defaults.
create table if not exists public.business_lifecycle_sms_preferences (
  business_id uuid primary key references public.businesses (id) on delete cascade,

  birthday_sms_enabled boolean not null default false,
  birthday_discount_percent integer not null default 15
    check (birthday_discount_percent between 1 and 100),
  birthday_validity_days integer not null default 7
    check (birthday_validity_days between 1 and 365),

  winback_sms_enabled boolean not null default false,
  winback_after_days integer not null default 60
    check (winback_after_days between 1 and 730),
  winback_discount_percent integer not null default 10
    check (winback_discount_percent between 1 and 100),
  winback_validity_days integer not null default 7
    check (winback_validity_days between 1 and 365),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_lifecycle_sms_preferences is
  'SMS pivot Phase 2: the client lifecycle SMS automations of a Business (birthday offer, win-back), server-authoritative. Both OFF by default; no authenticated table access — the owner goes through communications_read_lifecycle_sms_preferences / communications_update_lifecycle_sms_preferences.';

create or replace function public.communications_lifecycle_preferences_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.business_id := old.business_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.communications_lifecycle_preferences_before_write() from public, anon, authenticated;

drop trigger if exists business_lifecycle_sms_preferences_before_write
  on public.business_lifecycle_sms_preferences;
create trigger business_lifecycle_sms_preferences_before_write
  before insert or update on public.business_lifecycle_sms_preferences
  for each row execute function public.communications_lifecycle_preferences_before_write();

-- No client path at all, like the queue and the Lot B preference table.
alter table public.business_lifecycle_sms_preferences enable row level security;
revoke all on table public.business_lifecycle_sms_preferences from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Civil-date and birthday helpers — Europe/Paris, mirroring the app domain
-- ---------------------------------------------------------------------------
-- The V1 single-market constant, like the worker's display timezone. A future
-- business timezone would change THIS one function.
create or replace function public.communications_paris_civil_date(p_instant timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_instant at time zone 'Europe/Paris')::date;
$$;

comment on function public.communications_paris_civil_date(timestamptz) is
  'SMS pivot Phase 2: THE civil date rule of the lifecycle automations — the Europe/Paris calendar day of an instant. Never the UTC date.';

revoke all on function public.communications_paris_civil_date(timestamptz) from public, anon, authenticated;
grant execute on function public.communications_paris_civil_date(timestamptz) to service_role;

-- Mirrors src/domain/clients/birthday.ts `isClientBirthdayOnDate` exactly:
-- the `MM-DD` key matches the civil date, and a `02-29` birthday is
-- celebrated on `02-28` in a year without a 29th, so it is never skipped.
create or replace function public.communications_is_birthday_on_civil_date(
  p_birthday text,
  p_date date
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_birthday is null then false
    when p_birthday = to_char(p_date, 'MM-DD') then true
    when p_birthday = '02-29' and to_char(p_date, 'MM-DD') = '02-28' then
      not ((extract(year from p_date)::integer % 4 = 0
            and extract(year from p_date)::integer % 100 <> 0)
        or extract(year from p_date)::integer % 400 = 0)
    else false
  end;
$$;

comment on function public.communications_is_birthday_on_civil_date(text, date) is
  'SMS pivot Phase 2: whether a client MM-DD birthday falls on a civil date — the ONE server rule, mirroring the app domain (29 February → 28 February in a non-leap year).';

revoke all on function public.communications_is_birthday_on_civil_date(text, date) from public, anon, authenticated;
grant execute on function public.communications_is_birthday_on_civil_date(text, date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The offer snapshot payload — minimal, frozen at enqueue time
-- ---------------------------------------------------------------------------
-- business_name, client_first_name, discount_percent, valid_until — NOTHING
-- else: no phone, no appointment id, no services, no notes, no history, no
-- consent detail, no provider data. Later Business setting changes never
-- mutate an already-enqueued offer.
create or replace function public.communications_client_lifecycle_payload(
  p_business_id uuid,
  p_client_id text,
  p_discount_percent integer,
  p_valid_until date
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business_name', b.name,
    'client_first_name', c.first_name,
    'discount_percent', p_discount_percent,
    'valid_until', to_char(p_valid_until, 'YYYY-MM-DD')
  )
  from public.businesses b
  left join public.clients c on c.business_id = b.id and c.id = p_client_id
  where b.id = p_business_id;
$$;

revoke all on function public.communications_client_lifecycle_payload(uuid, text, integer, date) from public, anon, authenticated;
grant execute on function public.communications_client_lifecycle_payload(uuid, text, integer, date) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Lifecycle eligibility and episode helpers
-- ---------------------------------------------------------------------------
-- The shared base rule of BOTH automations: the client exists, is live (not
-- tombstoned), active (not archived), explicitly OPTED_IN, and has a usable
-- SMS destination (the existing Phase 1 phone rules). UNKNOWN and OPTED_OUT
-- never pass — a phone number alone is never consent.
create or replace function public.communications_client_lifecycle_recipient(
  p_business_id uuid,
  p_client_id text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.communications_client_sms_recipient(p_business_id, c.id)
    from public.clients c
   where c.business_id = p_business_id
     and c.id = p_client_id
     and c.deleted_at is null
     and c.archived_at is null
     and c.sms_marketing_consent = 'OPTED_IN';
$$;

comment on function public.communications_client_lifecycle_recipient(uuid, text) is
  'SMS pivot Phase 2: the lifecycle SMS destination of one client, or NULL when ineligible (deleted, archived, consent not OPTED_IN, unusable phone). The shared base rule of both automations.';

revoke all on function public.communications_client_lifecycle_recipient(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_client_lifecycle_recipient(uuid, text) to service_role;

-- The authoritative completed-visit rule: status COMPLETED, not tombstoned,
-- latest by start_at DESC then id DESC (deterministic tie-break). Its id IS
-- the inactivity episode identity.
create or replace function public.communications_client_last_completed_appointment(
  p_business_id uuid,
  p_client_id text
) returns table (appointment_id text, start_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.start_at
    from public.appointments a
   where a.business_id = p_business_id
     and a.client_id = p_client_id
     and a.deleted_at is null
     and a.status = 'COMPLETED'
   order by a.start_at desc, a.id desc
   limit 1;
$$;

comment on function public.communications_client_last_completed_appointment(uuid, text) is
  'SMS pivot Phase 2: THE completed-visit rule — the latest COMPLETED, non-tombstoned appointment of a client (start_at DESC, id DESC). Never derived from start_at < now(), paid_at, sales or checkout.';

revoke all on function public.communications_client_last_completed_appointment(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_client_last_completed_appointment(uuid, text) to service_role;

-- A future valid appointment suppresses win-back entirely.
create or replace function public.communications_client_has_future_valid_appointment(
  p_business_id uuid,
  p_client_id text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.appointments a
     where a.business_id = p_business_id
       and a.client_id = p_client_id
       and a.deleted_at is null
       and a.status in ('SCHEDULED', 'CONFIRMED')
       and a.start_at > now()
  );
$$;

revoke all on function public.communications_client_has_future_valid_appointment(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_client_has_future_valid_appointment(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Pending-cancellation helpers (client-scoped and business-scoped)
-- ---------------------------------------------------------------------------
-- Legal transitions only (SCHEDULED|PROCESSING → CANCELLED); SENT / FAILED /
-- CANCELLED history is never touched. `p_kind` NULL cancels BOTH lifecycle
-- kinds; appointment communications are never touched by either helper.
create or replace function public.communications_cancel_client_lifecycle_pending(
  p_business_id uuid,
  p_client_id text,
  p_kind text default null
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_kind is not null
     and p_kind not in ('CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP') then
    raise exception 'communications: unknown lifecycle kind' using errcode = '22023';
  end if;
  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now()
   where business_id = p_business_id
     and source_type = 'CLIENT'
     and source_id = p_client_id
     and channel = 'SMS'
     and kind in ('CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP')
     and (p_kind is null or kind = p_kind)
     and status in ('SCHEDULED', 'PROCESSING');
end;
$$;

comment on function public.communications_cancel_client_lifecycle_pending(uuid, text, text) is
  'SMS pivot Phase 2: cancel one client''s pending lifecycle SMS (one kind, or both). Never touches SENT/FAILED/CANCELLED history or appointment communications.';

revoke all on function public.communications_cancel_client_lifecycle_pending(uuid, text, text) from public, anon, authenticated;
grant execute on function public.communications_cancel_client_lifecycle_pending(uuid, text, text) to service_role;

create or replace function public.communications_cancel_business_client_lifecycle_pending(
  p_business_id uuid,
  p_kind text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_kind is null
     or p_kind not in ('CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP') then
    raise exception 'communications: unknown lifecycle kind' using errcode = '22023';
  end if;
  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now()
   where business_id = p_business_id
     and source_type = 'CLIENT'
     and channel = 'SMS'
     and kind = p_kind
     and status in ('SCHEDULED', 'PROCESSING');
end;
$$;

comment on function public.communications_cancel_business_client_lifecycle_pending(uuid, text) is
  'SMS pivot Phase 2: cancel ONE lifecycle automation''s pending SMS of a Business (disable behavior). Never touches the other automation, appointment communications or terminal history.';

revoke all on function public.communications_cancel_business_client_lifecycle_pending(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_cancel_business_client_lifecycle_pending(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. THE daily lifecycle reconciliation — one Business
-- ---------------------------------------------------------------------------
-- Derives the authoritative CURRENT state and converges the queue:
--
--   pass 0  cancel stale pending lifecycle rows (client became ineligible,
--           automation disabled, the birthday is no longer today, the
--           win-back episode is no longer current);
--   pass 1  birthday — enqueue `client:<id>:birthday:<Paris year>` for every
--           eligible client whose birthday is TODAY (Paris civil date);
--   pass 2  win-back — enqueue `client:<id>:winback:<last completed
--           appointment id>` for every eligible inactive client, unless the
--           promotional cooldown or today's birthday priority blocks it.
--
-- Idempotent by construction: enqueue is dedupe-keyed, so the same daily run
-- executed twice creates nothing more. FAILED rows are terminal for their
-- episode/year: the dedupe key blocks any automatic recreation. Records are
-- enqueued due immediately (scheduled_for = now()); the existing worker
-- sends them on its next pass.
create or replace function public.communications_reconcile_client_lifecycle(
  p_business_id uuid
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prefs record;
  v_today date;
  v_year integer;
  v_pending record;
  v_client record;
  v_recipient text;
  v_last record;
  v_stale boolean;
begin
  if p_business_id is null then
    raise exception 'communications: business id is required' using errcode = '22023';
  end if;

  select birthday_sms_enabled, birthday_discount_percent, birthday_validity_days,
         winback_sms_enabled, winback_after_days, winback_discount_percent, winback_validity_days
    into v_prefs
    from public.business_lifecycle_sms_preferences
   where business_id = p_business_id;

  v_today := public.communications_paris_civil_date(now());
  v_year := extract(year from v_today)::integer;

  -- ------------------------------------------------------------- pass 0 ----
  for v_pending in
    select sc.id, sc.kind, sc.source_id, sc.dedupe_key, c.birthday as client_birthday
      from public.scheduled_communications sc
      left join public.clients c
        on c.business_id = sc.business_id and c.id = sc.source_id
     where sc.business_id = p_business_id
       and sc.source_type = 'CLIENT'
       and sc.channel = 'SMS'
       and sc.kind in ('CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP')
       and sc.status in ('SCHEDULED', 'PROCESSING')
  loop
    v_recipient := public.communications_client_lifecycle_recipient(p_business_id, v_pending.source_id);
    v_stale := v_recipient is null;

    if not v_stale and v_pending.kind = 'CLIENT_BIRTHDAY_OFFER' then
      v_stale := not coalesce(v_prefs.birthday_sms_enabled, false)
        or not public.communications_is_birthday_on_civil_date(v_pending.client_birthday, v_today);
    end if;

    if not v_stale and v_pending.kind = 'INACTIVE_CLIENT_FOLLOWUP' then
      if not coalesce(v_prefs.winback_sms_enabled, false) then
        v_stale := true;
      else
        select appointment_id, start_at into v_last
          from public.communications_client_last_completed_appointment(p_business_id, v_pending.source_id);
        v_stale := v_last.appointment_id is null
          or v_last.start_at > now() - make_interval(days => v_prefs.winback_after_days)
          or public.communications_client_has_future_valid_appointment(p_business_id, v_pending.source_id)
          -- A newer completed visit started a NEW episode: the old pending
          -- row no longer describes the current inactivity.
          or v_pending.dedupe_key
             <> 'client:' || v_pending.source_id || ':winback:' || v_last.appointment_id;
      end if;
    end if;

    if v_stale then
      perform public.communications_cancel(p_business_id, v_pending.id);
    end if;
  end loop;

  -- ------------------------------------------------- pass 1: birthday ------
  if coalesce(v_prefs.birthday_sms_enabled, false) then
    for v_client in
      select c.id
        from public.clients c
       where c.business_id = p_business_id
         and c.deleted_at is null
         and c.archived_at is null
         and c.sms_marketing_consent = 'OPTED_IN'
         and c.birthday is not null
         and public.communications_is_birthday_on_civil_date(c.birthday, v_today)
    loop
      v_recipient := public.communications_client_lifecycle_recipient(p_business_id, v_client.id);
      if v_recipient is null then
        continue;
      end if;
      -- Annual dedupe: `communications_enqueue` answers ALREADY_ENQUEUED for
      -- a key that exists in ANY state (pending, SENT, FAILED, CANCELLED) —
      -- one logical birthday offer per client per Paris civil year, ever.
      perform public.communications_enqueue(
        p_business_id, 'CLIENT', v_client.id,
        'CLIENT_BIRTHDAY_OFFER', 'SMS',
        v_recipient,
        public.communications_client_lifecycle_payload(
          p_business_id, v_client.id,
          v_prefs.birthday_discount_percent,
          v_today + v_prefs.birthday_validity_days),
        now(),
        'client:' || v_client.id || ':birthday:' || v_year);
    end loop;
  end if;

  -- ------------------------------------------------- pass 2: win-back ------
  if coalesce(v_prefs.winback_sms_enabled, false) then
    for v_client in
      select c.id
        from public.clients c
       where c.business_id = p_business_id
         and c.deleted_at is null
         and c.archived_at is null
         and c.sms_marketing_consent = 'OPTED_IN'
    loop
      v_recipient := public.communications_client_lifecycle_recipient(p_business_id, v_client.id);
      if v_recipient is null then
        continue;
      end if;

      -- The completed-visit rule: no history → no win-back, ever.
      select appointment_id, start_at into v_last
        from public.communications_client_last_completed_appointment(p_business_id, v_client.id);
      if v_last.appointment_id is null then
        continue;
      end if;
      if v_last.start_at > now() - make_interval(days => v_prefs.winback_after_days) then
        continue;
      end if;
      if public.communications_client_has_future_valid_appointment(p_business_id, v_client.id) then
        continue;
      end if;

      -- Promotional cooldown (30 days, V1 constant) + birthday priority:
      -- blocked while any lifecycle SMS is pending, was SENT within 30 days,
      -- or a birthday offer was created TODAY (whatever its outcome —
      -- birthday first, win-back deferred, episode key unchanged). The
      -- birthday automation is never gated by this cooldown.
      if exists (
        select 1
          from public.scheduled_communications sc
         where sc.business_id = p_business_id
           and sc.source_type = 'CLIENT'
           and sc.source_id = v_client.id
           and sc.channel = 'SMS'
           and sc.kind in ('CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP')
           and (sc.status in ('SCHEDULED', 'PROCESSING')
             or (sc.status = 'SENT' and sc.sent_at > now() - interval '30 days')
             or (sc.kind = 'CLIENT_BIRTHDAY_OFFER'
                 and public.communications_paris_civil_date(sc.created_at) = v_today))
      ) then
        continue;
      end if;

      -- Episode dedupe: one completed visit → at most one win-back episode.
      -- FAILED stays terminal for the same key; a fresh episode requires a
      -- fresh completed visit (a new latest appointment id).
      perform public.communications_enqueue(
        p_business_id, 'CLIENT', v_client.id,
        'INACTIVE_CLIENT_FOLLOWUP', 'SMS',
        v_recipient,
        public.communications_client_lifecycle_payload(
          p_business_id, v_client.id,
          v_prefs.winback_discount_percent,
          v_today + v_prefs.winback_validity_days),
        now(),
        'client:' || v_client.id || ':winback:' || v_last.appointment_id);
    end loop;
  end if;
end;
$$;

comment on function public.communications_reconcile_client_lifecycle(uuid) is
  'SMS pivot Phase 2: THE daily lifecycle reconciliation of one Business — cancel stale pending rows, then birthday FIRST, win-back second, enqueued idempotently into the one queue. Server state only; safe to run any number of times.';

revoke all on function public.communications_reconcile_client_lifecycle(uuid) from public, anon, authenticated;
grant execute on function public.communications_reconcile_client_lifecycle(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. The daily sweep — every Business that needs convergence
-- ---------------------------------------------------------------------------
-- Businesses with an enabled automation, plus businesses that still hold
-- pending lifecycle rows (so a disable whose trigger cancellation was lost
-- converges within a day). The future cron job calls THIS function daily at
-- 08:30 UTC (`30 8 * * *`) — deliberately not installed by this migration.
create or replace function public.communications_reconcile_client_lifecycle_all()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business record;
begin
  for v_business in
    select business_id from public.business_lifecycle_sms_preferences
     where birthday_sms_enabled or winback_sms_enabled
    union
    select distinct business_id from public.scheduled_communications
     where source_type = 'CLIENT'
       and channel = 'SMS'
       and kind in ('CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP')
       and status in ('SCHEDULED', 'PROCESSING')
  loop
    perform public.communications_reconcile_client_lifecycle(v_business.business_id);
  end loop;
end;
$$;

comment on function public.communications_reconcile_client_lifecycle_all() is
  'SMS pivot Phase 2: the daily sweep — reconcile every Business with an enabled lifecycle automation or leftover pending lifecycle rows. The future 08:30 UTC cron target (30 8 * * *).';

revoke all on function public.communications_reconcile_client_lifecycle_all() from public, anon, authenticated;
grant execute on function public.communications_reconcile_client_lifecycle_all() to service_role;

-- ---------------------------------------------------------------------------
-- 10. Owner RPCs — read/update the lifecycle preferences
-- ---------------------------------------------------------------------------
-- Same security model as the Lot B preference RPCs: SECURITY DEFINER because
-- the table has no authenticated surface, `is_business_owner` FIRST, pinned
-- search_path, and a narrow documented result. Never queue internals.
create or replace function public.communications_read_lifecycle_sms_preferences(
  p_business_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;

  select * into v_row
    from public.business_lifecycle_sms_preferences
   where business_id = p_business_id;

  -- A Business that never touched the setting reads as the V1 defaults, both
  -- automations OFF. Reading creates nothing.
  return jsonb_build_object(
    'birthday_sms_enabled', coalesce(v_row.birthday_sms_enabled, false),
    'birthday_discount_percent', coalesce(v_row.birthday_discount_percent, 15),
    'birthday_validity_days', coalesce(v_row.birthday_validity_days, 7),
    'winback_sms_enabled', coalesce(v_row.winback_sms_enabled, false),
    'winback_after_days', coalesce(v_row.winback_after_days, 60),
    'winback_discount_percent', coalesce(v_row.winback_discount_percent, 10),
    'winback_validity_days', coalesce(v_row.winback_validity_days, 7),
    'updated_at', case when v_row.updated_at is null then null
      else to_char(v_row.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  );
end;
$$;

comment on function public.communications_read_lifecycle_sms_preferences(uuid) is
  'SMS pivot Phase 2: the owner''s lifecycle SMS preferences (V1 defaults, both automations OFF, when never configured). Owner-scoped; reading creates nothing.';

-- Booleans are required; the numeric knobs are optional (NULL keeps the
-- stored value, or the V1 default for a first row). Out-of-range values get
-- the stable INVALID_VALUE answer, not a raw CHECK error.
create or replace function public.communications_update_lifecycle_sms_preferences(
  p_business_id uuid,
  p_birthday_sms_enabled boolean,
  p_winback_sms_enabled boolean,
  p_birthday_discount_percent integer default null,
  p_birthday_validity_days integer default null,
  p_winback_after_days integer default null,
  p_winback_discount_percent integer default null,
  p_winback_validity_days integer default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;
  if p_birthday_sms_enabled is null or p_winback_sms_enabled is null then
    raise exception 'communications: both automation switches are required' using errcode = '22023';
  end if;
  if p_birthday_discount_percent is not null and p_birthday_discount_percent not between 1 and 100
     or p_winback_discount_percent is not null and p_winback_discount_percent not between 1 and 100
     or p_birthday_validity_days is not null and p_birthday_validity_days not between 1 and 365
     or p_winback_validity_days is not null and p_winback_validity_days not between 1 and 365
     or p_winback_after_days is not null and p_winback_after_days not between 1 and 730 then
    return jsonb_build_object('status', 'INVALID_VALUE');
  end if;

  insert into public.business_lifecycle_sms_preferences as prefs
    (business_id, birthday_sms_enabled, birthday_discount_percent, birthday_validity_days,
     winback_sms_enabled, winback_after_days, winback_discount_percent, winback_validity_days)
  values
    (p_business_id, p_birthday_sms_enabled,
     coalesce(p_birthday_discount_percent, 15), coalesce(p_birthday_validity_days, 7),
     p_winback_sms_enabled,
     coalesce(p_winback_after_days, 60), coalesce(p_winback_discount_percent, 10),
     coalesce(p_winback_validity_days, 7))
  on conflict (business_id) do update set
    birthday_sms_enabled = excluded.birthday_sms_enabled,
    birthday_discount_percent = coalesce(p_birthday_discount_percent, prefs.birthday_discount_percent),
    birthday_validity_days = coalesce(p_birthday_validity_days, prefs.birthday_validity_days),
    winback_sms_enabled = excluded.winback_sms_enabled,
    winback_after_days = coalesce(p_winback_after_days, prefs.winback_after_days),
    winback_discount_percent = coalesce(p_winback_discount_percent, prefs.winback_discount_percent),
    winback_validity_days = coalesce(p_winback_validity_days, prefs.winback_validity_days);

  select * into v_row
    from public.business_lifecycle_sms_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'status', 'UPDATED',
    'birthday_sms_enabled', v_row.birthday_sms_enabled,
    'birthday_discount_percent', v_row.birthday_discount_percent,
    'birthday_validity_days', v_row.birthday_validity_days,
    'winback_sms_enabled', v_row.winback_sms_enabled,
    'winback_after_days', v_row.winback_after_days,
    'winback_discount_percent', v_row.winback_discount_percent,
    'winback_validity_days', v_row.winback_validity_days
  );
end;
$$;

comment on function public.communications_update_lifecycle_sms_preferences(uuid, boolean, boolean, integer, integer, integer, integer, integer) is
  'SMS pivot Phase 2: the owner updates the lifecycle SMS automations. Disabling one cancels ITS pending rows through the table trigger; enabling schedules nothing by itself — the daily reconciliation derives.';

revoke all on function public.communications_read_lifecycle_sms_preferences(uuid) from public, anon;
revoke all on function public.communications_update_lifecycle_sms_preferences(uuid, boolean, boolean, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.communications_read_lifecycle_sms_preferences(uuid) to authenticated;
grant execute on function public.communications_update_lifecycle_sms_preferences(uuid, boolean, boolean, integer, integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Disable behavior — the lifecycle preference trigger
-- ---------------------------------------------------------------------------
-- Turning ONE automation off cancels THAT automation's pending rows only —
-- never the other automation, never appointment EMAIL communications, never
-- terminal history. Enabling schedules NOTHING here: the daily lifecycle
-- reconciliation is the one derivation mechanism, so a stale eligibility can
-- never fire an SMS from a settings toggle. Errors are swallowed with a
-- warning; the daily sweep re-derives and converges (no CLIENT scope is
-- added to communication_reconciliation_jobs in Phase 2).
create or replace function public.communications_on_lifecycle_preferences_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.birthday_sms_enabled and not new.birthday_sms_enabled then
    perform public.communications_cancel_business_client_lifecycle_pending(
      new.business_id, 'CLIENT_BIRTHDAY_OFFER');
  end if;
  if tg_op = 'UPDATE' and old.winback_sms_enabled and not new.winback_sms_enabled then
    perform public.communications_cancel_business_client_lifecycle_pending(
      new.business_id, 'INACTIVE_CLIENT_FOLLOWUP');
  end if;
  return null;
exception
  when others then
    raise warning 'communications: lifecycle preference cancellation deferred (%)', sqlstate;
    return null;
end;
$$;

revoke all on function public.communications_on_lifecycle_preferences_change() from public, anon, authenticated;

drop trigger if exists business_lifecycle_sms_preferences_reconcile
  on public.business_lifecycle_sms_preferences;
create trigger business_lifecycle_sms_preferences_reconcile
  after insert or update on public.business_lifecycle_sms_preferences
  for each row execute function public.communications_on_lifecycle_preferences_change();

-- ---------------------------------------------------------------------------
-- 12. Client trigger — ineligibility cancels pending lifecycle SMS at once
-- ---------------------------------------------------------------------------
-- Replaced in place (same name; the trigger keeps calling it). TWO
-- independent concerns now:
--
--   lifecycle:  consent, phone, archive or tombstone changed and the client
--               is no longer lifecycle-eligible (OPTED_OUT, back to UNKNOWN,
--               archived, deleted, phone unusable) → cancel her pending
--               lifecycle SMS immediately. SENT/FAILED history untouched.
--               Runs whatever the appointment EMAIL preference says.
--   email:      the unchanged Phase 1 behavior — reconcile the client's live
--               upcoming appointments while the EMAIL preference is on.
create or replace function public.communications_on_client_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment record;
begin
  -- Lifecycle SMS: an ineligible client must not keep a pending offer.
  if (new.sms_marketing_consent is distinct from old.sms_marketing_consent
      or new.phone is distinct from old.phone
      or new.archived_at is distinct from old.archived_at
      or new.deleted_at is distinct from old.deleted_at)
     and public.communications_client_lifecycle_recipient(new.business_id, new.id) is null
  then
    perform public.communications_cancel_client_lifecycle_pending(new.business_id, new.id);
  end if;

  -- Appointment EMAIL reminders: unchanged Phase 1 behavior.
  if new.email is not distinct from old.email
     and new.phone is not distinct from old.phone
     and new.first_name is not distinct from old.first_name
     and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;
  if not exists (
    select 1 from public.business_communication_preferences
     where business_id = new.business_id and email_reminders_enabled
  ) then
    return null;
  end if;
  for v_appointment in
    select id from public.appointments
     where business_id = new.business_id
       and client_id = new.id
       and deleted_at is null
       and status in ('SCHEDULED', 'CONFIRMED')
       and start_at > now()
  loop
    perform public.communications_reconcile_appointment(new.business_id, v_appointment.id);
  end loop;
  return null;
exception
  when others then
    raise warning 'communications: client reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.business_id, 'BUSINESS', '', sqlerrm);
    return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Appointment trigger — a new future booking cancels the pending win-back
-- ---------------------------------------------------------------------------
-- Replaced in place (the 20261002 EMAIL-only appointment engine is kept
-- verbatim). Addition: when the written appointment is a FUTURE VALID one
-- (live, SCHEDULED/CONFIRMED, upcoming), the client is no longer inactive —
-- her pending INACTIVE_CLIENT_FOLLOWUP is cancelled. Birthday offers are
-- NEVER cancelled by a booking.
create or replace function public.communications_on_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null
     and new.status in ('SCHEDULED', 'CONFIRMED')
     and new.start_at > now()
     and new.client_id is not null
  then
    perform public.communications_cancel_client_lifecycle_pending(
      new.business_id, new.client_id, 'INACTIVE_CLIENT_FOLLOWUP');
  end if;

  if tg_op = 'UPDATE'
     and (new.status is distinct from old.status or new.start_at is distinct from old.start_at)
  then
    perform public.communications_reconcile_appointment_events(new.business_id, new.id);
  end if;

  perform public.communications_reconcile_appointment(new.business_id, new.id);
  return null;
exception
  when others then
    raise warning 'communications: appointment reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.business_id, 'APPOINTMENT', new.id, sqlerrm);
    return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Push — the CLIENT branch carries the consent triple
-- ---------------------------------------------------------------------------
-- Replaced IN PLACE (identical signature; EXECUTE grants, revokes and
-- comments preserved). The body is the one of 20260927120000 with exactly
-- one difference: the CLIENT insert/update reads and writes the three
-- consent columns, keeping the stored values when the payload has no
-- `sms_marketing_consent` key — a build that predates the consent can never
-- erase it. A build that knows the consent always sends the THREE keys
-- together (values, or three nulls for UNKNOWN), so the audit CHECK is never
-- tripped by a half-updated row.
create or replace function public.sync_push_aggregate(
  p_business_id uuid,
  p_aggregate_type text,
  p_aggregate_id text,
  p_operation text,
  p_expected_version bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_table text;
  remote_version bigint;
  remote_deleted_at timestamptz;
  remote_found boolean;
  version_matches boolean;
  new_version bigint;
  -- The Appointment whose financial invariant this write may affect, and the
  -- breach it would leave behind (NULL when it leaves none).
  invariant_appointment_id text;
  invariant_breach jsonb;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'sync: not the owner of this Business' using errcode = '42501';
  end if;

  parent_table := case p_aggregate_type
    when 'CLIENT' then 'clients'
    when 'SERVICE' then 'services'
    when 'APPOINTMENT' then 'appointments'
    when 'PRODUCT' then 'products'
    when 'SALE' then 'sales'
    when 'CALENDAR_BLOCK' then 'calendar_blocks'
    when 'APPOINTMENT_DEPOSIT' then 'appointment_deposits'
  end;
  if parent_table is null then
    raise exception 'sync: unknown aggregate type' using errcode = '22023';
  end if;
  if p_operation is null or p_operation not in ('UPSERT', 'DELETE') then
    raise exception 'sync: unknown operation' using errcode = '22023';
  end if;
  if p_aggregate_id is null or char_length(p_aggregate_id) = 0 then
    raise exception 'sync: empty aggregate id' using errcode = '22023';
  end if;
  if p_operation = 'UPSERT' and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then
    raise exception 'sync: UPSERT requires an object payload' using errcode = '22023';
  end if;

  -- parent_table comes from the whitelist above, never from the caller.
  execute format(
    'select sync_version, deleted_at from public.%I where business_id = $1 and id = $2 for update',
    parent_table
  )
  into remote_version, remote_deleted_at
  using p_business_id, p_aggregate_id;

  remote_found := remote_version is not null;
  version_matches := p_expected_version is not distinct from remote_version;

  -- ------------------------------------------------------------- DELETE ----
  if p_operation = 'DELETE' then
    if not remote_found then
      return jsonb_build_object('status', 'ABSENT');
    end if;
    if remote_deleted_at is not null then
      return jsonb_build_object('status', 'APPLIED', 'sync_version', remote_version);
    end if;
    if not version_matches then
      return jsonb_build_object('status', 'CONFLICT', 'sync_version', remote_version);
    end if;

    -- An Appointment that holds deposits is never tombstoned (the local deletion
    -- guard of every build that knows them; an older build does not count them).
    if p_aggregate_type = 'APPOINTMENT'
       and exists (
         select 1 from public.appointment_deposits
         where business_id = p_business_id and appointment_id = p_aggregate_id and deleted_at is null
       ) then
      return jsonb_build_object(
        'status', 'FINANCIAL_CONFLICT',
        'appointment_id', p_aggregate_id,
        'expected_total_cents',
          coalesce(public.sync_appointment_expected_total_cents(p_business_id, p_aggregate_id), 0),
        'active_deposit_cents',
          public.sync_appointment_active_deposit_cents(p_business_id, p_aggregate_id)
      );
    end if;

    -- A tombstoned Sale no longer contributes its Products to the expected total.
    if p_aggregate_type = 'SALE' then
      select appointment_id into invariant_appointment_id
      from public.sales
      where business_id = p_business_id and id = p_aggregate_id;
    end if;

    begin
      execute format(
        'update public.%I set deleted_at = now() where business_id = $1 and id = $2 returning sync_version',
        parent_table
      )
      into new_version
      using p_business_id, p_aggregate_id;

      invariant_breach := public.sync_appointment_deposit_breach(p_business_id, invariant_appointment_id);
      if invariant_breach is not null then
        raise exception 'sync: financial conflict' using errcode = 'SC422';
      end if;
    exception
      when sqlstate 'SC422' then
        -- The tombstone is undone with the savepoint: nothing was written.
        return invariant_breach;
    end;

    return jsonb_build_object('status', 'APPLIED', 'sync_version', new_version);
  end if;

  -- ------------------------------------------------------------- UPSERT ----
  -- The device acknowledged a row the remote no longer holds (administrative
  -- hard delete): never silently recreate it.
  if not remote_found and p_expected_version is not null then
    return jsonb_build_object('status', 'CONFLICT', 'sync_version', null);
  end if;

  begin
    set constraints all deferred;

    if p_aggregate_type = 'CLIENT' then
      insert into public.clients
        (business_id, id, first_name, last_name, phone, email, birthday, notes, photo_path,
         sms_marketing_consent, sms_marketing_consent_updated_at, sms_marketing_consent_source,
         archived_at, deleted_at)
      select p_business_id, p_aggregate_id,
             x.first_name, x.last_name, x.phone, x.email, x.birthday, x.notes, x.photo_path,
             x.sms_marketing_consent, x.sms_marketing_consent_updated_at, x.sms_marketing_consent_source,
             x.archived_at, null
      from jsonb_to_record(p_payload) as x(
        first_name text, last_name text, phone text, email text, birthday text, notes text,
        photo_path text,
        sms_marketing_consent text, sms_marketing_consent_updated_at timestamptz,
        sms_marketing_consent_source text,
        archived_at timestamptz
      )
      on conflict (business_id, id) do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        email = excluded.email,
        birthday = excluded.birthday,
        -- A build that predates Client notes sends no "notes" key: keep the
        -- stored note instead of reading the missing key as "cleared". A build
        -- that knows the field always sends it (text, or null to clear).
        notes = case when p_payload ? 'notes' then excluded.notes else public.clients.notes end,
        -- Same rule for the Client photo: a build that predates it sends no
        -- "photo_path" key and never erases a photo set by a newer build.
        photo_path = case
          when p_payload ? 'photo_path' then excluded.photo_path
          else public.clients.photo_path
        end,
        -- Same rule for the promotional SMS consent: a build that predates it
        -- sends no "sms_marketing_consent" key and can never erase a recorded
        -- consent. A build that knows the consent always sends the three keys
        -- together (values, or three nulls for UNKNOWN), so the triple is
        -- replaced together and the audit CHECK is never tripped.
        sms_marketing_consent = case
          when p_payload ? 'sms_marketing_consent' then excluded.sms_marketing_consent
          else public.clients.sms_marketing_consent
        end,
        sms_marketing_consent_updated_at = case
          when p_payload ? 'sms_marketing_consent' then excluded.sms_marketing_consent_updated_at
          else public.clients.sms_marketing_consent_updated_at
        end,
        sms_marketing_consent_source = case
          when p_payload ? 'sms_marketing_consent' then excluded.sms_marketing_consent_source
          else public.clients.sms_marketing_consent_source
        end,
        archived_at = excluded.archived_at,
        deleted_at = null;

    elsif p_aggregate_type = 'PRODUCT' then
      insert into public.products
        (business_id, id, name, brand, category, barcode, photo_path, price_cents, stock_quantity,
         active, deleted_at)
      select p_business_id, p_aggregate_id,
             x.name, x.brand, x.category, x.barcode, x.photo_path, x.price_cents, x.stock_quantity,
             x.active, null
      from jsonb_to_record(p_payload) as x(
        name text, brand text, category text, barcode text, photo_path text,
        price_cents integer, stock_quantity integer, active boolean
      )
      on conflict (business_id, id) do update set
        name = excluded.name,
        brand = excluded.brand,
        category = excluded.category,
        barcode = excluded.barcode,
        -- A build that predates Product photos sends no "photo_path" key (its
        -- device-local image never leaves the device): keep the shared photo
        -- instead of reading the missing key as "removed". A build that knows
        -- the field always sends it (a path, or null to remove).
        photo_path = case
          when p_payload ? 'photo_path' then excluded.photo_path
          else public.products.photo_path
        end,
        price_cents = excluded.price_cents,
        stock_quantity = excluded.stock_quantity,
        active = excluded.active,
        deleted_at = null;

    elsif p_aggregate_type = 'SERVICE' then
      insert into public.services
        (business_id, id, name, type, price_cents, active, deleted_at)
      select p_business_id, p_aggregate_id, x.name, x.type, x.price_cents, x.active, null
      from jsonb_to_record(p_payload) as x(name text, type text, price_cents integer, active boolean)
      on conflict (business_id, id) do update set
        name = excluded.name,
        type = excluded.type,
        price_cents = excluded.price_cents,
        active = excluded.active,
        deleted_at = null;

      delete from public.service_phases c
      where c.business_id = p_business_id
        and c.service_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'phases', '[]'::jsonb)) as x(id text)
          where x.id = c.id
        );

      insert into public.service_phases
        (business_id, service_id, id, position, name, duration_minutes, requires_staff)
      select p_business_id, p_aggregate_id, x.id, x.position, x.name, x.duration_minutes, x.requires_staff
      from jsonb_to_recordset(coalesce(p_payload -> 'phases', '[]'::jsonb)) as x(
        id text, position integer, name text, duration_minutes integer, requires_staff boolean
      )
      on conflict (business_id, service_id, id) do update set
        position = excluded.position,
        name = excluded.name,
        duration_minutes = excluded.duration_minutes,
        requires_staff = excluded.requires_staff;

    elsif p_aggregate_type = 'APPOINTMENT' then
      insert into public.appointments
        (business_id, id, client_id, staff_member_id, start_at, status, notes,
         cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at,
         paid_at, card_amount_cents, cash_amount_cents,
         discount_percent, discount_amount_cents, client_reminder_enabled, deleted_at)
      select p_business_id, p_aggregate_id,
             x.client_id, x.staff_member_id, x.start_at, x.status, x.notes,
             x.cancelled_at, x.cancelled_by, x.cancellation_reason, x.no_show_recorded_at,
             x.paid_at, x.card_amount_cents, x.cash_amount_cents,
             x.discount_percent, x.discount_amount_cents, x.client_reminder_enabled, null
      from jsonb_to_record(p_payload) as x(
        client_id text, staff_member_id text, start_at timestamptz, status text, notes text,
        cancelled_at timestamptz, cancelled_by text, cancellation_reason text,
        no_show_recorded_at timestamptz,
        paid_at timestamptz, card_amount_cents integer, cash_amount_cents integer,
        discount_percent integer, discount_amount_cents integer,
        client_reminder_enabled boolean
      )
      on conflict (business_id, id) do update set
        client_id = excluded.client_id,
        staff_member_id = excluded.staff_member_id,
        start_at = excluded.start_at,
        status = excluded.status,
        notes = excluded.notes,
        cancelled_at = excluded.cancelled_at,
        cancelled_by = excluded.cancelled_by,
        cancellation_reason = excluded.cancellation_reason,
        no_show_recorded_at = excluded.no_show_recorded_at,
        paid_at = excluded.paid_at,
        card_amount_cents = excluded.card_amount_cents,
        cash_amount_cents = excluded.cash_amount_cents,
        -- A build that predates the Appointment discount sends neither key:
        -- keep the stored discount instead of reading the missing keys as
        -- "removed". A build that knows the discount always sends BOTH keys
        -- (one value and one null, or two nulls to remove it), so the pair is
        -- replaced together and the one-of CHECK is never tripped by a
        -- half-updated row.
        discount_percent = case
          when p_payload ? 'discount_percent' or p_payload ? 'discount_amount_cents'
            then excluded.discount_percent
          else public.appointments.discount_percent
        end,
        discount_amount_cents = case
          when p_payload ? 'discount_percent' or p_payload ? 'discount_amount_cents'
            then excluded.discount_amount_cents
          else public.appointments.discount_amount_cents
        end,
        -- A build that predates the reminder flag sends no such key: keep the
        -- stored choice instead of reading the missing key as "reset". A build
        -- that knows the field always sends it (true, false, or null for
        -- "never explicitly set").
        client_reminder_enabled = case
          when p_payload ? 'client_reminder_enabled' then excluded.client_reminder_enabled
          else public.appointments.client_reminder_enabled
        end,
        deleted_at = null;

      -- Phases first (keyed under their item), then items; a removed item
      -- cascades to whatever phases it still had.
      delete from public.appointment_phases c
      where c.business_id = p_business_id
        and c.appointment_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as i(id text, phases jsonb),
               jsonb_to_recordset(coalesce(i.phases, '[]'::jsonb)) as x(id text)
          where i.id = c.appointment_item_id and x.id = c.id
        );

      delete from public.appointment_items c
      where c.business_id = p_business_id
        and c.appointment_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(id text)
          where x.id = c.id
        );

      insert into public.appointment_items
        (business_id, appointment_id, id, item_order, service_id, service_option_id,
         service_name, service_type, price_cents)
      select p_business_id, p_aggregate_id, x.id, x.item_order, x.service_id, x.service_option_id,
             x.service_name, x.service_type, x.price_cents
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(
        id text, item_order integer, service_id text, service_option_id text,
        service_name text, service_type text, price_cents integer
      )
      on conflict (business_id, appointment_id, id) do update set
        item_order = excluded.item_order,
        service_id = excluded.service_id,
        service_option_id = excluded.service_option_id,
        service_name = excluded.service_name,
        service_type = excluded.service_type,
        price_cents = excluded.price_cents;

      insert into public.appointment_phases
        (business_id, appointment_id, appointment_item_id, id, position, name,
         duration_minutes, requires_staff)
      select p_business_id, p_aggregate_id, i.id, x.id, x.position, x.name,
             x.duration_minutes, x.requires_staff
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as i(id text, phases jsonb),
           jsonb_to_recordset(coalesce(i.phases, '[]'::jsonb)) as x(
             id text, position integer, name text, duration_minutes integer, requires_staff boolean
           )
      on conflict (business_id, appointment_id, appointment_item_id, id) do update set
        position = excluded.position,
        name = excluded.name,
        duration_minutes = excluded.duration_minutes,
        requires_staff = excluded.requires_staff;

    elsif p_aggregate_type = 'CALENDAR_BLOCK' then
      -- Personal unavailability: a staff member, an interval, a reason. No
      -- client, no price, no payment, no status, no child rows.
      insert into public.calendar_blocks
        (business_id, id, staff_member_id, start_at, end_at, reason, deleted_at)
      select p_business_id, p_aggregate_id, x.staff_member_id, x.start_at, x.end_at, x.reason, null
      from jsonb_to_record(p_payload) as x(
        staff_member_id text, start_at timestamptz, end_at timestamptz, reason text
      )
      on conflict (business_id, id) do update set
        staff_member_id = excluded.staff_member_id,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        reason = excluded.reason,
        deleted_at = null;

    elsif p_aggregate_type = 'APPOINTMENT_DEPOSIT' then
      -- Money received in advance for ONE Appointment (composite FK, same
      -- Business). A correction is the VOIDED status carried by the row —
      -- never a tombstone. `recorded_at` is the device's entry instant;
      -- `created_at` stays server-owned sync metadata.
      insert into public.appointment_deposits
        (business_id, id, appointment_id, amount_cents, payment_method, paid_at,
         status, voided_at, recorded_at, deleted_at)
      select p_business_id, p_aggregate_id, x.appointment_id, x.amount_cents, x.payment_method,
             x.paid_at, x.status, x.voided_at, x.recorded_at, null
      from jsonb_to_record(p_payload) as x(
        appointment_id text, amount_cents integer, payment_method text, paid_at timestamptz,
        status text, voided_at timestamptz, recorded_at timestamptz
      )
      on conflict (business_id, id) do update set
        appointment_id = excluded.appointment_id,
        amount_cents = excluded.amount_cents,
        payment_method = excluded.payment_method,
        paid_at = excluded.paid_at,
        status = excluded.status,
        voided_at = excluded.voided_at,
        recorded_at = excluded.recorded_at,
        deleted_at = null;

    else -- SALE
      insert into public.sales
        (business_id, id, client_id, appointment_id, completed_at,
         paid_at, card_amount_cents, cash_amount_cents, deleted_at)
      select p_business_id, p_aggregate_id, x.client_id, x.appointment_id, x.completed_at,
             x.paid_at, x.card_amount_cents, x.cash_amount_cents, null
      from jsonb_to_record(p_payload) as x(
        client_id text, appointment_id text, completed_at timestamptz,
        paid_at timestamptz, card_amount_cents integer, cash_amount_cents integer
      )
      on conflict (business_id, id) do update set
        client_id = excluded.client_id,
        appointment_id = excluded.appointment_id,
        completed_at = excluded.completed_at,
        paid_at = excluded.paid_at,
        card_amount_cents = excluded.card_amount_cents,
        cash_amount_cents = excluded.cash_amount_cents,
        deleted_at = null;

      delete from public.sale_items c
      where c.business_id = p_business_id
        and c.sale_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(id text)
          where x.id = c.id
        );

      insert into public.sale_items
        (business_id, sale_id, id, position, product_id, product_name, unit_price_cents, quantity)
      select p_business_id, p_aggregate_id, x.id, x.position, x.product_id, x.product_name,
             x.unit_price_cents, x.quantity
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(
        id text, position integer, product_id text, product_name text,
        unit_price_cents integer, quantity integer
      )
      on conflict (business_id, sale_id, id) do update set
        position = excluded.position,
        product_id = excluded.product_id,
        product_name = excluded.product_name,
        unit_price_cents = excluded.unit_price_cents,
        quantity = excluded.quantity;
    end if;

    -- Deferred position uniqueness is verified HERE, inside the savepoint.
    set constraints all immediate;

    execute format(
      'select sync_version from public.%I where business_id = $1 and id = $2',
      parent_table
    )
    into new_version
    using p_business_id, p_aggregate_id;

    -- The remote was at a revision the device never acknowledged and the push
    -- would have changed it: undo everything written above.
    if not version_matches and new_version is distinct from remote_version then
      raise exception 'sync: version conflict' using errcode = 'SC409';
    end if;

    -- The financial invariant of the Appointment this write touches. It is
    -- evaluated on the state the write would leave, so the SECOND of two
    -- offline-compatible writes is the one refused.
    if p_aggregate_type = 'APPOINTMENT' then
      invariant_appointment_id := p_aggregate_id;
    elsif p_aggregate_type = 'APPOINTMENT_DEPOSIT' then
      select appointment_id into invariant_appointment_id
      from public.appointment_deposits
      where business_id = p_business_id and id = p_aggregate_id;
    elsif p_aggregate_type = 'SALE' then
      select appointment_id into invariant_appointment_id
      from public.sales
      where business_id = p_business_id and id = p_aggregate_id;
    end if;

    invariant_breach := public.sync_appointment_deposit_breach(p_business_id, invariant_appointment_id);
    if invariant_breach is not null then
      raise exception 'sync: financial conflict' using errcode = 'SC422';
    end if;
  exception
    when sqlstate 'SC409' then
      return jsonb_build_object('status', 'CONFLICT', 'sync_version', remote_version);
    when sqlstate 'SC422' then
      -- Everything written above is undone with the savepoint; the device keeps
      -- its record and surfaces the conflict.
      return invariant_breach;
  end;

  return jsonb_build_object('status', 'APPLIED', 'sync_version', new_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Pull — clients[] objects carry the consent triple
-- ---------------------------------------------------------------------------
create or replace function public.sync_pull_business_aggregates(p_business_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'sync: not the owner of this Business' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'pulled_at', public.sync_instant_text(now()),

      'clients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'sync_version', c.sync_version,
            'deleted_at', public.sync_instant_text(c.deleted_at),
            'first_name', c.first_name,
            'last_name', c.last_name,
            'phone', c.phone,
            'email', c.email,
            'birthday', c.birthday,
            'notes', c.notes,
            'photo_path', c.photo_path,
            'sms_marketing_consent', c.sms_marketing_consent,
            'sms_marketing_consent_updated_at', public.sync_instant_text(c.sms_marketing_consent_updated_at),
            'sms_marketing_consent_source', c.sms_marketing_consent_source,
            'archived_at', public.sync_instant_text(c.archived_at)
          )
          order by c.created_at, c.id
        )
        from public.clients c
        where c.business_id = p_business_id
          and (p_since is null or c.updated_at > p_since)
      ), '[]'::jsonb),

      'services', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'sync_version', s.sync_version,
            'deleted_at', public.sync_instant_text(s.deleted_at),
            'name', s.name,
            'type', s.type,
            'price_cents', s.price_cents,
            'active', s.active,
            'phases', case when s.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'position', p.position,
                  'name', p.name,
                  'duration_minutes', p.duration_minutes,
                  'requires_staff', p.requires_staff
                )
                order by p.position
              )
              from public.service_phases p
              where p.business_id = s.business_id and p.service_id = s.id
            ), '[]'::jsonb) end
          )
          order by s.created_at, s.id
        )
        from public.services s
        where s.business_id = p_business_id
          and (p_since is null or s.updated_at > p_since)
      ), '[]'::jsonb),

      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', pr.id,
            'sync_version', pr.sync_version,
            'deleted_at', public.sync_instant_text(pr.deleted_at),
            'name', pr.name,
            'brand', pr.brand,
            'category', pr.category,
            'barcode', pr.barcode,
            'photo_path', pr.photo_path,
            'price_cents', pr.price_cents,
            'stock_quantity', pr.stock_quantity,
            'active', pr.active
          )
          order by pr.created_at, pr.id
        )
        from public.products pr
        where pr.business_id = p_business_id
          and (p_since is null or pr.updated_at > p_since)
      ), '[]'::jsonb),

      'appointments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'sync_version', a.sync_version,
            'deleted_at', public.sync_instant_text(a.deleted_at),
            'client_id', a.client_id,
            'staff_member_id', a.staff_member_id,
            'start_at', public.sync_instant_text(a.start_at),
            'status', a.status,
            'notes', a.notes,
            'cancelled_at', public.sync_instant_text(a.cancelled_at),
            'cancelled_by', a.cancelled_by,
            'cancellation_reason', a.cancellation_reason,
            'no_show_recorded_at', public.sync_instant_text(a.no_show_recorded_at),
            'paid_at', public.sync_instant_text(a.paid_at),
            'card_amount_cents', a.card_amount_cents,
            'cash_amount_cents', a.cash_amount_cents,
            'discount_percent', a.discount_percent,
            'discount_amount_cents', a.discount_amount_cents,
            'client_reminder_enabled', a.client_reminder_enabled,
            'items', case when a.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', i.id,
                  'item_order', i.item_order,
                  'service_id', i.service_id,
                  'service_option_id', i.service_option_id,
                  'service_name', i.service_name,
                  'service_type', i.service_type,
                  'price_cents', i.price_cents,
                  'phases', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', ph.id,
                        'position', ph.position,
                        'name', ph.name,
                        'duration_minutes', ph.duration_minutes,
                        'requires_staff', ph.requires_staff
                      )
                      order by ph.position
                    )
                    from public.appointment_phases ph
                    where ph.business_id = i.business_id
                      and ph.appointment_id = i.appointment_id
                      and ph.appointment_item_id = i.id
                  ), '[]'::jsonb)
                )
                order by i.item_order
              )
              from public.appointment_items i
              where i.business_id = a.business_id and i.appointment_id = a.id
            ), '[]'::jsonb) end
          )
          order by a.created_at, a.id
        )
        from public.appointments a
        where a.business_id = p_business_id
          and (p_since is null or a.updated_at > p_since)
      ), '[]'::jsonb),

      'sales', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sa.id,
            'sync_version', sa.sync_version,
            'deleted_at', public.sync_instant_text(sa.deleted_at),
            'client_id', sa.client_id,
            'appointment_id', sa.appointment_id,
            'completed_at', public.sync_instant_text(sa.completed_at),
            'paid_at', public.sync_instant_text(sa.paid_at),
            'card_amount_cents', sa.card_amount_cents,
            'cash_amount_cents', sa.cash_amount_cents,
            'items', case when sa.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', si.id,
                  'position', si.position,
                  'product_id', si.product_id,
                  'product_name', si.product_name,
                  'unit_price_cents', si.unit_price_cents,
                  'quantity', si.quantity
                )
                order by si.position
              )
              from public.sale_items si
              where si.business_id = sa.business_id and si.sale_id = sa.id
            ), '[]'::jsonb) end
          )
          order by sa.created_at, sa.id
        )
        from public.sales sa
        where sa.business_id = p_business_id
          and (p_since is null or sa.updated_at > p_since)
      ), '[]'::jsonb),

      'calendar_blocks', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', cb.id,
            'sync_version', cb.sync_version,
            'deleted_at', public.sync_instant_text(cb.deleted_at),
            'staff_member_id', cb.staff_member_id,
            'start_at', public.sync_instant_text(cb.start_at),
            'end_at', public.sync_instant_text(cb.end_at),
            'reason', cb.reason
          )
          order by cb.created_at, cb.id
        )
        from public.calendar_blocks cb
        where cb.business_id = p_business_id
          and (p_since is null or cb.updated_at > p_since)
      ), '[]'::jsonb),

      'appointment_deposits', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'sync_version', d.sync_version,
            'deleted_at', public.sync_instant_text(d.deleted_at),
            'appointment_id', d.appointment_id,
            'amount_cents', d.amount_cents,
            'payment_method', d.payment_method,
            'paid_at', public.sync_instant_text(d.paid_at),
            'status', d.status,
            'voided_at', public.sync_instant_text(d.voided_at),
            'recorded_at', public.sync_instant_text(d.recorded_at)
          )
          order by d.created_at, d.id
        )
        from public.appointment_deposits d
        where d.business_id = p_business_id
          and (p_since is null or d.updated_at > p_since)
      ), '[]'::jsonb)
    )
  );
end;
$$;
