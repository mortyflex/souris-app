-- Souris — Communication Core (Lot A): server-owned scheduled communications
--
-- docs/architecture/COMMUNICATIONS.md. A generic, server-authoritative queue
-- of outbound communications (appointment reminder / rescheduled / cancelled,
-- inactive-client follow-up — over email or SMS). The mobile app is NEVER
-- responsible for waking up and sending: a scheduled server worker claims due
-- records and dispatches them through a transport boundary. In Lot A no real
-- transport exists (no provider SDK, no credential): a deployed worker uses a
-- fake transport that performs no network delivery.
--
-- This queue is deliberately OUTSIDE the aggregate sync engine
-- (CLOUD_SYNC.md): it is server infrastructure, not device-owned business
-- data. No aggregate type is added, no sync RPC changes, no SQLite table
-- exists for it, and it never appears in a business snapshot.
--
-- This migration is additive and non-destructive:
--
--   * ONE new table, `public.scheduled_communications`, server-owned:
--     RLS enabled with NO policy and NO grant to `anon` / `authenticated`
--     (the mobile app can neither read nor write it; `service_role` operates
--     it through its default privileges and BYPASSRLS);
--   * ONE trigger enforcing server-owned timestamps, pinned identity and the
--     legal status lifecycle;
--   * EIGHT `communications_*` functions — the ONLY intended mutation
--     surface: enqueue / cancel / reschedule / claim_due / read_status /
--     mark_sent / mark_retry / mark_failed. EXECUTE is granted to
--     `service_role` only;
--   * NO existing table, row, column, trigger, policy, grant or function is
--     touched. The sync engine cannot see this table and no device re-pulls
--     anything because of this migration.
--
-- Safe to re-run: `if not exists` / `drop … if exists` on this migration's
-- own objects only, `create or replace` for its own functions.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
-- One row = one logical outbound communication. `dedupe_key` is the stable
-- identity of the logical event (unique per Business): enqueueing the same
-- key twice can never create two sendable records.
--
-- Lifecycle (enforced by trigger + the functions below):
--
--   SCHEDULED ──► PROCESSING ──► SENT
--       │              │  └────► FAILED        (permanent, or retries exhausted)
--       │              └───────► SCHEDULED     (retry, next_attempt_at in the future)
--       └──────────────┴───────► CANCELLED
--
-- SENT / FAILED / CANCELLED are terminal. A future delivery status
-- (delivered / bounced) would extend the vocabulary and the transition table
-- additively; provider-specific statuses never become the domain model.
create table if not exists public.scheduled_communications (
  id uuid primary key default gen_random_uuid(),
  -- CASCADE, unlike the RESTRICT of operational tables: queue records are
  -- server infrastructure, not user history, and must never become an extra
  -- obstacle to a legitimate Business deletion (which the operational rows
  -- already guard).
  business_id uuid not null references public.businesses (id) on delete cascade,

  -- Generic source: never a hard FK — a communication may outlive its source
  -- and new source kinds must not require a schema redesign. Vocabularies are
  -- CHECKed like every other Souris vocabulary; adding one is an additive
  -- constraint replacement, not a redesign.
  source_type text not null
    check (source_type in ('APPOINTMENT', 'CLIENT')),
  source_id text not null check (char_length(source_id) between 1 and 200),
  kind text not null
    check (kind in (
      'APPOINTMENT_REMINDER',
      'APPOINTMENT_RESCHEDULED',
      'APPOINTMENT_CANCELLED',
      'INACTIVE_CLIENT_FOLLOWUP'
    )),
  channel text not null check (channel in ('EMAIL', 'SMS')),

  -- Snapshot of the intended destination (an email address, later a phone
  -- number) and of the prepared content. The worker sends what is stored
  -- here; it never queries mobile UI state at send time. Business-private
  -- data: no policy exposes it, and workers must not log it. Never secrets.
  recipient text not null check (char_length(btrim(recipient)) between 1 and 320),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),

  -- Absolute instants, always server / database time. The future appointment
  -- layer converts its local semantics into `scheduled_for`; the device clock
  -- never decides what is due.
  scheduled_for timestamptz not null,
  next_attempt_at timestamptz not null,

  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),

  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,

  -- Observability, sanitized: a short transport/domain error message, never a
  -- credential, header or request dump.
  last_error text,
  provider_message_id text,

  dedupe_key text not null check (char_length(btrim(dedupe_key)) between 1 and 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint scheduled_communications_dedupe_unique unique (business_id, dedupe_key),
  constraint scheduled_communications_processing_started_check
    check (status <> 'PROCESSING' or processing_started_at is not null),
  constraint scheduled_communications_sent_at_check
    check (status <> 'SENT' or sent_at is not null),
  constraint scheduled_communications_failed_at_check
    check (status <> 'FAILED' or failed_at is not null),
  constraint scheduled_communications_cancelled_at_check
    check (status <> 'CANCELLED' or cancelled_at is not null)
);

