-- Souris — SMS reminder architecture (Communications Lot C1)
--
-- docs/architecture/COMMUNICATIONS.md §22–§27. Prepares the appointment
-- reminder engine for the SMS channel WITHOUT any provider and WITHOUT any
-- user-facing activation:
--
--   1. `business_communication_preferences.sms_reminders_enabled` — additive,
--      NOT NULL DEFAULT FALSE. It means TRANSACTIONAL appointment SMS only:
--      it is never consent for campaign/marketing SMS, which will require its
--      own explicit preference model;
--   2. phone canonicalization and SMS eligibility — TWO server rules in one
--      place each (`communications_client_phone_e164`,
--      `communications_is_sms_eligible_phone`). `clients.phone` itself is
--      NEVER rewritten, no canonical value is stored, and no sync payload
--      changes: the canonical destination is DERIVED at reconciliation time,
--      exactly like the client email;
--   3. the reconciliation, generalized BY CHANNEL: the shared appointment
--      rules (H-24 target, per-appointment master flag, tombstones, statuses,
--      refresh-in-place vs genuine reschedule, FAILED-never-revived, the
--      dedupe suffix, the post-send temporal guards) live ONCE in two
--      channel primitives; EMAIL and SMS differ only by global switch,
--      recipient resolver, payload and dedupe channel token. EMAIL behavior
--      is unchanged;
--   4. channel-scoped pending cancellation: turning ONE channel off cancels
--      that channel's pending appointment communications ONLY;
--   5. the client trigger also watches `phone` changes;
--   6. `communications_update_sms_preferences` — a narrow owner RPC in the
--      exact security model of the email one. NO app UI calls it in C1: SMS
--      stays user-invisible and can only be enabled through a controlled
--      server-side operation on the dedicated test Business;
--   7. `communications_appointment_reminder_statuses` — a NEW owner
--      projection returning one lightweight state per channel. The existing
--      `communications_appointment_reminder_status` keeps its exact shape
--      and behavior for deployed builds;
--   8. error scrubbing now redacts phone-shaped tokens next to emails.
--
-- FUTURE QUOTA SEAM (Lot C3 — deliberately NOT implemented here): the SMS
-- branch of `communications_reconcile_appointment` is the single place where
-- an atomic quota reservation will sit, between channel eligibility and the
-- enqueue. One reservation per LOGICAL communication (retries re-use the
-- claimed record and never consume again); the EMAIL branch never touches it.
--
-- PRODUCTION SAFETY — applying this migration alone sends NOTHING and
-- enables NOBODY:
--
--   * `sms_reminders_enabled` defaults to FALSE and no row is updated: every
--     existing Business stays OFF, and the SMS reconciliation branch exits
--     immediately while the switch is off;
--   * no Settings UI, no onboarding step and no app code path can turn it on;
--   * the worker still binds SMS to `UnsupportedChannelTransport`: even a
--     hand-enqueued SMS record fails permanently and explicitly;
--   * EMAIL reminders are untouched — same rules, same keys, same payloads.
--
-- Safe to re-run: `add column if not exists`, `create or replace`,
-- `drop function if exists` on this migration's own replacement target only.

-- ---------------------------------------------------------------------------
-- 1. The SMS master switch — additive, OFF, transactional-only
-- ---------------------------------------------------------------------------
alter table public.business_communication_preferences
  add column if not exists sms_reminders_enabled boolean not null default false;

comment on column public.business_communication_preferences.sms_reminders_enabled is
  'Communications Lot C1: TRANSACTIONAL appointment SMS only (reminders and their reschedule/cancellation notices). NEVER marketing consent — future campaigns require their own explicit preference. OFF by default; no user-facing switch exists before Lot C3.';

