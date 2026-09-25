-- Souris — Appointment email reminders (Communications Lot B)
--
-- docs/architecture/COMMUNICATIONS.md. Builds the appointment integration on
-- the Lot A Communication Core: the server now decides, schedules, updates and
-- cancels appointment EMAIL communications from authoritative Postgres state.
-- The mobile app NEVER enqueues: it syncs appointments and edits one narrow,
-- owner-scoped preference; reconciliation happens here, in triggers, after the
-- synced state is committed.
--
-- PRODUCTION SAFETY — applying this migration alone sends NOTHING:
--
--   * `business_communication_preferences` starts EMPTY and its
--     `email_reminders_enabled` defaults to FALSE: no existing Business is
--     opted in, and reconciliation exits immediately while the preference is
--     off. Zero rows are enqueued by the migration itself;
--   * `appointments.client_reminder_enabled` is added NULLABLE with no
--     backfill: no row is rewritten, no `sync_version` moves, no device
--     re-pulls anything. NULL reads as "enabled" — the per-appointment flag
--     only matters once the professional explicitly enables the global
--     preference;
--   * real delivery still requires the deployed worker, its secret key, the
--     Resend secrets and the cron job — none of which this migration touches.
--
-- What this migration adds:
--
--   1. `appointments.client_reminder_enabled boolean` (nullable);
--   2. `business_communication_preferences` — server-authoritative, one row
--      per Business, RLS with NO policy and NO table grant: the app goes
--      through two narrow owner RPCs (`communications_read_preferences`,
--      `communications_update_preferences`);
--   3. reconciliation: SECURITY DEFINER helpers + AFTER triggers on
--      `appointments`, `clients`, `businesses` and the preference table that
--      keep the Lot A queue consistent with the appointment state (schedule at
--      H-24, update pending content in place, cancel, and the post-send
--      rescheduled / cancelled events);
--   4. `communications_appointment_reminder_status` — the narrow, owner-scoped
--      READ-ONLY projection of one appointment's reminder state (never the
--      queue row itself);
--   5. `sync_push_aggregate` / `sync_pull_business_aggregates` replaced IN
--      PLACE (identical signatures) so the APPOINTMENT aggregate carries
--      `client_reminder_enabled`, with the usual missing-key rule for builds
--      that predate the field.
--
-- SECURITY DEFINER note: the sync RPCs remain SECURITY INVOKER. The functions
-- below that are DEFINER exist precisely because the queue and the preference
-- table have NO authenticated surface: reconciliation is server code that runs
-- with the server's rights, and the three owner RPCs check
-- `public.is_business_owner` FIRST, keep `search_path = ''`, and expose only
-- the documented narrow result. Trigger bodies swallow their own errors
-- (WARNING, not EXCEPTION): a reminder bug must never make an appointment
-- save or a sync push fail.
--
-- Safe to re-run: `add column if not exists`, `create table if not exists`,
-- `create or replace`, `drop trigger if exists`.

-- ---------------------------------------------------------------------------
-- 1. Per-appointment client reminder flag
-- ---------------------------------------------------------------------------
alter table public.appointments add column if not exists client_reminder_enabled boolean;

comment on column public.appointments.client_reminder_enabled is
  'Per-appointment client reminder override (Lot B). NULL = never explicitly set = enabled. The global business_communication_preferences row is the master switch; this flag alone never sends anything.';

-- ---------------------------------------------------------------------------
-- 2. Email shape rule — ONE place, shared by the CHECK, the RPCs and the
--    reconciliation (the app mirrors it in src/domain/communications/email.ts)
-- ---------------------------------------------------------------------------
create or replace function public.communications_is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
     and char_length(btrim(p_email)) between 3 and 320
     and btrim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

comment on function public.communications_is_valid_email(text) is
  'Communications: the ONE email-usability shape check (UX-level, not RFC 5322). No whitespace, so no header injection can ride an address.';

revoke all on function public.communications_is_valid_email(text) from public, anon, authenticated;
grant execute on function public.communications_is_valid_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The global preference — server-authoritative, one row per Business
-- ---------------------------------------------------------------------------
-- OFF by default, always. A row only exists once the owner touched the
-- setting; a missing row reads as disabled with no Reply-To. Enabling
-- REQUIRES a valid Reply-To (CHECKed twice: here and in the update RPC).
create table if not exists public.business_communication_preferences (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  email_reminders_enabled boolean not null default false,
  reply_to_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_communication_preferences_reply_to_shape
    check (reply_to_email is null or public.communications_is_valid_email(reply_to_email)),
  constraint business_communication_preferences_enabled_requires_reply_to
    check (not email_reminders_enabled or reply_to_email is not null)
);

