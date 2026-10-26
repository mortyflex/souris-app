-- BeautIzzy — BeautIzzy Plus Phase 6.5B: server-side communication entitlement
-- enforcement
--
-- docs/architecture/COMMUNICATIONS.md §46, docs/architecture/SUBSCRIPTIONS.md.
-- Email and SMS communications become a BeautIzzy Plus capability: when — and
-- only when — the SERVER-SIDE switch below is enabled, a communication is
-- scheduled and sent only for a Business whose owner holds a VERIFIED
-- PRODUCTION Plus entitlement in the mirror of Phase 6.5A
-- (`subscription_has_plus_access`). Nothing here reads, trusts or reuses the
-- mobile app's enforcement build constant (src/features/access/enforcement.ts):
-- a client-side switch is never a security control.
--
-- THE SWITCH IS DISABLED BY DEFAULT and stays disabled until an operator
-- flips it BY HAND (`communications_set_entitlement_enforcement(true)`). While
-- it is disabled, every function below behaves EXACTLY as before this
-- migration — for every Business, including the accounts that have no
-- `subscription_entitlements` row at all. Applying this migration alone
-- changes no row, cancels nothing, enqueues nothing and sends nothing.
--
-- The access rule is NOT re-implemented here. ONE rule decides:
-- `subscription_has_plus_access(owner, at)` — PRODUCTION rows of production
-- stores only, status <> EXPIRED, end null or ahead. It already yields exactly
-- the product rules of this phase:
--
--   ACTIVE / TRIAL in force                     allowed
--   CANCELLED_ACTIVE before its expiration      allowed
--   BILLING_RETRY until the store's grace end   allowed until that confirmed deadline, not after
--   COMPLIMENTARY with a valid grant            allowed (a lifetime grant: no end)
--   EXPIRED                                     suspended
--   no row / Sandbox / Test Store only          NOT entitled: unknown or unverified
--                                               access is never paid access
--   72-hour offline grace                       NONE on the server: a device rule only
--
-- Four boundaries, every one decided in the database:
--
--   1. appointment reminder reconciliation (`communications_reconcile_appointment`,
--      `…_events`, `…_business`) — an unentitled Business schedules nothing
--      and its pending appointment communications are cancelled;
--   2. client lifecycle SMS reconciliation (`communications_reconcile_client_lifecycle`)
--      — same, for the birthday / win-back automations;
--   3. the worker's FINAL eligibility check immediately before dispatch
--      (`communications_authorize_dispatch`, replacing the status re-read):
--      a claimed record of a Business that is not entitled NOW is cancelled
--      in the same transaction and never dispatched — this is what catches an
--      entitlement that lapsed by TIME (entitled_until passing) without any
--      webhook event, and a queue filled before the switch was enabled;
--   4. the entitlement mirror itself (trigger on `subscription_entitlements`):
--      a confirmed loss (EXPIRATION, revocation, transfer, refund) suspends
--      the Business's pending communications at once; a confirmed regain
--      re-derives the FUTURE appointment reminders (the preference OFF→ON
--      pattern) — never a reminder whose H-24 already passed, never a
--      lifecycle SMS whose annual / episode key was consumed.
--
-- Suspension = CANCELLED with `last_error = 'ENTITLEMENT_SUSPENDED'`: the
-- existing terminal state the preference switch already uses, inspectable
-- (`where last_error = 'ENTITLEMENT_SUSPENDED'`), never claimable again
-- (duplicates and races are impossible: the claim is atomic and the mark_*
-- settlements act on PROCESSING rows only). SENT / FAILED history is never
-- rewritten; preferences and consent are never touched; nothing is deleted.
--
-- Privileges, explicit and minimal. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and a platform may add default grants for
-- its API roles: every function below therefore REVOKES ALL from public,
-- anon, authenticated AND service_role first, and grants back exactly what a
-- caller needs — the worker (service_role) may execute the pre-dispatch gate
-- and the rule it calls, nothing else; the operator switch is granted to
-- nobody. The trigger function, the suspension helper and the flag reader run
-- only inside SECURITY DEFINER bodies (as the owner) and need no grant.
--
-- Additive and non-destructive: ONE new server-owned table (the switch, one
-- disabled row), NEW functions, ONE after trigger on `subscription_entitlements`,
-- and four reconciliation functions replaced IN PLACE (same signatures,
-- same grants). No existing row, column, policy, table grant or sync RPC is
-- touched. Safe to re-run (`if not exists`, `on conflict do nothing` — a
-- re-run can never flip the switch —, `create or replace`, `drop trigger if
-- exists` on this migration's own trigger only).

-- ---------------------------------------------------------------------------
-- 1. The server-side switch — one disabled row, operator-only
-- ---------------------------------------------------------------------------
-- A server flag is a ROW the operator flips by hand in the SQL Editor through
-- `communications_set_entitlement_enforcement`, never a build constant, never
-- an environment variable of an Edge Function (a stale deployment could not
-- disagree with the database), never a client setting. No API role and not
-- even the server role can read or write the table directly: the flag is
-- read through `communications_entitlement_enforcement_enabled()` only —
-- itself executable by nobody but the owner: `communications_is_entitled`
-- (SECURITY DEFINER) reads it on everyone's behalf.
create table if not exists public.server_feature_flags (
  flag text primary key check (flag ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  enabled boolean not null default false,
  -- The instant the flag was last ENABLED; NULL while disabled.
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 400)
);

comment on table public.server_feature_flags is
  'BeautIzzy: server-side operator switches (one row per flag, disabled by default). No client or server-role access; read through dedicated functions, flipped by hand through dedicated functions.';

alter table public.server_feature_flags enable row level security;
revoke all on table public.server_feature_flags from public, anon, authenticated, service_role;

insert into public.server_feature_flags (flag, enabled, note)
values (
  'COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT',
  false,
  'BeautIzzy Plus 6.5B: when enabled, email/SMS communications are scheduled and sent only for a Business with a verified production Plus entitlement. Flip with communications_set_entitlement_enforcement(boolean).')
on conflict (flag) do nothing;

create or replace function public.communications_entitlement_enforcement_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.server_feature_flags f
      where f.flag = 'COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT'),
    false);