comment on table public.scheduled_communications is
  'Communication Core: server-owned queue of outbound communications (email/SMS). Not part of the aggregate sync. No client access: service_role and the communications_* functions only.';
comment on column public.scheduled_communications.dedupe_key is
  'Stable identity of the logical communication event, unique per Business. Enqueue is idempotent on it.';
comment on column public.scheduled_communications.next_attempt_at is
  'When the worker may (re)attempt this record. Equal to scheduled_for at enqueue; pushed forward by retries.';

-- The worker's two claim paths, and the reschedule/reconcile lookup.
create index if not exists scheduled_communications_due_idx
  on public.scheduled_communications (next_attempt_at)
  where status = 'SCHEDULED';
create index if not exists scheduled_communications_stale_idx
  on public.scheduled_communications (processing_started_at)
  where status = 'PROCESSING';
create index if not exists scheduled_communications_source_idx
  on public.scheduled_communications (business_id, source_type, source_id, kind, channel)
  where status in ('SCHEDULED', 'PROCESSING');

-- ---------------------------------------------------------------------------
-- 2. Server-owned writes: pinned identity + legal lifecycle transitions
-- ---------------------------------------------------------------------------
create or replace function public.communications_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Every record starts at the beginning of its lifecycle, on server time,
    -- whatever the insert claims.
    new.created_at := now();
    new.updated_at := now();
    new.status := 'SCHEDULED';
    new.attempt_count := 0;
    new.processing_started_at := null;
    new.sent_at := null;
    new.failed_at := null;
    new.cancelled_at := null;
    new.last_error := null;
    new.provider_message_id := null;
    new.next_attempt_at := coalesce(new.next_attempt_at, new.scheduled_for);
    return new;
  end if;

  -- The identity of the logical event never moves.
  new.id := old.id;
  new.business_id := old.business_id;
  new.dedupe_key := old.dedupe_key;
  new.source_type := old.source_type;
  new.source_id := old.source_id;
  new.kind := old.kind;
  new.channel := old.channel;
  new.created_at := old.created_at;

  -- Central lifecycle: terminal states (SENT / FAILED / CANCELLED) have no
  -- outgoing transition; cancelled → processing, sent → scheduled,
  -- failed → processing are impossible at the database level.
  if new.status is distinct from old.status then
    if not (
      (old.status = 'SCHEDULED' and new.status in ('PROCESSING', 'CANCELLED'))
      or (old.status = 'PROCESSING' and new.status in ('SENT', 'FAILED', 'SCHEDULED', 'CANCELLED'))
    ) then
      raise exception 'communications: illegal status transition % -> %',
        old.status, new.status using errcode = '22023';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.communications_before_write() is
  'Communication Core: server-owned timestamps, pinned identity and the legal status lifecycle of scheduled_communications.';