comment on table public.business_communication_preferences is
  'Communications Lot B: the master switch and Reply-To of a Business, server-authoritative. OFF by default; no authenticated table access — the owner goes through communications_read_preferences / communications_update_preferences.';

create or replace function public.communications_preferences_before_write()
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
  new.reply_to_email := nullif(btrim(coalesce(new.reply_to_email, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.communications_preferences_before_write() from public, anon, authenticated;

drop trigger if exists business_communication_preferences_before_write
  on public.business_communication_preferences;
create trigger business_communication_preferences_before_write
  before insert or update on public.business_communication_preferences
  for each row execute function public.communications_preferences_before_write();

-- No client path at all, like the queue: RLS with zero policies + no grant.
alter table public.business_communication_preferences enable row level security;
revoke all on table public.business_communication_preferences from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Content refresh of a still-pending record (server-only primitive)
-- ---------------------------------------------------------------------------
-- Lot B's addition to the Lot A mutation surface: a pending (SCHEDULED)
-- record's recipient / payload / instant are refreshed IN PLACE when the
-- logical event did not change (a service rename, a corrected client email, a
-- new business name, a Reply-To change). Never a new logical communication.
-- A PROCESSING record is left alone (the worker is dispatching it) and
-- reported IGNORED, like the Lot A settlements.
create or replace function public.communications_update_content(
  p_business_id uuid,
  p_id uuid,
  p_recipient text,
  p_payload jsonb,
  p_scheduled_for timestamptz default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_business_id is null or p_id is null then
    raise exception 'communications: business id and communication id are required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'communications: payload must be a json object' using errcode = '22023';
  end if;

  update public.scheduled_communications
     set recipient = btrim(p_recipient),
         payload = p_payload,
         scheduled_for = coalesce(p_scheduled_for, scheduled_for),
         next_attempt_at = coalesce(p_scheduled_for, next_attempt_at)
   where id = p_id
     and business_id = p_business_id
     and status = 'SCHEDULED';
  if found then
    return jsonb_build_object('status', 'UPDATED');
  end if;
  if not exists (
    select 1 from public.scheduled_communications
     where id = p_id and business_id = p_business_id
  ) then
    return jsonb_build_object('status', 'ABSENT');
  end if;
  return jsonb_build_object('status', 'IGNORED');
end;
$$;

comment on function public.communications_update_content(uuid, uuid, text, jsonb, timestamptz) is
  'Communication Core (Lot B): refresh the mutable snapshot (recipient, payload, instant) of one still-SCHEDULED record in place. Never creates, revives or resends anything.';

revoke all on function public.communications_update_content(uuid, uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.communications_update_content(uuid, uuid, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The appointment email payload — exactly what the templates need
-- ---------------------------------------------------------------------------
-- business_name, client_first_name, appointment_start_at (ISO instant; the
-- worker formats date and time in French), services (snapshot names in item
-- order), reply_to. NO price, deposit, payment, status vocabulary, notes or
-- provider data — the templates must not even be able to leak them.
create or replace function public.communications_appointment_email_payload(
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
    ), '[]'::jsonb),
    'reply_to', p.reply_to_email
  )
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  left join public.clients c on c.business_id = a.business_id and c.id = a.client_id
  left join public.business_communication_preferences p on p.business_id = a.business_id
  where a.business_id = p_business_id and a.id = p_appointment_id;
$$;

revoke all on function public.communications_appointment_email_payload(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_appointment_email_payload(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Reconciliation of ONE appointment's initial reminder
-- ---------------------------------------------------------------------------
-- THE Lot B scheduling rule, in one place. Desired state:
--
--   eligible  =  global preference ON
--            AND appointment reminder not explicitly off (NULL = on)
--            AND appointment live (not tombstoned), SCHEDULED or CONFIRMED
--            AND client live with a usable email
--            AND H-24 (start_at - 24 h) has not passed
--            AND the initial reminder was never SENT
--
--   scheduled_for = start_at - 24 hours, exactly. An appointment created
--   less than 24 h before start gets NO reminder, never a late one.
--
-- Against the queue:
--
--   not eligible, active record        → cancel it (no email: the client never
--                                        heard from Souris for this one)
--   eligible, active at the same H-24  → refresh recipient/payload in place
--                                        (service/name/Reply-To changes are
--                                        NOT new logical events)
--   eligible, active at another H-24   → a genuine reschedule: cancel + enqueue
--                                        under a NEW revision key
--   eligible, nothing active           → enqueue, unless a FAILED record for
--                                        this same H-24 exists (a content-only
--                                        change never revives a failure) —
--                                        the CURRENT `sync_version` is the
--                                        revision inside the dedupe key, and a
--                                        terminal record already holding the
--                                        key gets a deterministic suffix so a
--                                        cancelled logical event (global OFF →
--                                        ON, email removed → re-added) can be
--                                        succeeded by a new one
--
-- Idempotent by construction: run twice on the same state, the second run
-- finds the active record at the same H-24 with identical content and does
-- nothing.
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
  v_email text;
  v_target timestamptz;
  v_active record;
  v_eligible boolean;
  v_payload jsonb;
  v_key text;
  v_result jsonb;
  v_attempt integer;
begin
  select a.id, a.client_id, a.start_at, a.status, a.client_reminder_enabled,
         a.sync_version, a.deleted_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;

  select email_reminders_enabled, reply_to_email
    into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;

  if v_appointment.id is not null then
    select btrim(c.email)
      into v_email
      from public.clients c
     where c.business_id = p_business_id
       and c.id = v_appointment.client_id
       and c.deleted_at is null
       and public.communications_is_valid_email(c.email);
  end if;

  v_target := v_appointment.start_at - interval '24 hours';

  v_eligible :=
        coalesce(v_prefs.email_reminders_enabled, false)
    and v_appointment.id is not null
    and v_appointment.deleted_at is null
    and coalesce(v_appointment.client_reminder_enabled, true)
    and v_appointment.status in ('SCHEDULED', 'CONFIRMED')
    and v_email is not null
    and v_target >= now()
    and not exists (
      select 1 from public.scheduled_communications
       where business_id = p_business_id
         and source_type = 'APPOINTMENT' and source_id = p_appointment_id
         and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
         and status = 'SENT'
    );

  select id, scheduled_for, recipient, payload
    into v_active
    from public.scheduled_communications
   where business_id = p_business_id
     and source_type = 'APPOINTMENT' and source_id = p_appointment_id
     and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
     and status in ('SCHEDULED', 'PROCESSING')
   order by created_at desc
   limit 1;

  if not v_eligible then
    if v_active.id is not null then
      perform public.communications_cancel(p_business_id, v_active.id);
    end if;
    return;
  end if;

  v_payload := public.communications_appointment_email_payload(p_business_id, p_appointment_id);

  if v_active.id is not null and v_active.scheduled_for = v_target then
    -- Same logical scheduling event: refresh the mutable snapshot only.
    if v_active.recipient is distinct from v_email or v_active.payload is distinct from v_payload then
      perform public.communications_update_content(
        p_business_id, v_active.id, v_email, v_payload, v_target);
    end if;
    return;
  end if;

  -- Nothing active for this H-24. A FAILED attempt at this very H-24 stays
  -- failed: only a genuine scheduling change (another H-24) supersedes it.
  if v_active.id is null and exists (
    select 1 from public.scheduled_communications
     where business_id = p_business_id
       and source_type = 'APPOINTMENT' and source_id = p_appointment_id
       and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
       and status = 'FAILED'
       and scheduled_for = v_target
  ) then
    return;
  end if;

  -- (Re)schedule under the CURRENT appointment revision. `communications_
  -- reschedule` cancels the active record whose key differs and enqueues
  -- idempotently. A terminal record already holding the minted key (the same
  -- revision was scheduled then cancelled — e.g. global OFF → ON) is a spent
  -- logical event: extend the key deterministically and try again.
  v_key := 'appointment:' || p_appointment_id || ':reminder:email:' || v_appointment.sync_version;
  for v_attempt in 1..5 loop
    v_result := public.communications_reschedule(
      p_business_id, 'APPOINTMENT', p_appointment_id,
      'APPOINTMENT_REMINDER', 'EMAIL',
      v_email, v_payload, v_target, v_key);
    exit when v_result ->> 'status' = 'ENQUEUED';
    if v_result ->> 'communication_status' in ('SCHEDULED', 'PROCESSING') then
      -- The active record already carries this key: refresh it in place.
      perform public.communications_update_content(
        p_business_id, (v_result ->> 'id')::uuid, v_email, v_payload, v_target);
      exit;
    end if;
    v_key := 'appointment:' || p_appointment_id || ':reminder:email:'
      || v_appointment.sync_version || '.' || (
        select count(*) from public.scheduled_communications
         where business_id = p_business_id
           and source_type = 'APPOINTMENT' and source_id = p_appointment_id
           and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
      ) || '.' || v_attempt;
  end loop;
end;
$$;

comment on function public.communications_reconcile_appointment(uuid, text) is
  'Communications Lot B: THE reconciliation of one appointment''s initial H-24 email reminder against the queue. Idempotent; server state only.';

revoke all on function public.communications_reconcile_appointment(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_reconcile_appointment(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Business-wide reconciliation + business-wide cancellation
-- ---------------------------------------------------------------------------
-- Reconcile every live upcoming appointment of a Business: used when the
-- global preference turns ON (eligible future appointments become
-- schedulable), and to refresh pending content after a business-name or
-- Reply-To change. A no-op while the preference is off.
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

revoke all on function public.communications_reconcile_business(uuid) from public, anon, authenticated;
grant execute on function public.communications_reconcile_business(uuid) to service_role;

-- Turning the global preference OFF cancels every still-pending appointment
-- communication of the Business (reminders AND queued rescheduled/cancelled
-- notices). SENT / FAILED history is never touched, and the operation is
-- idempotent. The before-write trigger allows both SCHEDULED → CANCELLED and
-- PROCESSING → CANCELLED; a record already claimed by the worker is re-checked
-- before dispatch, so the cancellation wins whenever it lands before dispatch.
create or replace function public.communications_cancel_business_appointment_pending(
  p_business_id uuid
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now()
   where business_id = p_business_id
     and source_type = 'APPOINTMENT'
     and status in ('SCHEDULED', 'PROCESSING');
end;
$$;

revoke all on function public.communications_cancel_business_appointment_pending(uuid) from public, anon, authenticated;
grant execute on function public.communications_cancel_business_appointment_pending(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Triggers — reconciliation runs where authoritative state changes
-- ---------------------------------------------------------------------------
-- 8a. Appointments. Every INSERT / UPDATE reconciles the initial reminder.
-- An UPDATE additionally mints the two POST-SEND events, which need OLD/NEW:
--
--   status → CANCELLED  after the reminder was SENT  → appointment_cancelled,
--                                                      immediately
--   start_at changed    after the reminder was SENT  → appointment_rescheduled,
--                                                      immediately (each saved
--                                                      change is a new revision
--                                                      key; a service-only
--                                                      change never is)
--
-- Both respect the CURRENT automation switches (global AND per-appointment)
-- and need a usable client email; neither fires for a tombstone. Child-row
-- writes (items/phases) reach this trigger through the parent-touch UPDATE,
-- with start_at and status unchanged: content refresh only, never an event.
create or replace function public.communications_on_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefs record;
  v_email text;
  v_sent boolean;
begin
  if tg_op = 'UPDATE'
     and new.deleted_at is null
     and (new.status is distinct from old.status or new.start_at is distinct from old.start_at)
  then
    select email_reminders_enabled into v_prefs
      from public.business_communication_preferences
     where business_id = new.business_id;

    if coalesce(v_prefs.email_reminders_enabled, false)
       and coalesce(new.client_reminder_enabled, true)
    then
      v_sent := exists (
        select 1 from public.scheduled_communications
         where business_id = new.business_id
           and source_type = 'APPOINTMENT' and source_id = new.id
           and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
           and status = 'SENT'
      );

      if v_sent then
        select btrim(c.email) into v_email
          from public.clients c
         where c.business_id = new.business_id and c.id = new.client_id
           and c.deleted_at is null
           and public.communications_is_valid_email(c.email);

        if v_email is not null then
          if new.status = 'CANCELLED' and old.status is distinct from new.status then
            perform public.communications_enqueue(
              new.business_id, 'APPOINTMENT', new.id,
              'APPOINTMENT_CANCELLED', 'EMAIL', v_email,
              public.communications_appointment_email_payload(new.business_id, new.id),
              now(),
              'appointment:' || new.id || ':cancelled:email:' || new.sync_version);
          elsif new.start_at is distinct from old.start_at
                and new.status in ('SCHEDULED', 'CONFIRMED')
                and new.start_at > now() then
            perform public.communications_enqueue(
              new.business_id, 'APPOINTMENT', new.id,
              'APPOINTMENT_RESCHEDULED', 'EMAIL', v_email,
              public.communications_appointment_email_payload(new.business_id, new.id),
              now(),
              'appointment:' || new.id || ':rescheduled:email:' || new.sync_version);
          end if;
        end if;
      end if;
    end if;
  end if;

  perform public.communications_reconcile_appointment(new.business_id, new.id);
  return null;
exception
  when others then
    -- A reminder problem must never fail an appointment write or a sync push.
    raise warning 'communications: appointment reconciliation skipped (%)', sqlstate;
    return null;
end;
$$;

revoke all on function public.communications_on_appointment_change() from public, anon, authenticated;

drop trigger if exists appointments_communications_reconcile on public.appointments;
create trigger appointments_communications_reconcile
  after insert or update on public.appointments
  for each row execute function public.communications_on_appointment_change();

-- 8b. Clients. A changed email, first name or tombstone reconciles the
-- client's live upcoming appointments: a corrected address updates the
-- pending recipient, a removed one cancels, one added before H-24 schedules,
-- a renamed client refreshes pending payloads. Skipped entirely while the
-- Business preference is off.
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
    raise warning 'communications: client reconciliation skipped (%)', sqlstate;
    return null;
end;
$$;

revoke all on function public.communications_on_client_change() from public, anon, authenticated;

drop trigger if exists clients_communications_reconcile on public.clients;
create trigger clients_communications_reconcile
  after update on public.clients
  for each row execute function public.communications_on_client_change();

-- 8c. The preference row. OFF → ON reconciles the whole Business (eligible
-- future appointments become schedulable); ON → OFF cancels every pending
-- appointment communication; a Reply-To change while ON refreshes pending
-- payloads through the same reconciliation.
create or replace function public.communications_on_preferences_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_reminders_enabled then
    perform public.communications_reconcile_business(new.business_id);
  elsif tg_op = 'UPDATE' and old.email_reminders_enabled then
    perform public.communications_cancel_business_appointment_pending(new.business_id);
  end if;
  return null;
exception
  when others then
    raise warning 'communications: preference reconciliation skipped (%)', sqlstate;
    return null;
end;
$$;

revoke all on function public.communications_on_preferences_change() from public, anon, authenticated;

drop trigger if exists business_communication_preferences_reconcile
  on public.business_communication_preferences;
create trigger business_communication_preferences_reconcile
  after insert or update on public.business_communication_preferences
  for each row execute function public.communications_on_preferences_change();

-- 8d. The Business display name appears in pending email payloads: a rename
-- refreshes them (content only, never a new communication).
create or replace function public.communications_on_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    perform public.communications_reconcile_business(new.id);
  end if;
  return null;
exception
  when others then
    raise warning 'communications: business reconciliation skipped (%)', sqlstate;
    return null;
end;
$$;

revoke all on function public.communications_on_business_change() from public, anon, authenticated;

drop trigger if exists businesses_communications_reconcile on public.businesses;
create trigger businesses_communications_reconcile
  after update on public.businesses
  for each row execute function public.communications_on_business_change();

-- ---------------------------------------------------------------------------
-- 9. Owner RPCs — the ONLY app surface of Lot B
-- ---------------------------------------------------------------------------
-- 9a. Read the preference. A Business that never touched the setting reads as
-- disabled with no Reply-To — no row is created by reading.
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

  select email_reminders_enabled, reply_to_email, updated_at
    into v_row
    from public.business_communication_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'email_reminders_enabled', coalesce(v_row.email_reminders_enabled, false),
    'reply_to_email', v_row.reply_to_email,
    'updated_at', case when v_row.updated_at is null then null
      else to_char(v_row.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  );
end;
$$;

comment on function public.communications_read_preferences(uuid) is
  'Communications Lot B: the owner''s reminder preference (disabled + no Reply-To when never configured). Owner-scoped; reading creates nothing.';

-- 9b. Update the preference. Enabling requires a valid Reply-To; the shape is
-- validated here (a stable INVALID_REPLY_TO answer, not a raw CHECK error) and
-- again by the table. The AFTER trigger performs the reconciliation:
-- enabling schedules eligible future appointments, disabling cancels every
-- pending appointment communication.
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

  return jsonb_build_object(
    'status', 'UPDATED',
    'email_reminders_enabled', p_email_reminders_enabled,
    'reply_to_email', v_reply_to
  );
end;
$$;

comment on function public.communications_update_preferences(uuid, boolean, text) is
  'Communications Lot B: the owner turns email reminders on/off and sets the Reply-To. Enabling requires a valid Reply-To. Reconciliation follows through the table trigger.';

-- 9c. The reminder status projection of ONE appointment — read-only, narrow.
-- Never the queue row: no payload, no recipient, no provider id, no error.
--
--   SENT           the initial reminder reached the provider (sent_at)
--   SCHEDULED      a reminder is pending (scheduled_for)
--   FAILED         every delivery attempt failed, terminally
--   DISABLED       automation is off (globally, or for this appointment)
--   MISSING_EMAIL  eligible except the client has no usable email
--   TOO_LATE       upcoming appointment, but H-24 had already passed
--   NONE           nothing applies (terminal appointment, past, unknown id)
create or replace function public.communications_appointment_reminder_status(
  p_business_id uuid,
  p_appointment_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_appointment record;
  v_record record;
  v_email_ok boolean;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;

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
     and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
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
  if not exists (
    select 1 from public.business_communication_preferences
     where business_id = p_business_id and email_reminders_enabled
  ) or not coalesce(v_appointment.client_reminder_enabled, true) then
    return jsonb_build_object('status', 'DISABLED');
  end if;
  if v_appointment.deleted_at is not null
     or v_appointment.status not in ('SCHEDULED', 'CONFIRMED')
     or v_appointment.start_at <= now() then
    return jsonb_build_object('status', 'NONE');
  end if;

  select public.communications_is_valid_email(c.email)
    into v_email_ok
    from public.clients c
   where c.business_id = p_business_id and c.id = v_appointment.client_id
     and c.deleted_at is null;
  if not coalesce(v_email_ok, false) then
    return jsonb_build_object('status', 'MISSING_EMAIL');
  end if;

  if v_appointment.start_at - interval '24 hours' < now() then
    return jsonb_build_object('status', 'TOO_LATE');
  end if;

  return jsonb_build_object('status', 'NONE');
end;
$$;

comment on function public.communications_appointment_reminder_status(uuid, text) is
  'Communications Lot B: narrow owner-scoped READ-ONLY projection of one appointment''s email reminder state. Never exposes queue internals.';

revoke all on function public.communications_read_preferences(uuid) from public, anon;
revoke all on function public.communications_update_preferences(uuid, boolean, text) from public, anon;
revoke all on function public.communications_appointment_reminder_status(uuid, text) from public, anon;
grant execute on function public.communications_read_preferences(uuid) to authenticated;
grant execute on function public.communications_update_preferences(uuid, boolean, text) to authenticated;
grant execute on function public.communications_appointment_reminder_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Push — the APPOINTMENT branch carries client_reminder_enabled
-- ---------------------------------------------------------------------------
-- Replaced IN PLACE (identical signature: EXECUTE grants, revokes and
-- comments are preserved). The body is the one of 20260926120000 with exactly
-- one difference: the APPOINTMENT insert/update reads and writes
-- `client_reminder_enabled`, keeping the stored value when the payload has no
-- such key (a build that predates the field never erases an explicit choice).
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
         archived_at, deleted_at)
      select p_business_id, p_aggregate_id,
             x.first_name, x.last_name, x.phone, x.email, x.birthday, x.notes, x.photo_path,
             x.archived_at, null
      from jsonb_to_record(p_payload) as x(
        first_name text, last_name text, phone text, email text, birthday text, notes text,
        photo_path text, archived_at timestamptz
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
-- 11. Pull — appointments[] objects carry client_reminder_enabled
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