-- ---------------------------------------------------------------------------
-- 2. Phone canonicalization — ONE server rule, nothing stored
-- ---------------------------------------------------------------------------
-- `clients.phone` stays exactly what the professional typed (or imported).
-- The canonical E.164-like destination is derived HERE, at reconciliation
-- time, the way `communications_is_valid_email` derives email usability.
-- The app mirrors the rule for UX only (src/domain/communications/phone.ts);
-- the server remains authoritative.
--
-- The bare-national fallback assumes FRANCE — the V1 single-market constant,
-- like the worker's Europe/Paris timezone. Nothing is stored, so a future
-- per-Business default region is a change to THIS function only.
create or replace function public.communications_client_phone_e164(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_compact text;
begin
  if p_phone is null then
    return null;
  end if;
  -- Strip only the separators people actually type: spaces, dots, hyphens,
  -- parentheses. Anything left over (letters, a misplaced '+') must fail.
  v_compact := regexp_replace(btrim(p_phone), '[ .()-]', '', 'g');
  if v_compact ~ '^\+[1-9][0-9]{6,14}$' then
    return v_compact;                          -- already E.164-like
  end if;
  if v_compact ~ '^00[1-9][0-9]{6,14}$' then
    return '+' || substr(v_compact, 3);        -- international 00 prefix
  end if;
  if v_compact ~ '^0[1-9][0-9]{8}$' then
    return '+33' || substr(v_compact, 2);      -- French national format
  end if;
  return null;
end;
$$;

comment on function public.communications_client_phone_e164(text) is
  'Communications Lot C1: THE phone canonicalization rule. Display text in, E.164-like destination out (NULL when unusable). Never stored; clients.phone is never rewritten.';

revoke all on function public.communications_client_phone_e164(text) from public, anon, authenticated;
grant execute on function public.communications_client_phone_e164(text) to service_role;

-- SMS eligibility is DISTINCT from canonicalization: a French landline
-- (+331…) is structurally canonical but not an SMS destination. French
-- numbers must be mobile (+336/+337); other countries' valid E.164 numbers
-- pass — provider-level destination validation belongs to Lot C2.
create or replace function public.communications_is_sms_eligible_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when e164 is null then false
    when e164 like '+33%' then e164 ~ '^\+33[67][0-9]{8}$'
    else true
  end
  from (select public.communications_client_phone_e164(p_phone) as e164) s;
$$;

comment on function public.communications_is_sms_eligible_phone(text) is
  'Communications Lot C1: whether a client phone is an SMS destination. France: mobile (+336/+337) only; other valid E.164 numbers pass until Lot C2 provider validation.';

revoke all on function public.communications_is_sms_eligible_phone(text) from public, anon, authenticated;
grant execute on function public.communications_is_sms_eligible_phone(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Recipient resolvers — the per-channel snapshot sources
-- ---------------------------------------------------------------------------
create or replace function public.communications_client_email_recipient(
  p_business_id uuid,
  p_client_id text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select btrim(c.email)
    from public.clients c
   where c.business_id = p_business_id
     and c.id = p_client_id
     and c.deleted_at is null
     and public.communications_is_valid_email(c.email);
$$;

create or replace function public.communications_client_sms_recipient(
  p_business_id uuid,
  p_client_id text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.communications_client_phone_e164(c.phone)
    from public.clients c
   where c.business_id = p_business_id
     and c.id = p_client_id
     and c.deleted_at is null
     and public.communications_is_sms_eligible_phone(c.phone);
$$;

revoke all on function public.communications_client_email_recipient(uuid, text) from public, anon, authenticated;
revoke all on function public.communications_client_sms_recipient(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_client_email_recipient(uuid, text) to service_role;
grant execute on function public.communications_client_sms_recipient(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The SMS payload — provider-neutral, strictly smaller than email
-- ---------------------------------------------------------------------------
-- business_name, client_first_name, appointment_start_at (ISO instant),
-- services (snapshot names in item order). NO Reply-To, price, deposit,
-- payment, notes, status vocabulary or provider data. Postgres never renders
-- provider text: SMS copy/length/encoding is Lot C2 worker code.
create or replace function public.communications_appointment_sms_payload(
  p_business_id uuid,
  p_appointment_id text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business_name', b.name,
    'client_first_name', c.first_name,
    'appointment_start_at',
      to_char(a.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'services', coalesce((
      select jsonb_agg(i.service_name order by i.item_order)
      from public.appointment_items i
      where i.business_id = a.business_id and i.appointment_id = a.id
    ), '[]'::jsonb)
  )
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  left join public.clients c on c.business_id = a.business_id and c.id = a.client_id
  where a.business_id = p_business_id and a.id = p_appointment_id;
$$;

revoke all on function public.communications_appointment_sms_payload(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_appointment_sms_payload(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. ONE channel primitive for the initial H-24 reminder
-- ---------------------------------------------------------------------------
-- The exact Lot B decision table, parameterized by channel — never copied:
--
--   not eligible, active record        → cancel it
--   eligible, active at the same H-24  → refresh recipient/payload in place
--   eligible, active at another H-24   → genuine reschedule under a NEW
--                                        revision key
--   eligible, nothing active           → enqueue, unless a FAILED record for
--                                        this very H-24 exists; a terminal
--                                        record holding the minted key gets
--                                        the deterministic suffix
--
-- `p_channel_on` carries everything the CALLER computed once from shared
-- authoritative facts (global channel switch, appointment liveness/status,
-- per-appointment master flag, usable recipient). The primitive adds the two
-- channel-scoped queue facts (never-SENT, FAILED-at-this-H-24) and applies
-- the decision table against this channel's records only.
create or replace function public.communications_reconcile_appointment_channel(
  p_business_id uuid,
  p_appointment_id text,
  p_channel text,
  p_channel_on boolean,
  p_recipient text,
  p_payload jsonb,
  p_target timestamptz,
  p_sync_version bigint
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := lower(p_channel);
  v_active record;
  v_eligible boolean;
  v_key text;
  v_result jsonb;
  v_attempt integer;
begin
  v_eligible := coalesce(
        p_channel_on
    and p_recipient is not null
    and p_target >= now()
    and not exists (
      select 1 from public.scheduled_communications
       where business_id = p_business_id
         and source_type = 'APPOINTMENT' and source_id = p_appointment_id
         and kind = 'APPOINTMENT_REMINDER' and channel = p_channel
         and status = 'SENT'
    ), false);

  select id, scheduled_for, recipient, payload
    into v_active
    from public.scheduled_communications
   where business_id = p_business_id
     and source_type = 'APPOINTMENT' and source_id = p_appointment_id
     and kind = 'APPOINTMENT_REMINDER' and channel = p_channel
     and status in ('SCHEDULED', 'PROCESSING')
   order by created_at desc
   limit 1;

  if not v_eligible then
    if v_active.id is not null then
      perform public.communications_cancel(p_business_id, v_active.id);
    end if;
    return;
  end if;

  -- FUTURE QUOTA SEAM (Lot C3): the SMS branch will reserve quota HERE,
  -- atomically, before any enqueue — one reservation per logical
  -- communication. Nothing is implemented in C1.

  if v_active.id is not null and v_active.scheduled_for = p_target then
    -- Same logical scheduling event: refresh the mutable snapshot only.
    if v_active.recipient is distinct from p_recipient or v_active.payload is distinct from p_payload then
      perform public.communications_update_content(
        p_business_id, v_active.id, p_recipient, p_payload, p_target);
    end if;
    return;
  end if;

  -- Nothing active for this H-24. A FAILED attempt at this very H-24 stays
  -- failed: only a genuine scheduling change (another H-24) supersedes it.
  if v_active.id is null and exists (
    select 1 from public.scheduled_communications
     where business_id = p_business_id
       and source_type = 'APPOINTMENT' and source_id = p_appointment_id
       and kind = 'APPOINTMENT_REMINDER' and channel = p_channel
       and status = 'FAILED'
       and scheduled_for = p_target
  ) then
    return;
  end if;

  v_key := 'appointment:' || p_appointment_id || ':reminder:' || v_token || ':' || p_sync_version;
  for v_attempt in 1..5 loop
    v_result := public.communications_reschedule(
      p_business_id, 'APPOINTMENT', p_appointment_id,
      'APPOINTMENT_REMINDER', p_channel,
      p_recipient, p_payload, p_target, v_key);
    exit when v_result ->> 'status' = 'ENQUEUED';
    if v_result ->> 'communication_status' in ('SCHEDULED', 'PROCESSING') then
      -- The active record already carries this key: refresh it in place.
      perform public.communications_update_content(
        p_business_id, (v_result ->> 'id')::uuid, p_recipient, p_payload, p_target);
      exit;
    end if;
    v_key := 'appointment:' || p_appointment_id || ':reminder:' || v_token || ':'
      || p_sync_version || '.' || (
        select count(*) from public.scheduled_communications
         where business_id = p_business_id
           and source_type = 'APPOINTMENT' and source_id = p_appointment_id
           and kind = 'APPOINTMENT_REMINDER' and channel = p_channel
      ) || '.' || v_attempt;
  end loop;
end;
$$;

comment on function public.communications_reconcile_appointment_channel(uuid, text, text, boolean, text, jsonb, timestamptz, bigint) is
  'Communications Lot C1: the ONE channel-parameterized H-24 reminder decision table. EMAIL and SMS both go through here; the shared rules are never duplicated.';

revoke all on function public.communications_reconcile_appointment_channel(uuid, text, text, boolean, text, jsonb, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.communications_reconcile_appointment_channel(uuid, text, text, boolean, text, jsonb, timestamptz, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Reconciliation of one appointment — shared facts once, then per channel
-- ---------------------------------------------------------------------------
-- Same name and signature as Lot B (the triggers and the retry executor keep
-- calling it). EMAIL semantics are byte-for-byte the Lot B rules; SMS is the
-- same decision table with its own switch, recipient and payload.
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
  v_phone text;
  v_email_on boolean;
  v_sms_on boolean;
begin
  select a.id, a.client_id, a.start_at, a.status, a.client_reminder_enabled,
         a.sync_version, a.deleted_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;

  select email_reminders_enabled, sms_reminders_enabled
    into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;

  v_target := v_appointment.start_at - interval '24 hours';

  -- The shared appointment facts, computed ONCE: liveness, status, and the
  -- ONE per-appointment master switch (OFF = no channel at all).
  v_base := coalesce(
        v_appointment.id is not null
    and v_appointment.deleted_at is null
    and coalesce(v_appointment.client_reminder_enabled, true)
    and v_appointment.status in ('SCHEDULED', 'CONFIRMED'), false);

  if v_base then
    v_email := public.communications_client_email_recipient(p_business_id, v_appointment.client_id);
    v_phone := public.communications_client_sms_recipient(p_business_id, v_appointment.client_id);
  end if;

  v_email_on := coalesce(v_prefs.email_reminders_enabled, false) and v_base;
  v_sms_on := coalesce(v_prefs.sms_reminders_enabled, false) and v_base;

  perform public.communications_reconcile_appointment_channel(
    p_business_id, p_appointment_id, 'EMAIL',
    v_email_on, v_email,
    case when v_email_on and v_email is not null
      then public.communications_appointment_email_payload(p_business_id, p_appointment_id) end,
    v_target, v_appointment.sync_version);

  perform public.communications_reconcile_appointment_channel(
    p_business_id, p_appointment_id, 'SMS',
    v_sms_on, v_phone,
    case when v_sms_on and v_phone is not null
      then public.communications_appointment_sms_payload(p_business_id, p_appointment_id) end,
    v_target, v_appointment.sync_version);
end;
$$;

comment on function public.communications_reconcile_appointment(uuid, text) is
  'Communications Lot C1: THE reconciliation of one appointment''s initial H-24 reminders — shared facts loaded once, then each channel independently through the one channel primitive. Idempotent; server state only.';

-- ---------------------------------------------------------------------------
-- 7. ONE channel primitive for the post-send events
-- ---------------------------------------------------------------------------
-- The Lot B temporal guards, per channel. A channel mints RESCHEDULED /
-- CANCELLED notices ONLY when ITS OWN initial reminder was SENT: a SENT email
-- alone never produces an SMS event, and vice versa. "What the client was
-- last told" is also read per channel.
create or replace function public.communications_reconcile_appointment_events_channel(
  p_business_id uuid,
  p_appointment_id text,
  p_channel text,
  p_channel_on boolean,
  p_recipient text,
  p_payload jsonb,
  p_start_at timestamptz,
  p_status text,
  p_cancelled_at timestamptz,
  p_sync_version bigint
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := lower(p_channel);
  v_sent record;
  v_last_known timestamptz;
begin
  if not coalesce(p_channel_on, false) or p_recipient is null then
    return;
  end if;

  select id, scheduled_for
    into v_sent
    from public.scheduled_communications
   where business_id = p_business_id
     and source_type = 'APPOINTMENT' and source_id = p_appointment_id
     and kind = 'APPOINTMENT_REMINDER' and channel = p_channel
     and status = 'SENT'
   order by sent_at desc
   limit 1;
  if v_sent.id is null then
    return;
  end if;

  if p_status = 'CANCELLED' then
    -- Temporal guard: the occurrence must have been upcoming when the
    -- cancellation was RECORDED. Applies to BOTH cancellation origins
    -- (cancelled_by BUSINESS and CLIENT): the notice doubles as the client's
    -- confirmation that her own cancellation was recorded.
    if p_start_at > coalesce(p_cancelled_at, now()) then
      perform public.communications_enqueue(
        p_business_id, 'APPOINTMENT', p_appointment_id,
        'APPOINTMENT_CANCELLED', p_channel, p_recipient, p_payload,
        now(),
        -- A cancellation is a once-ever event of the appointment per
        -- channel: the fixed key makes concurrent minting race-safe.
        'appointment:' || p_appointment_id || ':cancelled:' || v_token);
    end if;
    return;
  end if;

  -- Temporal guard: only a genuinely upcoming, attendable NEW occurrence.
  if p_status in ('SCHEDULED', 'CONFIRMED') and p_start_at > now() then
    select (r.payload ->> 'appointment_start_at')::timestamptz
      into v_last_known
      from public.scheduled_communications r
     where r.business_id = p_business_id
       and r.source_type = 'APPOINTMENT' and r.source_id = p_appointment_id
       and r.kind = 'APPOINTMENT_RESCHEDULED' and r.channel = p_channel
       and r.status in ('SCHEDULED', 'PROCESSING', 'SENT')
     order by r.created_at desc
     limit 1;
    if v_last_known is null then
      v_last_known := v_sent.scheduled_for + interval '24 hours';
    end if;
    if date_trunc('milliseconds', p_start_at)
       is distinct from date_trunc('milliseconds', v_last_known) then
      perform public.communications_enqueue(
        p_business_id, 'APPOINTMENT', p_appointment_id,
        'APPOINTMENT_RESCHEDULED', p_channel, p_recipient, p_payload,
        now(),
        'appointment:' || p_appointment_id || ':rescheduled:' || v_token || ':' || p_sync_version);
    end if;
  end if;
end;
$$;

comment on function public.communications_reconcile_appointment_events_channel(uuid, text, text, boolean, text, jsonb, timestamptz, text, timestamptz, bigint) is
  'Communications Lot C1: the ONE channel-parameterized post-send event rule (rescheduled/cancelled notices with temporal guards). A channel needs ITS OWN SENT reminder.';

revoke all on function public.communications_reconcile_appointment_events_channel(uuid, text, text, boolean, text, jsonb, timestamptz, text, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.communications_reconcile_appointment_events_channel(uuid, text, text, boolean, text, jsonb, timestamptz, text, timestamptz, bigint) to service_role;

-- Post-send events for one appointment — shared facts once, then per channel.
-- Same name and signature as Lot B.
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
  v_phone text;
  v_email_on boolean;
  v_sms_on boolean;
begin
  select a.id, a.client_id, a.start_at, a.status, a.client_reminder_enabled,
         a.sync_version, a.deleted_at, a.cancelled_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;
  if v_appointment.id is null or v_appointment.deleted_at is not null then
    return;
  end if;

  -- The ONE per-appointment master switch gates every channel.
  if not coalesce(v_appointment.client_reminder_enabled, true) then
    return;
  end if;

  select email_reminders_enabled, sms_reminders_enabled
    into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;

  v_email_on := coalesce(v_prefs.email_reminders_enabled, false);
  v_sms_on := coalesce(v_prefs.sms_reminders_enabled, false);
  if not v_email_on and not v_sms_on then
    return;
  end if;

  v_email := public.communications_client_email_recipient(p_business_id, v_appointment.client_id);
  v_phone := public.communications_client_sms_recipient(p_business_id, v_appointment.client_id);

  perform public.communications_reconcile_appointment_events_channel(
    p_business_id, p_appointment_id, 'EMAIL',
    v_email_on, v_email,
    case when v_email_on and v_email is not null
      then public.communications_appointment_email_payload(p_business_id, p_appointment_id) end,
    v_appointment.start_at, v_appointment.status, v_appointment.cancelled_at,
    v_appointment.sync_version);

  perform public.communications_reconcile_appointment_events_channel(
    p_business_id, p_appointment_id, 'SMS',
    v_sms_on, v_phone,
    case when v_sms_on and v_phone is not null
      then public.communications_appointment_sms_payload(p_business_id, p_appointment_id) end,
    v_appointment.start_at, v_appointment.status, v_appointment.cancelled_at,
    v_appointment.sync_version);
end;
$$;

comment on function public.communications_reconcile_appointment_events(uuid, text) is
  'Communications Lot C1: post-send rescheduled/cancelled notices derived from CURRENT state, per channel, with temporal guards. Idempotent; retry-safe.';

-- ---------------------------------------------------------------------------
-- 8. Channel-scoped pending cancellation
-- ---------------------------------------------------------------------------
-- Turning ONE channel off cancels THAT channel's still-pending appointment
-- communications only. SENT / FAILED history is never touched; the other
-- channel's records are never touched. Idempotent.
create or replace function public.communications_cancel_business_appointment_pending(
  p_business_id uuid,
  p_channel text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_channel is null or p_channel not in ('EMAIL', 'SMS') then
    raise exception 'communications: unknown channel' using errcode = '22023';
  end if;
  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now()
   where business_id = p_business_id
     and source_type = 'APPOINTMENT'
     and channel = p_channel
     and status in ('SCHEDULED', 'PROCESSING');
end;
$$;

comment on function public.communications_cancel_business_appointment_pending(uuid, text) is
  'Communications Lot C1: cancel ONE channel''s pending appointment communications of a Business. Never touches the other channel or SENT/FAILED history.';

revoke all on function public.communications_cancel_business_appointment_pending(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_cancel_business_appointment_pending(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Business-wide reconciliation — active while EITHER channel is on
-- ---------------------------------------------------------------------------
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
     where business_id = p_business_id
       and (email_reminders_enabled or sms_reminders_enabled)
  ) then
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

-- ---------------------------------------------------------------------------
-- 10. Triggers — channel-aware preference flips, phone-aware client changes
-- ---------------------------------------------------------------------------
-- 10a. The preference row. Each channel that turns OFF cancels ITS pending
-- communications only; any enabled channel reconciles the Business (which
-- also refreshes pending payloads after a Reply-To change, exactly as
-- before). Disabling one channel NEVER cancels the other's records.
create or replace function public.communications_on_preferences_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.email_reminders_enabled and not new.email_reminders_enabled then
    perform public.communications_cancel_business_appointment_pending(new.business_id, 'EMAIL');
  end if;
  if tg_op = 'UPDATE' and old.sms_reminders_enabled and not new.sms_reminders_enabled then
    perform public.communications_cancel_business_appointment_pending(new.business_id, 'SMS');
  end if;
  if new.email_reminders_enabled or new.sms_reminders_enabled then
    perform public.communications_reconcile_business(new.business_id);
  end if;
  return null;
exception
  when others then
    raise warning 'communications: preference reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.business_id, 'BUSINESS', '', sqlerrm);
    return null;
end;
$$;

-- 10b. Clients. `phone` now counts as a communication-relevant change next
-- to email / first name / tombstone: a corrected number updates the pending
-- SMS recipient in place, a removed or unusable one cancels the pending SMS,
-- one added before H-24 schedules it — all through the same per-appointment
-- reconciliation, without disturbing EMAIL.
create or replace function public.communications_on_client_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment record;
begin
  if new.email is not distinct from old.email
     and new.phone is not distinct from old.phone
     and new.first_name is not distinct from old.first_name
     and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;
  if not exists (
    select 1 from public.business_communication_preferences
     where business_id = new.business_id
       and (email_reminders_enabled or sms_reminders_enabled)
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
-- 11. The retry executor — channel-aware BUSINESS scope
-- ---------------------------------------------------------------------------
-- Same name and signature. The BUSINESS pass cancels each DISABLED channel's
-- pending communications and reconciles while ANY channel is enabled, so a
-- deferred enable and a deferred disable both converge per channel.
create or replace function public.communications_run_reconciliation(
  p_business_id uuid,
  p_scope_type text,
  p_source_id text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prefs record;
begin
  if p_business_id is null then
    raise exception 'communications: business id is required' using errcode = '22023';
  end if;
  if p_scope_type = 'APPOINTMENT' then
    if p_source_id is null or char_length(p_source_id) = 0 then
      raise exception 'communications: appointment id is required' using errcode = '22023';
    end if;
    perform public.communications_reconcile_appointment_events(p_business_id, p_source_id);
    perform public.communications_reconcile_appointment(p_business_id, p_source_id);
  elsif p_scope_type = 'BUSINESS' then
    select email_reminders_enabled, sms_reminders_enabled
      into v_prefs
      from public.business_communication_preferences
     where business_id = p_business_id;
    if not coalesce(v_prefs.email_reminders_enabled, false) then
      perform public.communications_cancel_business_appointment_pending(p_business_id, 'EMAIL');
    end if;
    if not coalesce(v_prefs.sms_reminders_enabled, false) then
      perform public.communications_cancel_business_appointment_pending(p_business_id, 'SMS');
    end if;
    if coalesce(v_prefs.email_reminders_enabled, false)
       or coalesce(v_prefs.sms_reminders_enabled, false) then
      perform public.communications_reconcile_business(p_business_id);
    end if;
  else
    raise exception 'communications: unknown reconciliation scope' using errcode = '22023';
  end if;
end;
$$;

comment on function public.communications_run_reconciliation(uuid, text, text) is
  'Communications Lot C1: re-run the authoritative reconciliation for one retry target, from CURRENT state, per channel. Raises on failure; the worker applies the bounded policy.';

-- The unscoped Lot B cancel helper has no caller left; the channel-scoped
-- overload above replaces it. Dropping it keeps ONE cancellation rule.
drop function if exists public.communications_cancel_business_appointment_pending(uuid);

-- ---------------------------------------------------------------------------
-- 12. Error scrubbing — redact phone-shaped tokens next to emails
-- ---------------------------------------------------------------------------
-- Over-redaction is deliberate: last_error is diagnostics, never data.
create or replace function public.communications_scrub_error(p_error text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      regexp_replace(coalesce(p_error, 'unknown reconciliation error'),
        '[^[:space:]]+@[^[:space:]]+', '[email]', 'g'),
      '\+?[0-9][0-9 ().-]{5,}[0-9]', '[phone]', 'g'),
    300);
$$;

revoke all on function public.communications_scrub_error(text) from public, anon, authenticated;
grant execute on function public.communications_scrub_error(text) to service_role;

create or replace function public.communications_record_reconciliation_retry(
  p_business_id uuid,
  p_scope_type text,
  p_source_id text,
  p_error text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.communication_reconciliation_jobs
    (business_id, scope_type, source_id, last_error)
  values (
    p_business_id,
    p_scope_type,
    coalesce(p_source_id, ''),
    public.communications_scrub_error(p_error)
  )
  on conflict (business_id, scope_type, source_id) do update set
    attempt_count = 0,
    next_attempt_at = now(),
    last_error = excluded.last_error,
    updated_at = now();
exception
  when others then
    raise warning 'communications: could not record reconciliation retry (%)', sqlstate;
end;
$$;

create or replace function public.communications_fail_reconciliation_job(
  p_id uuid,
  p_claimed_updated_at timestamptz,
  p_error text,
  p_retry_delay_seconds integer
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_id is null or p_claimed_updated_at is null then
    raise exception 'communications: job id and claim instant are required' using errcode = '22023';
  end if;
  if p_retry_delay_seconds is not null
     and (p_retry_delay_seconds < 0 or p_retry_delay_seconds > 604800) then
    raise exception 'communications: retry delay must be between 0 and 604800 seconds' using errcode = '22023';
  end if;

  update public.communication_reconciliation_jobs
     set next_attempt_at = case
           when p_retry_delay_seconds is null then 'infinity'::timestamptz
           else now() + make_interval(secs => p_retry_delay_seconds)
         end,
         last_error = public.communications_scrub_error(p_error),
         updated_at = now()
   where id = p_id and updated_at = p_claimed_updated_at;
  if found then
    return jsonb_build_object(
      'status', case when p_retry_delay_seconds is null then 'PARKED' else 'RETRY_SCHEDULED' end);
  end if;
  if exists (select 1 from public.communication_reconciliation_jobs where id = p_id) then
    return jsonb_build_object('status', 'SUPERSEDED');
  end if;
  return jsonb_build_object('status', 'ABSENT');
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Owner RPCs — SMS preference + per-channel status projection
-- ---------------------------------------------------------------------------
-- 13a. Read: additively extended. Old builds ignore the extra key.
create or replace function public.communications_read_preferences(p_business_id uuid)
returns jsonb
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

  select email_reminders_enabled, sms_reminders_enabled, reply_to_email, updated_at
    into v_row
    from public.business_communication_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'email_reminders_enabled', coalesce(v_row.email_reminders_enabled, false),
    'sms_reminders_enabled', coalesce(v_row.sms_reminders_enabled, false),
    'reply_to_email', v_row.reply_to_email,
    'updated_at', case when v_row.updated_at is null then null
      else to_char(v_row.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  );
end;
$$;

-- 13b. The email update RPC: SAME signature, SAME email-only writes (the
-- upsert never touches sms_reminders_enabled, so an old build updating email
-- preferences can never reset the SMS switch). The answer additively gains
-- the stored SMS state so a new build never mirrors a stale value.
create or replace function public.communications_update_preferences(
  p_business_id uuid,
  p_email_reminders_enabled boolean,
  p_reply_to_email text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reply_to text;
  v_sms boolean;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;
  if p_email_reminders_enabled is null then
    raise exception 'communications: email_reminders_enabled is required' using errcode = '22023';
  end if;

  v_reply_to := nullif(btrim(coalesce(p_reply_to_email, '')), '');
  if v_reply_to is not null and not public.communications_is_valid_email(v_reply_to) then
    return jsonb_build_object('status', 'INVALID_REPLY_TO');
  end if;
  if p_email_reminders_enabled and v_reply_to is null then
    return jsonb_build_object('status', 'INVALID_REPLY_TO');
  end if;

  insert into public.business_communication_preferences
    (business_id, email_reminders_enabled, reply_to_email)
  values (p_business_id, p_email_reminders_enabled, v_reply_to)
  on conflict (business_id) do update set
    email_reminders_enabled = excluded.email_reminders_enabled,
    reply_to_email = excluded.reply_to_email;

  select sms_reminders_enabled into v_sms
    from public.business_communication_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'status', 'UPDATED',
    'email_reminders_enabled', p_email_reminders_enabled,
    'sms_reminders_enabled', coalesce(v_sms, false),
    'reply_to_email', v_reply_to
  );
end;
$$;

-- 13c. The SMS switch — its own NARROW owner RPC, exactly the email security
-- model (DEFINER, owner check FIRST, pinned search_path). NO app UI calls it
-- in C1: enabling SMS is a controlled server-side operation on the dedicated
-- test Business until Lot C3 ships the user-facing switch.
create or replace function public.communications_update_sms_preferences(
  p_business_id uuid,
  p_sms_reminders_enabled boolean
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
  if p_sms_reminders_enabled is null then
    raise exception 'communications: sms_reminders_enabled is required' using errcode = '22023';
  end if;

  insert into public.business_communication_preferences
    (business_id, sms_reminders_enabled)
  values (p_business_id, p_sms_reminders_enabled)
  on conflict (business_id) do update set
    sms_reminders_enabled = excluded.sms_reminders_enabled;

  select email_reminders_enabled, sms_reminders_enabled, reply_to_email
    into v_row
    from public.business_communication_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'status', 'UPDATED',
    'email_reminders_enabled', v_row.email_reminders_enabled,
    'sms_reminders_enabled', v_row.sms_reminders_enabled,
    'reply_to_email', v_row.reply_to_email
  );
end;
$$;

comment on function public.communications_update_sms_preferences(uuid, boolean) is
  'Communications Lot C1: the owner turns TRANSACTIONAL appointment SMS on/off. No app UI calls it before Lot C3; reconciliation follows through the table trigger.';

-- 13d. The per-channel status of one appointment for one channel — the
-- shared derivation behind the new projection. Server-side only.
create or replace function public.communications_appointment_reminder_channel_status(
  p_business_id uuid,
  p_appointment_id text,
  p_channel text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_appointment record;
  v_record record;
  v_prefs record;
  v_channel_enabled boolean;
  v_email_ok boolean;
  v_phone text;
begin
  select a.client_id, a.start_at, a.status, a.client_reminder_enabled, a.deleted_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;
  if v_appointment.client_id is null then
    return jsonb_build_object('status', 'NONE');
  end if;

  select status, scheduled_for, sent_at
    into v_record
    from public.scheduled_communications
   where business_id = p_business_id
     and source_type = 'APPOINTMENT' and source_id = p_appointment_id
     and kind = 'APPOINTMENT_REMINDER' and channel = p_channel
   order by case status
       when 'SENT' then 1
       when 'SCHEDULED' then 2
       when 'PROCESSING' then 2
       when 'FAILED' then 3
       else 4 end,
     created_at desc
   limit 1;

  if v_record.status = 'SENT' then
    return jsonb_build_object(
      'status', 'SENT',
      'sent_at', to_char(v_record.sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;
  if v_record.status in ('SCHEDULED', 'PROCESSING') then
    return jsonb_build_object(
      'status', 'SCHEDULED',
      'scheduled_for', to_char(v_record.scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;
  if v_record.status = 'FAILED' then
    return jsonb_build_object('status', 'FAILED');
  end if;

  -- Nothing in the queue (or only cancelled history): derive the reason.
  select email_reminders_enabled, sms_reminders_enabled
    into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;
  v_channel_enabled := case p_channel
    when 'EMAIL' then coalesce(v_prefs.email_reminders_enabled, false)
    else coalesce(v_prefs.sms_reminders_enabled, false) end;
  if not v_channel_enabled or not coalesce(v_appointment.client_reminder_enabled, true) then
    return jsonb_build_object('status', 'DISABLED');
  end if;
  if v_appointment.deleted_at is not null
     or v_appointment.status not in ('SCHEDULED', 'CONFIRMED')
     or v_appointment.start_at <= now() then
    return jsonb_build_object('status', 'NONE');
  end if;

  if p_channel = 'EMAIL' then
    select public.communications_is_valid_email(c.email)
      into v_email_ok
      from public.clients c
     where c.business_id = p_business_id and c.id = v_appointment.client_id
       and c.deleted_at is null;
    if not coalesce(v_email_ok, false) then
      return jsonb_build_object('status', 'MISSING_EMAIL');
    end if;
  else
    -- MISSING (no number at all) and INVALID (a number that cannot become an
    -- SMS-eligible destination) are distinct states — and NEVER failures.
    select c.phone
      into v_phone
      from public.clients c
     where c.business_id = p_business_id and c.id = v_appointment.client_id
       and c.deleted_at is null;
    if not found or v_phone is null or btrim(v_phone) = '' then
      return jsonb_build_object('status', 'MISSING_PHONE');
    end if;
    if not public.communications_is_sms_eligible_phone(v_phone) then
      return jsonb_build_object('status', 'INVALID_PHONE');
    end if;
  end if;

  if v_appointment.start_at - interval '24 hours' < now() then
    return jsonb_build_object('status', 'TOO_LATE');
  end if;

  return jsonb_build_object('status', 'NONE');
end;
$$;

revoke all on function public.communications_appointment_reminder_channel_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.communications_appointment_reminder_channel_status(uuid, text, text) to service_role;

-- 13e. The NEW owner projection: one lightweight state PER CHANNEL. The
-- existing single-channel `communications_appointment_reminder_status` is
-- deliberately untouched (deployed builds parse its exact shape). Never
-- exposes recipient, payload, provider id, attempts, errors or dedupe keys.
create or replace function public.communications_appointment_reminder_statuses(
  p_business_id uuid,
  p_appointment_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;

  return jsonb_build_array(
    jsonb_build_object('channel', 'EMAIL')
      || public.communications_appointment_reminder_channel_status(p_business_id, p_appointment_id, 'EMAIL'),
    jsonb_build_object('channel', 'SMS')
      || public.communications_appointment_reminder_channel_status(p_business_id, p_appointment_id, 'SMS')
  );
end;
$$;

comment on function public.communications_appointment_reminder_statuses(uuid, text) is
  'Communications Lot C1: narrow owner-scoped READ-ONLY per-channel reminder projection of one appointment. Never exposes queue internals.';

revoke all on function public.communications_update_sms_preferences(uuid, boolean) from public, anon;
revoke all on function public.communications_appointment_reminder_statuses(uuid, text) from public, anon;
grant execute on function public.communications_update_sms_preferences(uuid, boolean) to authenticated;
grant execute on function public.communications_appointment_reminder_statuses(uuid, text) to authenticated;