drop trigger if exists scheduled_communications_before_write on public.scheduled_communications;
create trigger scheduled_communications_before_write
  before insert or update on public.scheduled_communications
  for each row execute function public.communications_before_write();

-- ---------------------------------------------------------------------------
-- 3. RLS + grants — server-owned: NO client access at all
-- ---------------------------------------------------------------------------
-- RLS is enabled with NO policy: even if a grant ever reappeared,
-- `anon` / `authenticated` would see zero rows. The revoke removes Supabase's
-- default table privileges from both roles; `service_role` keeps its defaults
-- and BYPASSRLS. A future lot that wants the app to read a safe projection of
-- reminder status will add an explicit, owner-scoped read surface — nothing
-- is exposed prematurely here.
alter table public.scheduled_communications enable row level security;

revoke all on table public.scheduled_communications from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Enqueue — idempotent on (business_id, dedupe_key)
-- ---------------------------------------------------------------------------
-- Result, as jsonb:
--
--   { "status": "ENQUEUED",         "id": …, "communication_status": "SCHEDULED" }
--   { "status": "ALREADY_ENQUEUED", "id": …, "communication_status": … }
--
-- ALREADY_ENQUEUED returns the existing record whatever its lifecycle state:
-- a dedupe key that was sent, failed or cancelled is a logical event that
-- already happened — it is never re-created. A genuinely new logical event
-- (e.g. a reminder after a reschedule) carries a NEW dedupe key (a revision
-- inside the key), which is the caller's contract, not a UI concern.
create or replace function public.communications_enqueue(
  p_business_id uuid,
  p_source_type text,
  p_source_id text,
  p_kind text,
  p_channel text,
  p_recipient text,
  p_payload jsonb,
  p_scheduled_for timestamptz,
  p_dedupe_key text
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_row public.scheduled_communications%rowtype;
begin
  if p_business_id is null then
    raise exception 'communications: business id is required' using errcode = '22023';
  end if;
  if p_scheduled_for is null then
    raise exception 'communications: scheduled_for is required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'communications: payload must be a json object' using errcode = '22023';
  end if;
  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) = 0 then
    raise exception 'communications: dedupe key is required' using errcode = '22023';
  end if;
  -- Vocabulary, recipient and length rules are enforced by the table CHECKs.

  insert into public.scheduled_communications
    (business_id, source_type, source_id, kind, channel,
     recipient, payload, scheduled_for, next_attempt_at, dedupe_key)
  values
    (p_business_id, p_source_type, p_source_id, p_kind, p_channel,
     btrim(p_recipient), p_payload, p_scheduled_for, p_scheduled_for, btrim(p_dedupe_key))
  on conflict (business_id, dedupe_key) do nothing
  returning * into v_row;

  if v_row.id is not null then
    return jsonb_build_object(
      'status', 'ENQUEUED',
      'id', v_row.id,
      'communication_status', v_row.status);
  end if;

  select * into v_row
    from public.scheduled_communications
   where business_id = p_business_id and dedupe_key = btrim(p_dedupe_key);

  return jsonb_build_object(
    'status', 'ALREADY_ENQUEUED',
    'id', v_row.id,
    'communication_status', v_row.status);
end;
$$;

comment on function public.communications_enqueue(uuid, text, text, text, text, text, jsonb, timestamptz, text) is
  'Communication Core: idempotent enqueue of one logical communication. The same (business_id, dedupe_key) can never yield two sendable records.';

