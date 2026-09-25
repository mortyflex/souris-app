-- Souris — Communications Lot B hardening: durable reconciliation retry +
-- temporal guards on post-send emails
--
-- docs/architecture/COMMUNICATIONS.md §14b, §16. Two reliability fixes, no
-- product change:
--
-- 1. DURABLE RECONCILIATION RETRY. The Lot B triggers swallow their own
--    errors so a reminder bug can never fail an appointment save or a sync
--    push — that stays. But a swallowed error used to leave NO durable trace:
--    the reminder could be silently lost forever. Now every swallowed
--    reconciliation failure records ONE coalesced retry job in
--    `communication_reconciliation_jobs` (server-only, no mobile access, no
--    sync involvement), and the EXISTING communications worker retries the
--    SAME authoritative reconciliation functions later. The job carries only
--    the reconciliation TARGET — never email content, never a recipient:
--    `scheduled_communications` remains the one communication queue, and a
--    retry always reconciles the CURRENT authoritative state (stale data
--    cannot win because none is stored).
--
-- 2. POST-SEND EVENTS DERIVED FROM STATE, WITH TEMPORAL GUARDS. The
--    APPOINTMENT_RESCHEDULED / APPOINTMENT_CANCELLED minting no longer needs
--    the trigger's OLD row: `communications_reconcile_appointment_events`
--    derives "what the client was last told" from the queue itself (the SENT
--    reminder's H-24 + the latest live rescheduled notice), so a RETRY can
--    mint an event the failed trigger lost. The same rewrite adds the
--    temporal guards:
--      * a modification email only for a genuinely upcoming NEW occurrence
--        (start_at > now(), attendable status);
--      * a cancellation email only when the occurrence was still upcoming
--        when the cancellation was recorded (start_at > cancelled_at);
--    so a historical data correction can never email a client. Server time
--    only; the mobile clock never participates.
--
-- Applying this migration alone still sends NOTHING and enqueues NOTHING:
-- it creates an empty retry table, replaces the trigger functions in place,
-- and adds service_role-only worker RPCs. No row is rewritten, no
-- sync_version moves, no device re-pulls anything, and the OFF-by-default
-- preference model is untouched.
--
-- Safe to re-run: `create table if not exists`, `create or replace`,
-- `drop trigger if exists` on this migration's own objects only.

-- ---------------------------------------------------------------------------
-- 1. The retry table — one coalesced job per reconciliation target
-- ---------------------------------------------------------------------------
-- scope APPOINTMENT + source_id      re-run one appointment (events + reminder)
-- scope BUSINESS   + source_id ''    re-run the whole Business (preference
--                                    flips, client changes, business rename)
--
-- UNIQUE (business_id, scope_type, source_id): repeated failures for the same
-- target COALESCE into one row — a new authoritative change resets attempts
-- and makes it due at once (the latest state is what a retry reconciles).
-- `next_attempt_at` doubles as the processing lease (claiming pushes it
-- forward), and 'infinity' parks an exhausted job as a durable, inspectable
-- trace that the next change of the same target automatically revives.
create table if not exists public.communication_reconciliation_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  scope_type text not null check (scope_type in ('APPOINTMENT', 'BUSINESS')),
  source_id text not null default '' check (char_length(source_id) <= 200),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  -- Sanitized: an SQLSTATE and a scrubbed message. Never a recipient, a
  -- payload or a credential (emails are redacted at record time).
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_reconciliation_jobs_target_unique
    unique (business_id, scope_type, source_id),
  constraint communication_reconciliation_jobs_scope_source
    check ((scope_type = 'APPOINTMENT') = (source_id <> ''))
);

comment on table public.communication_reconciliation_jobs is
  'Communications Lot B: durable retry of a FAILED trigger reconciliation. Carries the target only — never email content. Server-owned: no client access, no sync involvement.';

create index if not exists communication_reconciliation_jobs_due_idx
  on public.communication_reconciliation_jobs (next_attempt_at);