$$;

comment on function public.communications_entitlement_enforcement_enabled() is
  'BeautIzzy Plus 6.5B: whether communication entitlement enforcement is ON. A missing row reads as disabled (the pre-6.5B behavior).';

revoke all on function public.communications_entitlement_enforcement_enabled() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. THE communication entitlement rule of a Business
-- ---------------------------------------------------------------------------
-- TRUE when the Business may schedule and send communications at `p_at`:
-- enforcement disabled (everything behaves as before), or its owner holds
-- verified production Plus access per THE 6.5A rule. A Business without an
-- owner row, a user without any mirrored row, a Sandbox-only or Test
-- Store-only subscriber: FALSE under enforcement — unverified is never paid.
create or replace function public.communications_is_entitled(
  p_business_id uuid,
  p_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.communications_entitlement_enforcement_enabled() then true
    else coalesce(
      (select public.subscription_has_plus_access(b.owner_user_id, coalesce(p_at, now()))
         from public.businesses b
        where b.id = p_business_id),
      false)
  end;
$$;

comment on function public.communications_is_entitled(uuid, timestamptz) is
  'BeautIzzy Plus 6.5B: THE communication entitlement rule — enforcement disabled, or the owner holds verified production Plus access (subscription_has_plus_access). Never re-implements the access rule.';

revoke all on function public.communications_is_entitled(uuid, timestamptz) from public, anon, authenticated, service_role;
-- The ONE grant a caller needs: communications_authorize_dispatch is SECURITY
-- INVOKER (runs as service_role) and asks this rule.
grant execute on function public.communications_is_entitled(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Suspension — cancel pending communications with an inspectable marker
-- ---------------------------------------------------------------------------
-- Legal transitions only (SCHEDULED | PROCESSING → CANCELLED). A PROCESSING
-- record is re-checked by the worker immediately before dispatch, so the
-- suspension wins whenever it lands first. SENT / FAILED / CANCELLED history
-- is never rewritten. `p_source_type` / `p_source_id` NULL = every source.
-- Returns the number of rows suspended.
create or replace function public.communications_suspend_pending(
  p_business_id uuid,
  p_source_type text default null,
  p_source_id text default null
) returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_business_id is null then
    raise exception 'communications: business id is required' using errcode = '22023';
  end if;
  if p_source_type is not null and p_source_type not in ('APPOINTMENT', 'CLIENT') then
    raise exception 'communications: unknown source type' using errcode = '22023';
  end if;
  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now(),
         last_error = 'ENTITLEMENT_SUSPENDED'
   where business_id = p_business_id
     and (p_source_type is null or source_type = p_source_type)
     and (p_source_id is null or source_id = p_source_id)
     and status in ('SCHEDULED', 'PROCESSING');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.communications_suspend_pending(uuid, text, text) is
  'BeautIzzy Plus 6.5B: cancel the pending communications of a Business (optionally one source) with last_error = ENTITLEMENT_SUSPENDED. Never touches SENT/FAILED/CANCELLED history, preferences or consent.';

-- Called only from SECURITY DEFINER bodies (the reconciliation functions, the
-- trigger, the operator switch): no caller needs a grant, not even the worker.
revoke all on function public.communications_suspend_pending(uuid, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Boundary 1 — appointment reminders (replaced in place, EMAIL-only engine)
-- ---------------------------------------------------------------------------
-- 4a. One appointment's initial H-24 reminder. Body of 20261002120000 plus
-- ONE fact: an unentitled Business has its pending communications of THIS
-- appointment suspended and schedules nothing. The channel decision table
-- (`communications_reconcile_appointment_channel`) is unchanged.
create or replace function public.communications_reconcile_appointment(
  p_business_id uuid,
  p_appointment_id text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appointment record;
  v_prefs record;
  v_base boolean;
  v_target timestamptz;
  v_email text;
  v_email_on boolean;
begin
  if not public.communications_is_entitled(p_business_id) then
    perform public.communications_suspend_pending(p_business_id, 'APPOINTMENT', p_appointment_id);
    return;
  end if;

  select a.id, a.client_id, a.start_at, a.status, a.client_reminder_enabled,
         a.sync_version, a.deleted_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;

  select email_reminders_enabled
    into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;

  v_target := v_appointment.start_at - interval '24 hours';

  v_base := coalesce(
        v_appointment.id is not null
    and v_appointment.deleted_at is null
    and coalesce(v_appointment.client_reminder_enabled, true)
    and v_appointment.status in ('SCHEDULED', 'CONFIRMED'), false);

  if v_base then
    v_email := public.communications_client_email_recipient(p_business_id, v_appointment.client_id);
  end if;

  v_email_on := coalesce(v_prefs.email_reminders_enabled, false) and v_base;

  perform public.communications_reconcile_appointment_channel(
    p_business_id, p_appointment_id, 'EMAIL',
    v_email_on, v_email,
    case when v_email_on and v_email is not null
      then public.communications_appointment_email_payload(p_business_id, p_appointment_id) end,
    v_target, v_appointment.sync_version);
end;
$$;

comment on function public.communications_reconcile_appointment(uuid, text) is
  'Communications (Plus 6.5B): THE reconciliation of one appointment''s initial H-24 reminder — EMAIL ONLY, and only for an entitled Business (communications_is_entitled); an unentitled one has its pending rows suspended. Idempotent; server state only.';

-- 4b. Post-send rescheduled / cancelled notices: minted for an entitled
-- Business only. Body of 20261002120000 plus the entitlement early exit.
create or replace function public.communications_reconcile_appointment_events(
  p_business_id uuid,
  p_appointment_id text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appointment record;
  v_prefs record;
  v_email text;
  v_email_on boolean;
begin
  if not public.communications_is_entitled(p_business_id) then
    return;
  end if;

  select a.id, a.client_id, a.start_at, a.status, a.client_reminder_enabled,
         a.sync_version, a.deleted_at, a.cancelled_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;
  if v_appointment.id is null or v_appointment.deleted_at is not null then
    return;
  end if;

  if not coalesce(v_appointment.client_reminder_enabled, true) then
    return;
  end if;

  select email_reminders_enabled
    into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;

  v_email_on := coalesce(v_prefs.email_reminders_enabled, false);
  if not v_email_on then
    return;
  end if;

  v_email := public.communications_client_email_recipient(p_business_id, v_appointment.client_id);

  perform public.communications_reconcile_appointment_events_channel(
    p_business_id, p_appointment_id, 'EMAIL',
    v_email_on, v_email,
    case when v_email is not null
      then public.communications_appointment_email_payload(p_business_id, p_appointment_id) end,
    v_appointment.start_at, v_appointment.status, v_appointment.cancelled_at,
    v_appointment.sync_version);
end;
$$;

comment on function public.communications_reconcile_appointment_events(uuid, text) is
  'Communications (Plus 6.5B): post-send rescheduled/cancelled notices derived from CURRENT state — EMAIL ONLY, entitled Business only, with the Lot B temporal guards. Idempotent; retry-safe.';

-- 4c. The whole-Business pass (preference flips, business rename, the retry
-- executor's BUSINESS scope, and — new — an entitlement regained). An
-- unentitled Business has every pending appointment communication suspended
-- instead of being reconciled appointment by appointment.
create or replace function public.communications_reconcile_business(p_business_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appointment record;
begin
  if not exists (
    select 1 from public.business_communication_preferences
     where business_id = p_business_id and email_reminders_enabled
  ) then
    return;
  end if;
  if not public.communications_is_entitled(p_business_id) then
    perform public.communications_suspend_pending(p_business_id, 'APPOINTMENT', null);
    return;
  end if;
  for v_appointment in
    select id from public.appointments
     where business_id = p_business_id
       and deleted_at is null
       and status in ('SCHEDULED', 'CONFIRMED')
       and start_at > now()
  loop
    perform public.communications_reconcile_appointment(p_business_id, v_appointment.id);
  end loop;
end;
$$;

comment on function public.communications_reconcile_business(uuid) is
  'Communications (Plus 6.5B): the whole-Business appointment reminder pass while EMAIL is on — reconciles every live upcoming appointment of an entitled Business; suspends the pending appointment communications of an unentitled one.';

-- ---------------------------------------------------------------------------
-- 5. Boundary 2 — client lifecycle SMS (replaced in place)
-- ---------------------------------------------------------------------------
-- Body of 20261003120000 §8 plus ONE fact at the top: an unentitled Business
-- has its pending lifecycle SMS suspended and runs neither pass. The daily
-- sweep (`communications_reconcile_client_lifecycle_all`) is unchanged and
-- keeps calling this function. Birthday-first, cooldown, consent, dedupe and
-- payload rules are byte-for-byte those of Phase 2.
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

  if not public.communications_is_entitled(p_business_id) then
    perform public.communications_suspend_pending(p_business_id, 'CLIENT', null);
    return;
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
  'SMS pivot Phase 2 + Plus 6.5B: THE daily lifecycle reconciliation of one Business — entitled Business only (an unentitled one has its pending lifecycle SMS suspended); then cancel stale pending rows, birthday FIRST, win-back second. Idempotent; server state only.';

-- ---------------------------------------------------------------------------
-- 6. Boundary 3 — the worker's final eligibility check before dispatch
-- ---------------------------------------------------------------------------
-- Replaces the worker's status re-read (`communications_read_status`, kept
-- callable). Called on a record the worker has just CLAIMED (PROCESSING):
--
--   { "status": "DISPATCH" }                   still PROCESSING and the Business is
--                                              entitled NOW: send it
--   { "status": "SUSPENDED" }                  still PROCESSING but the Business is
--                                              NOT entitled now: the record is
--                                              CANCELLED here (ENTITLEMENT_SUSPENDED)
--                                              and must not be sent
--   { "status": "SKIPPED", "communication_status": … }
--                                              no longer PROCESSING (cancelled
--                                              between claim and dispatch, or
--                                              settled by another path): not sent
--   { "status": "ABSENT" }                     no such record. The worker's compatibility
--                                              probe asks about the nil UUID before claiming
--                                              anything: ids are gen_random_uuid() (version 4),
--                                              so the nil id never exists and the probe
--                                              reads, locks and writes nothing
--
-- SECURITY INVOKER like every worker RPC (service_role holds exactly SELECT /
-- INSERT / UPDATE on the queue — 20260930120000); the entitlement itself is
-- read through the SECURITY DEFINER rule. The row is locked for the decision,
-- so a concurrent cancellation serializes with it; the residual race (a
-- suspension landing between this answer and the provider call) is recorded
-- by `communications_mark_sent` as DISPATCHED_BEFORE_CANCELLATION, exactly
-- like a preference cancellation — never hidden.
create or replace function public.communications_authorize_dispatch(p_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_id is null then
    raise exception 'communications: communication id is required' using errcode = '22023';
  end if;

  select id, business_id, status
    into v_row
    from public.scheduled_communications
   where id = p_id
     for update;
  if not found then
    return jsonb_build_object('status', 'ABSENT');
  end if;
  if v_row.status <> 'PROCESSING' then
    return jsonb_build_object('status', 'SKIPPED', 'communication_status', v_row.status);
  end if;

  if not public.communications_is_entitled(v_row.business_id) then
    update public.scheduled_communications
       set status = 'CANCELLED',
           cancelled_at = now(),
           last_error = 'ENTITLEMENT_SUSPENDED'
     where id = p_id and status = 'PROCESSING';
    return jsonb_build_object('status', 'SUSPENDED');
  end if;

  return jsonb_build_object('status', 'DISPATCH');
end;
$$;

comment on function public.communications_authorize_dispatch(uuid) is
  'BeautIzzy Plus 6.5B: the worker''s final pre-dispatch check of one claimed record — DISPATCH, SUSPENDED (cancelled here: the Business is not entitled now), SKIPPED (no longer PROCESSING) or ABSENT. Server time and server state only.';

revoke all on function public.communications_authorize_dispatch(uuid) from public, anon, authenticated, service_role;
grant execute on function public.communications_authorize_dispatch(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Boundary 4 — the mirror changes: suspend at once, re-derive on regain
-- ---------------------------------------------------------------------------
-- Fires on every row the webhook / reconciliation writes. Inert while the
-- switch is disabled, and for SANDBOX rows (they never change production
-- access). Otherwise the EFFECTIVE access of the owner is re-evaluated from
-- ALL rows (never from this one row):
--
--   not entitled  → every pending communication of the Business is suspended
--                   (appointment and lifecycle alike), at the confirmed loss;
--   entitled      → the whole-Business appointment pass re-derives the FUTURE
--                   reminders (idempotent; a reminder whose H-24 passed during
--                   the lapse is not eligible, so nothing is replayed). The
--                   lifecycle automations converge with the next daily sweep.
--
-- Like every communications trigger it swallows its own errors (a reminder
-- problem must never fail a webhook write) and leaves a durable BUSINESS
-- retry job behind, re-run by the worker from CURRENT state.
create or replace function public.communications_on_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  if not public.communications_entitlement_enforcement_enabled() then
    return null;
  end if;
  if new.environment <> 'PRODUCTION' then
    return null;
  end if;

  select b.id into v_business_id
    from public.businesses b
   where b.owner_user_id = new.user_id;
  if v_business_id is null then
    return null;
  end if;

  if public.subscription_has_plus_access(new.user_id) then
    perform public.communications_reconcile_business(v_business_id);
  else
    perform public.communications_suspend_pending(v_business_id, null, null);
  end if;
  return null;
exception
  when others then
    raise warning 'communications: entitlement reconciliation deferred (%)', sqlstate;
    if v_business_id is not null then
      perform public.communications_record_reconciliation_retry(
        v_business_id, 'BUSINESS', '', sqlerrm);
    end if;
    return null;
end;
$$;

comment on function public.communications_on_entitlement_change() is
  'BeautIzzy Plus 6.5B: after a mirror row changes (enforcement ON, PRODUCTION only) — suspend the Business''s pending communications when its owner is no longer entitled, re-derive future appointment reminders when she is. Swallows errors into a durable BUSINESS retry.';

revoke all on function public.communications_on_entitlement_change() from public, anon, authenticated, service_role;

drop trigger if exists subscription_entitlements_communications_reconcile on public.subscription_entitlements;
create trigger subscription_entitlements_communications_reconcile
  after insert or update on public.subscription_entitlements
  for each row execute function public.communications_on_entitlement_change();

-- ---------------------------------------------------------------------------
-- 8. The operator switch — flip + converge, in ONE transaction
-- ---------------------------------------------------------------------------
-- Result, as jsonb:
--
--   enabling   { "enabled": true,  "businesses_suspended": n, "communications_suspended": m }
--              every Business holding pending communications is evaluated; the
--              unentitled ones have them suspended at once (the worker's final
--              check would have caught them one by one anyway)
--   disabling  { "enabled": false, "businesses_reconciled": n }
--              the pre-enforcement state is restored: the whole-Business pass
--              re-derives the FUTURE appointment reminders of every Business
--              with EMAIL on (suspended rows stay history), and the lifecycle
--              sweep runs once (its passes resume at once; consumed annual /
--              episode keys are not re-created)
--
-- No EXECUTE grant at all: the table owner (the SQL Editor's `postgres`) is
-- the only caller. The mobile app, the worker and the webhook can never flip
-- the switch.
create or replace function public.communications_set_entitlement_enforcement(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_businesses integer := 0;
  v_communications integer := 0;
begin
  if p_enabled is null then
    raise exception 'communications: enabled must be true or false' using errcode = '22023';
  end if;

  insert into public.server_feature_flags (flag, enabled, enabled_at, updated_at)
  values ('COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT', p_enabled,
          case when p_enabled then now() end, now())
  on conflict (flag) do update set
    enabled = excluded.enabled,
    enabled_at = case when excluded.enabled then now() end,
    updated_at = now();

  if p_enabled then
    for v_business in
      select distinct business_id
        from public.scheduled_communications
       where status in ('SCHEDULED', 'PROCESSING')
    loop
      if not public.communications_is_entitled(v_business.business_id) then
        v_businesses := v_businesses + 1;
        v_communications := v_communications
          + public.communications_suspend_pending(v_business.business_id, null, null);
      end if;
    end loop;
    return jsonb_build_object(
      'enabled', true,
      'businesses_suspended', v_businesses,
      'communications_suspended', v_communications);
  end if;

  for v_business in
    select business_id
      from public.business_communication_preferences
     where email_reminders_enabled
  loop
    perform public.communications_reconcile_business(v_business.business_id);
    v_businesses := v_businesses + 1;
  end loop;
  perform public.communications_reconcile_client_lifecycle_all();
  return jsonb_build_object('enabled', false, 'businesses_reconciled', v_businesses);
end;
$$;

comment on function public.communications_set_entitlement_enforcement(boolean) is
  'BeautIzzy Plus 6.5B: the OPERATOR switch — flips COMMUNICATIONS_ENTITLEMENT_ENFORCEMENT and converges the queue in the same transaction (enable: suspend the pending communications of unentitled Businesses; disable: re-derive future reminders). No EXECUTE grant: table owner only.';

revoke all on function public.communications_set_entitlement_enforcement(boolean) from public, anon, authenticated, service_role;