-- ---------------------------------------------------------------------------
-- 5. Cancel — idempotent; a cancelled record is never claimed
-- ---------------------------------------------------------------------------
-- Result, as jsonb:
--
--   { "status": "CANCELLED" }                        it was SCHEDULED or PROCESSING
--   { "status": "ALREADY_CANCELLED" }                cancel called again — safe
--   { "status": "IGNORED", "communication_status" }  terminal SENT / FAILED: history is not rewritten
--   { "status": "ABSENT" }                           no such record for this Business
--
-- Cancelling a PROCESSING record is allowed: the worker re-reads the status
-- immediately before dispatch and its mark_* functions only act on rows still
-- PROCESSING, so a cancellation that lands before dispatch wins. The tiny
-- remaining race (cancel between the worker's re-check and the transport
-- call) is recorded by mark_sent (DISPATCHED_BEFORE_CANCELLATION), never
-- hidden.
create or replace function public.communications_cancel(
  p_business_id uuid,
  p_id uuid
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_business_id is null or p_id is null then
    raise exception 'communications: business id and communication id are required' using errcode = '22023';
  end if;

  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now()
   where id = p_id
     and business_id = p_business_id
     and status in ('SCHEDULED', 'PROCESSING');
  if found then
    return jsonb_build_object('status', 'CANCELLED');
  end if;

  select status into v_status
    from public.scheduled_communications
   where id = p_id and business_id = p_business_id;
  if not found then
    return jsonb_build_object('status', 'ABSENT');
  end if;
  if v_status = 'CANCELLED' then
    return jsonb_build_object('status', 'ALREADY_CANCELLED');
  end if;
  return jsonb_build_object('status', 'IGNORED', 'communication_status', v_status);
end;
$$;

comment on function public.communications_cancel(uuid, uuid) is
  'Communication Core: idempotent cancellation. Cancelled work is never claimed; terminal records are left as history.';

-- ---------------------------------------------------------------------------
-- 6. Reschedule / reconcile — cancel the old, upsert the replacement
-- ---------------------------------------------------------------------------
-- The generic primitive future source integration uses when the logical event
-- changes (e.g. an appointment moves): active records (SCHEDULED /
-- PROCESSING) of the same (business_id, source_type, source_id, kind,
-- channel) whose dedupe key differs are cancelled, and the replacement is
-- enqueued idempotently. Calling it twice with the same arguments cancels
-- nothing the second time and never yields a duplicate active replacement.
--
-- Result: the enqueue result plus "cancelled_count".
create or replace function public.communications_reschedule(
  p_business_id uuid,
  p_source_type text,
  p_source_id text,
  p_kind text,
  p_channel text,
  p_recipient text,
  p_payload jsonb,
  p_scheduled_for timestamptz,
  p_dedupe_key text
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_cancelled integer;
  v_result jsonb;
begin
  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) = 0 then
    raise exception 'communications: dedupe key is required' using errcode = '22023';
  end if;

  update public.scheduled_communications
     set status = 'CANCELLED',
         cancelled_at = now()
   where business_id = p_business_id
     and source_type = p_source_type
     and source_id = p_source_id
     and kind = p_kind
     and channel = p_channel
     and dedupe_key <> btrim(p_dedupe_key)
     and status in ('SCHEDULED', 'PROCESSING');
  get diagnostics v_cancelled = row_count;

  v_result := public.communications_enqueue(
    p_business_id, p_source_type, p_source_id, p_kind, p_channel,
    p_recipient, p_payload, p_scheduled_for, p_dedupe_key);

  return v_result || jsonb_build_object('cancelled_count', v_cancelled);
end;
$$;

comment on function public.communications_reschedule(uuid, text, text, text, text, text, jsonb, timestamptz, text) is
  'Communication Core: reconcile one logical communication group — cancel active records with an older dedupe key, idempotently enqueue the replacement.';

-- ---------------------------------------------------------------------------
-- 7. Atomic claim of due work (bounded batch, SKIP LOCKED, stale-lease reclaim)
-- ---------------------------------------------------------------------------
-- Two concurrent worker invocations can never claim the same record:
-- `for update skip locked` makes the selection atomic, and the status guard
-- makes it correct across transactions. A PROCESSING record whose lease
-- (p_lease_seconds, default 600 = 10 minutes — comfortably above any worker
-- invocation, including future real transports) has expired is presumed
-- abandoned by a crashed worker and is claimable again; a fresh PROCESSING
-- record is never stolen. Claiming increments attempt_count.
create or replace function public.communications_claim_due(
  p_batch_size integer default 25,
  p_lease_seconds integer default 600
) returns setof public.scheduled_communications
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
    select sc.id
      from public.scheduled_communications sc
     where (sc.status = 'SCHEDULED' and sc.next_attempt_at <= now())
        or (sc.status = 'PROCESSING'
            and sc.processing_started_at <= now() - make_interval(secs => p_lease_seconds))
     order by sc.next_attempt_at
     limit p_batch_size
       for update skip locked
  )
  update public.scheduled_communications sc
     set status = 'PROCESSING',
         processing_started_at = now(),
         attempt_count = sc.attempt_count + 1
    from due
   where sc.id = due.id
  returning sc.*;
