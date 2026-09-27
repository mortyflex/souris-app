-- Souris — Retire appointment SMS (SMS product pivot, Phase 1)
--
-- docs/architecture/COMMUNICATIONS.md §31. Product decision: appointment
-- reminders are EMAIL-only. SMS is reserved for the future client-lifecycle
-- automations (CLIENT_BIRTHDAY_OFFER, INACTIVE_CLIENT_FOLLOWUP — Phase 2,
-- NOT implemented here). This migration makes the appointment engine
-- STRUCTURALLY unable to enqueue channel = 'SMS', even if a Business row
-- somehow had `sms_reminders_enabled = true`:
--
--   * `communications_reconcile_appointment` and
--     `communications_reconcile_appointment_events` are replaced in place
--     (same signatures) and now evaluate the EMAIL channel ONLY;
--   * the preference trigger, the whole-Business pass and the retry
--     executor's BUSINESS scope ignore the SMS switch entirely;
--   * still-pending APPOINTMENT SMS rows (production count today: zero) are
--     defensively CANCELLED — legal transitions only (SCHEDULED|PROCESSING
--     → CANCELLED); SENT / FAILED / CANCELLED history and CLIENT-source
--     rows are never touched;
--   * `business_communication_preferences.sms_reminders_enabled` and
--     `communications_update_sms_preferences` are KEPT for backwards/schema
--     compatibility but DEPRECATED: writing them reconciles nothing and can
--     never create an SMS.
--
-- Deliberately KEPT (reusable, channel-generic, or additive-and-harmless):
-- the Communication Core channel vocabulary (EMAIL | SMS), the channel
-- reconciliation primitives (now exercised for EMAIL only), phone
-- canonicalization / SMS eligibility (`communications_client_phone_e164`,
-- `communications_is_sms_eligible_phone`, `communications_client_sms_
-- recipient` — Phase 2 needs them), the channel-scoped pending cancellation,
-- the client trigger's `phone` watch (a harmless no-op for appointments,
-- useful again for lifecycle SMS), and both reminder status projections
-- (the app simply uses the legacy EMAIL-only one).
--
-- Applying this migration alone sends NOTHING and enables nobody. The
-- already-applied C1 migration is never edited. Safe to re-run:
-- `create or replace`, idempotent UPDATE, `drop function if exists`.

-- ---------------------------------------------------------------------------
-- 1. Deprecation — dormant appointment-SMS preference surface
-- ---------------------------------------------------------------------------
comment on column public.business_communication_preferences.sms_reminders_enabled is
  'DEPRECATED (SMS pivot Phase 1): the retired appointment-SMS preference. Kept for backwards/schema compatibility only; no current product behavior reads it, and it can never create an SMS. It is NOT a lifecycle/marketing SMS consent and must never be repurposed as one.';

comment on function public.communications_update_sms_preferences(uuid, boolean) is
  'DEPRECATED (SMS pivot Phase 1): kept for backwards/schema compatibility. Writes the dormant sms_reminders_enabled flag; reconciles nothing and can never create an SMS.';

-- ---------------------------------------------------------------------------
-- 2. Reconciliation of ONE appointment's initial reminder — EMAIL only
-- ---------------------------------------------------------------------------
-- Same name and signature as C1 (the triggers and the retry executor keep
-- calling it). The shared facts and the ONE channel decision table
-- (`communications_reconcile_appointment_channel`) are unchanged; the SMS
-- branch is simply GONE, so no code path can enqueue an appointment SMS.
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
  'Communications (SMS pivot Phase 1): THE reconciliation of one appointment''s initial H-24 reminder — EMAIL ONLY. The appointment engine is structurally unable to enqueue SMS. Idempotent; server state only.';

-- ---------------------------------------------------------------------------
-- 3. Post-send events — EMAIL only
-- ---------------------------------------------------------------------------
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
  'Communications (SMS pivot Phase 1): post-send rescheduled/cancelled notices derived from CURRENT state — EMAIL ONLY, with the Lot B temporal guards. Idempotent; retry-safe.';

-- ---------------------------------------------------------------------------
-- 4. Business-wide reconciliation — active while EMAIL is on
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
     where business_id = p_business_id and email_reminders_enabled
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
-- 5. Triggers and retry executor — the SMS switch is ignored entirely
-- ---------------------------------------------------------------------------
-- 5a. The preference row: EMAIL semantics exactly as validated in
-- production. The dormant SMS columns change nothing when written.
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
  if new.email_reminders_enabled then
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

-- 5b. Clients: gate on the EMAIL preference only. The `phone` watch stays
-- (a harmless refresh for appointments today; useful again for lifecycle
-- SMS in Phase 2).
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

-- 5c. The retry executor's BUSINESS scope: EMAIL semantics only.
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
    if exists (
      select 1 from public.business_communication_preferences
       where business_id = p_business_id and email_reminders_enabled
    ) then
      perform public.communications_reconcile_business(p_business_id);
    else
      perform public.communications_cancel_business_appointment_pending(p_business_id, 'EMAIL');
    end if;
  else
    raise exception 'communications: unknown reconciliation scope' using errcode = '22023';
  end if;
end;
$$;

comment on function public.communications_run_reconciliation(uuid, text, text) is
  'Communications (SMS pivot Phase 1): re-run the authoritative reconciliation for one retry target, from CURRENT state — appointment communications are EMAIL only. Raises on failure; the worker applies the bounded policy.';

-- ---------------------------------------------------------------------------
-- 6. Defensive cleanup of still-pending APPOINTMENT SMS rows
-- ---------------------------------------------------------------------------
-- Production holds zero SMS communications today; this is belt-and-braces.
-- Legal lifecycle transitions only (SCHEDULED|PROCESSING → CANCELLED — a
-- PROCESSING record is re-checked by the worker before dispatch, so the
-- cancellation wins whenever it lands first). SENT / FAILED / CANCELLED
-- history is untouched, and CLIENT-source rows are NEVER touched.
update public.scheduled_communications
   set status = 'CANCELLED',
       cancelled_at = now()
 where source_type = 'APPOINTMENT'
   and channel = 'SMS'
   and status in ('SCHEDULED', 'PROCESSING');

-- ---------------------------------------------------------------------------
-- 7. Drop the appointment-SMS payload builder (appointment-specific, now
--    unreferenced). The reusable phone/eligibility/recipient helpers and
--    the channel primitives all STAY.
-- ---------------------------------------------------------------------------
drop function if exists public.communications_appointment_sms_payload(uuid, text);