alter table public.communication_reconciliation_jobs enable row level security;
revoke all on table public.communication_reconciliation_jobs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recording a failed reconciliation (called from the trigger handlers)
-- ---------------------------------------------------------------------------
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
    left(regexp_replace(coalesce(p_error, 'unknown reconciliation error'),
         '[^[:space:]]+@[^[:space:]]+', '[email]', 'g'), 300)
  )
  on conflict (business_id, scope_type, source_id) do update set
    -- A NEW authoritative change: fresh attempts, due at once. This also
    -- revives a parked ('infinity') job.
    attempt_count = 0,
    next_attempt_at = now(),
    last_error = excluded.last_error,
    updated_at = now();
exception
  when others then
    -- Last resort: recording must never re-fail the caller's handler.
    raise warning 'communications: could not record reconciliation retry (%)', sqlstate;
end;
$$;

comment on function public.communications_record_reconciliation_retry(uuid, text, text, text) is
  'Communications Lot B: coalesced durable trace of one failed trigger reconciliation. Sanitized error only; never fails the caller.';

revoke all on function public.communications_record_reconciliation_retry(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.communications_record_reconciliation_retry(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Post-send events, derived from CURRENT state (temporal guards included)
-- ---------------------------------------------------------------------------
-- What the client was last told about this appointment is read from the queue
-- itself: the latest live APPOINTMENT_RESCHEDULED notice, else the SENT
-- reminder's H-24 + 24 h. Deriving from state (instead of the trigger's
-- OLD/NEW) makes the function idempotent AND runnable by a retry:
--
--   status CANCELLED                       → one cancellation notice per
--     and start_at > cancelled_at            appointment (fixed dedupe key:
--     and none was ever created              a cancellation is a once-ever
--                                            event), ONLY when the occurrence
--                                            was still upcoming when the
--                                            cancellation was recorded — a
--                                            historical correction never
--                                            emails a client
--
--   status SCHEDULED/CONFIRMED             → one modification notice per
--     and start_at > now()                   genuinely saved date/time change
--     and start_at ≠ last communicated       (revision dedupe key), ONLY for
--                                            an upcoming NEW occurrence
--
-- Both require: a SENT initial reminder, automation currently on (both
-- switches) and a usable client email — exactly the Lot B rules. Service-only
-- changes and NO_SHOW never match anything here.
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
  v_sent record;
  v_last_known timestamptz;
begin
  select a.id, a.client_id, a.start_at, a.status, a.client_reminder_enabled,
         a.sync_version, a.deleted_at, a.cancelled_at
    into v_appointment
    from public.appointments a
   where a.business_id = p_business_id and a.id = p_appointment_id;
  if v_appointment.id is null or v_appointment.deleted_at is not null then
    return;
  end if;

  select email_reminders_enabled into v_prefs
    from public.business_communication_preferences
   where business_id = p_business_id;
  if not coalesce(v_prefs.email_reminders_enabled, false)
     or not coalesce(v_appointment.client_reminder_enabled, true) then
    return;
  end if;

  select id, scheduled_for
    into v_sent
    from public.scheduled_communications
   where business_id = p_business_id
     and source_type = 'APPOINTMENT' and source_id = p_appointment_id
     and kind = 'APPOINTMENT_REMINDER' and channel = 'EMAIL'
     and status = 'SENT'
   order by sent_at desc
   limit 1;
  if v_sent.id is null then
    return;
  end if;

  select btrim(c.email)
    into v_email
    from public.clients c
   where c.business_id = p_business_id
     and c.id = v_appointment.client_id
     and c.deleted_at is null
     and public.communications_is_valid_email(c.email);
  if v_email is null then
    return;
  end if;

  if v_appointment.status = 'CANCELLED' then
    -- Temporal guard: the occurrence must have been upcoming when the
    -- cancellation was recorded. A missing cancelled_at (SQL-corrected data)
    -- falls back to server now().
    if v_appointment.start_at > coalesce(v_appointment.cancelled_at, now()) then
      perform public.communications_enqueue(
        p_business_id, 'APPOINTMENT', p_appointment_id,
        'APPOINTMENT_CANCELLED', 'EMAIL', v_email,
        public.communications_appointment_email_payload(p_business_id, p_appointment_id),
        now(),
        -- A cancellation is a once-ever event of the appointment: the fixed
        -- key makes concurrent minting (live trigger + retry) race-safe.
        'appointment:' || p_appointment_id || ':cancelled:email');
    end if;
    return;
  end if;

  -- Temporal guard: only a genuinely upcoming, attendable NEW occurrence.
  if v_appointment.status in ('SCHEDULED', 'CONFIRMED') and v_appointment.start_at > now() then
    select (r.payload ->> 'appointment_start_at')::timestamptz
      into v_last_known
      from public.scheduled_communications r
     where r.business_id = p_business_id
       and r.source_type = 'APPOINTMENT' and r.source_id = p_appointment_id
       and r.kind = 'APPOINTMENT_RESCHEDULED' and r.channel = 'EMAIL'
       and r.status in ('SCHEDULED', 'PROCESSING', 'SENT')
     order by r.created_at desc
     limit 1;
    if v_last_known is null then
      v_last_known := v_sent.scheduled_for + interval '24 hours';
    end if;
    if date_trunc('milliseconds', v_appointment.start_at)
       is distinct from date_trunc('milliseconds', v_last_known) then
      perform public.communications_enqueue(
        p_business_id, 'APPOINTMENT', p_appointment_id,
        'APPOINTMENT_RESCHEDULED', 'EMAIL', v_email,
        public.communications_appointment_email_payload(p_business_id, p_appointment_id),
        now(),
        'appointment:' || p_appointment_id || ':rescheduled:email:' || v_appointment.sync_version);
    end if;
  end if;
end;
$$;

comment on function public.communications_reconcile_appointment_events(uuid, text) is
  'Communications Lot B: post-send rescheduled/cancelled notices derived from CURRENT state, with temporal guards (upcoming occurrences only). Idempotent; retry-safe.';

revoke all on function public.communications_reconcile_appointment_events(uuid, text) from public, anon, authenticated;
grant execute on function public.communications_reconcile_appointment_events(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The trigger functions, replaced in place: record what they swallow
-- ---------------------------------------------------------------------------
create or replace function public.communications_on_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.status is distinct from old.status or new.start_at is distinct from old.start_at)
  then
    perform public.communications_reconcile_appointment_events(new.business_id, new.id);
  end if;

  perform public.communications_reconcile_appointment(new.business_id, new.id);
  return null;
exception
  when others then
    -- The appointment write must succeed — but the failure is DURABLE now:
    -- the worker re-runs this appointment's reconciliation later.
    raise warning 'communications: appointment reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.business_id, 'APPOINTMENT', new.id, sqlerrm);
    return null;
end;
$$;

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
    raise warning 'communications: client reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.business_id, 'BUSINESS', '', sqlerrm);
    return null;
end;
$$;

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
    raise warning 'communications: preference reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.business_id, 'BUSINESS', '', sqlerrm);
    return null;
end;
$$;

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
    raise warning 'communications: business reconciliation deferred (%)', sqlstate;
    perform public.communications_record_reconciliation_retry(
      new.id, 'BUSINESS', '', sqlerrm);
    return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The retry executor — the ONE entry the worker re-runs
-- ---------------------------------------------------------------------------
-- Runs the SAME authoritative reconciliation the triggers run, from the
-- CURRENT state (a stale retry cannot exist: the job stores no state):
--
--   APPOINTMENT  →  post-send events + the initial-reminder reconciliation
--   BUSINESS     →  the preference-aware whole-Business pass: reconcile every
--                   live upcoming appointment while enabled, cancel every
--                   pending appointment communication while disabled
--
-- It RAISES on failure — the worker decides retry/park under the central
-- bounded policy. The reminder business rules stay in the database; the
-- worker never re-implements them.
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
      perform public.communications_cancel_business_appointment_pending(p_business_id);
    end if;
  else
    raise exception 'communications: unknown reconciliation scope' using errcode = '22023';
  end if;
end;
$$;

comment on function public.communications_run_reconciliation(uuid, text, text) is
  'Communications Lot B: re-run the authoritative reconciliation for one retry target, from CURRENT state. Raises on failure; the worker applies the bounded policy.';

-- ---------------------------------------------------------------------------
-- 6. Claim / settle — same concurrency quality as the Lot A queue
-- ---------------------------------------------------------------------------
-- No separate PROCESSING status: claiming atomically (FOR UPDATE SKIP LOCKED)
-- pushes `next_attempt_at` forward by the lease and bumps `attempt_count`, so
-- two overlapping workers can never take the same job, a crashed worker's
-- claim simply expires with the lease, and a job is never left permanently
-- claimable. Settlements are CONDITIONAL on the `updated_at` observed at
-- claim time: a job coalesced by a NEWER failure while it was being processed
-- is left alone (already due again, attempts reset) instead of being deleted
-- or backed off.
create or replace function public.communications_claim_reconciliation_jobs(
  p_batch_size integer default 10,
  p_lease_seconds integer default 600
) returns setof public.communication_reconciliation_jobs
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'communications: batch size must be between 1 and 100' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 60 then
    raise exception 'communications: lease must be at least 60 seconds' using errcode = '22023';
  end if;

  return query
  with due as (
    select j.id
      from public.communication_reconciliation_jobs j
     where j.next_attempt_at <= now()
     order by j.next_attempt_at
     limit p_batch_size
       for update skip locked
  )
  update public.communication_reconciliation_jobs j
     set attempt_count = j.attempt_count + 1,
         next_attempt_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

comment on function public.communications_claim_reconciliation_jobs(integer, integer) is
  'Communications Lot B: atomically claim due reconciliation retries (FOR UPDATE SKIP LOCKED); the pushed-forward next_attempt_at is the lease. Server time only.';

-- Success: the job is removed — unless a newer failure coalesced meanwhile.
create or replace function public.communications_complete_reconciliation_job(
  p_id uuid,
  p_claimed_updated_at timestamptz
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
  delete from public.communication_reconciliation_jobs
   where id = p_id and updated_at = p_claimed_updated_at;
  if found then
    return jsonb_build_object('status', 'COMPLETED');
  end if;
  if exists (select 1 from public.communication_reconciliation_jobs where id = p_id) then
    return jsonb_build_object('status', 'SUPERSEDED');
  end if;
  return jsonb_build_object('status', 'ABSENT');
end;
$$;

-- Failure: back off (delay in seconds) or PARK (NULL delay → 'infinity') as a
-- durable trace. Both are conditional on the claim: a coalesced newer failure
-- keeps its own fresh schedule.
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
         last_error = left(regexp_replace(coalesce(p_error, 'unknown reconciliation error'),
           '[^[:space:]]+@[^[:space:]]+', '[email]', 'g'), 300),
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
-- 7. Grants — worker RPCs are service_role only, like the Lot A surface
-- ---------------------------------------------------------------------------
revoke all on function public.communications_run_reconciliation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.communications_claim_reconciliation_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.communications_complete_reconciliation_job(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.communications_fail_reconciliation_job(uuid, timestamptz, text, integer) from public, anon, authenticated;

grant execute on function public.communications_run_reconciliation(uuid, text, text) to service_role;
grant execute on function public.communications_claim_reconciliation_jobs(integer, integer) to service_role;
grant execute on function public.communications_complete_reconciliation_job(uuid, timestamptz) to service_role;
grant execute on function public.communications_fail_reconciliation_job(uuid, timestamptz, text, integer) to service_role;