end;
$$;

comment on function public.communications_claim_due(integer, integer) is
  'Communication Core: atomically claim a bounded batch of due records (FOR UPDATE SKIP LOCKED), reclaiming stale PROCESSING leases. Server time only.';

-- ---------------------------------------------------------------------------
-- 8. Status read — the worker''s pre-dispatch re-check
-- ---------------------------------------------------------------------------
create or replace function public.communications_read_status(p_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select status from public.scheduled_communications where id = p_id;
$$;

comment on function public.communications_read_status(uuid) is
  'Communication Core: current lifecycle status of one record (null when absent). Used by the worker immediately before dispatch.';

-- ---------------------------------------------------------------------------
-- 9. Worker settlements — mark_sent / mark_retry / mark_failed
-- ---------------------------------------------------------------------------
-- All three act only on rows still PROCESSING; anything else is reported, not
-- mutated (the trigger would refuse an illegal transition anyway).
--
-- mark_sent results:
--   { "status": "SENT" }
--   { "status": "IGNORED_CANCELLED" }   cancelled between re-check and dispatch:
--                                       the record stays CANCELLED, but reality is
--                                       recorded (provider_message_id + last_error
--                                       DISPATCHED_BEFORE_CANCELLATION)
--   { "status": "IGNORED", "communication_status": … } / { "status": "ABSENT" }
create or replace function public.communications_mark_sent(
  p_id uuid,
  p_provider_message_id text default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_id is null then
    raise exception 'communications: communication id is required' using errcode = '22023';
  end if;

  update public.scheduled_communications
     set status = 'SENT',
         sent_at = now(),
         last_error = null,
         provider_message_id = left(p_provider_message_id, 200)
   where id = p_id and status = 'PROCESSING';
  if found then
    return jsonb_build_object('status', 'SENT');
  end if;

  select status into v_status
    from public.scheduled_communications where id = p_id;
  if not found then
    return jsonb_build_object('status', 'ABSENT');
  end if;
  if v_status = 'CANCELLED' then
    update public.scheduled_communications
       set provider_message_id = coalesce(left(p_provider_message_id, 200), provider_message_id),
           last_error = 'DISPATCHED_BEFORE_CANCELLATION'
     where id = p_id;
    return jsonb_build_object('status', 'IGNORED_CANCELLED');
  end if;
  return jsonb_build_object('status', 'IGNORED', 'communication_status', v_status);
end;
$$;

comment on function public.communications_mark_sent(uuid, text) is
  'Communication Core: settle one PROCESSING record as SENT. A record cancelled meanwhile stays CANCELLED; the dispatch is recorded, never hidden.';

-- mark_retry: back to SCHEDULED with next_attempt_at pushed forward on SERVER
-- time (the worker sends a delay, never an instant, so no worker clock ever
-- decides when a record is due). Results: RETRY_SCHEDULED / IGNORED_CANCELLED
-- / IGNORED / ABSENT.
create or replace function public.communications_mark_retry(
  p_id uuid,
  p_error text,
  p_retry_delay_seconds integer
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_id is null then
    raise exception 'communications: communication id is required' using errcode = '22023';
  end if;
  if p_retry_delay_seconds is null
     or p_retry_delay_seconds < 0
     or p_retry_delay_seconds > 604800 then
    raise exception 'communications: retry delay must be between 0 and 604800 seconds' using errcode = '22023';
  end if;

  update public.scheduled_communications
     set status = 'SCHEDULED',
         processing_started_at = null,
         next_attempt_at = now() + make_interval(secs => p_retry_delay_seconds),
         last_error = left(coalesce(p_error, 'unknown transport error'), 2000)
   where id = p_id and status = 'PROCESSING';
  if found then
    return jsonb_build_object('status', 'RETRY_SCHEDULED');
  end if;

  select status into v_status
    from public.scheduled_communications where id = p_id;
  if not found then
    return jsonb_build_object('status', 'ABSENT');
  end if;
  if v_status = 'CANCELLED' then
    return jsonb_build_object('status', 'IGNORED_CANCELLED');
  end if;
  return jsonb_build_object('status', 'IGNORED', 'communication_status', v_status);
end;
$$;

comment on function public.communications_mark_retry(uuid, text, integer) is
  'Communication Core: schedule a retry of one PROCESSING record. The delay is applied to database time; the retry policy itself lives in the worker, centralized.';

-- mark_failed: terminal FAILED (permanent transport failure, or the retry
-- policy is exhausted). Results: FAILED / IGNORED_CANCELLED / IGNORED /
-- ABSENT. A manual retry-after-failure would be an explicit future operation.
create or replace function public.communications_mark_failed(
  p_id uuid,
  p_error text
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_id is null then
    raise exception 'communications: communication id is required' using errcode = '22023';
  end if;

  update public.scheduled_communications
     set status = 'FAILED',
         failed_at = now(),
         last_error = left(coalesce(p_error, 'unknown transport error'), 2000)
   where id = p_id and status = 'PROCESSING';
  if found then
    return jsonb_build_object('status', 'FAILED');
  end if;

  select status into v_status
    from public.scheduled_communications where id = p_id;
  if not found then
    return jsonb_build_object('status', 'ABSENT');
  end if;
  if v_status = 'CANCELLED' then
    return jsonb_build_object('status', 'IGNORED_CANCELLED');
  end if;
  return jsonb_build_object('status', 'IGNORED', 'communication_status', v_status);
end;
$$;

comment on function public.communications_mark_failed(uuid, text) is
  'Communication Core: settle one PROCESSING record as terminally FAILED, with a sanitized error message.';

-- ---------------------------------------------------------------------------
-- 10. Function grants — service_role only
-- ---------------------------------------------------------------------------
-- The queue has no authenticated mutation or read path: every function is
-- callable by the server worker / future server integrations only. Postgres
-- grants EXECUTE to PUBLIC on new functions by default: revoke first.
revoke all on function public.communications_before_write() from public, anon, authenticated;
revoke all on function public.communications_enqueue(uuid, text, text, text, text, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function public.communications_cancel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.communications_reschedule(uuid, text, text, text, text, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function public.communications_claim_due(integer, integer) from public, anon, authenticated;
revoke all on function public.communications_read_status(uuid) from public, anon, authenticated;
revoke all on function public.communications_mark_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.communications_mark_retry(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.communications_mark_failed(uuid, text) from public, anon, authenticated;

grant execute on function public.communications_enqueue(uuid, text, text, text, text, text, jsonb, timestamptz, text) to service_role;
grant execute on function public.communications_cancel(uuid, uuid) to service_role;
grant execute on function public.communications_reschedule(uuid, text, text, text, text, text, jsonb, timestamptz, text) to service_role;
grant execute on function public.communications_claim_due(integer, integer) to service_role;
grant execute on function public.communications_read_status(uuid) to service_role;
grant execute on function public.communications_mark_sent(uuid, text) to service_role;
grant execute on function public.communications_mark_retry(uuid, text, integer) to service_role;
grant execute on function public.communications_mark_failed(uuid, text) to service_role;
