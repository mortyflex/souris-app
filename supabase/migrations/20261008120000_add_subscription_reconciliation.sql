-- BeautIzzy — BeautIzzy Plus Phase 6.5C, step 6: RevenueCat reconciliation
-- runs — the server-side bookkeeping of the periodic re-verification sweep
-- and of the operator backfill
--
-- docs/architecture/SUBSCRIPTIONS.md §13. The entitlement mirror of Phase
-- 6.5A is fed by the RevenueCat webhook, and reconciled with RevenueCat's
-- REST API after each event. That leaves two gaps the webhook cannot close:
-- an account whose purchase history PREDATES the webhook (nothing is ever
-- delivered about it until its next event), and an event RevenueCat never
-- delivered (a missed webhook). The `subscription-reconciliation` Edge
-- Function closes both: it re-reads the subscriber state of a bounded batch
-- of accounts from the REST API and applies it through THE SAME function the
-- webhook's reconciliation uses, `subscription_apply_reconciliation` — one
-- product at a time, never expiring a row the answer does not describe,
-- never overwriting a row confirmed later. No second interpretation of a
-- subscription exists here: this migration holds NO access rule, reads no
-- store, no status and no end. `subscription_has_plus_access` stays THE rule.
--
-- What this migration adds is bookkeeping, so that the sweep and the
-- backfill are safe to run, to repeat and to resume:
--
--   subscription_reconciliation_state   one row per account the function
--                                       has ever claimed: a short LEASE (no
--                                       two passes reconcile the same account
--                                       at once), the last attempt and the
--                                       last success, the last outcome and a
--                                       bounded failure backoff;
--   subscription_reconciliation_runs    one row per pass (a sweep or a
--                                       backfill batch, dry-run or apply):
--                                       its scope, its counts per outcome,
--                                       the number of RevenueCat requests,
--                                       a bounded per-account report, the
--                                       continuation cursor and the error
--                                       that stopped it, if any.
--
-- Three functions carry a pass, EXECUTE granted to `service_role` only — the
-- role the Edge Function's privileged client resolves to — and SECURITY
-- DEFINER because the server role holds no privilege on auth.users,
-- businesses or the mirror (20260929120000 learned the project confers none):
--
--   subscription_reconciliation_claim    selects a bounded batch (at most 50)
--                                        from a scope the operator names — an
--                                        explicit list of users, every user
--                                        with a mirrored row, or every
--                                        Business owner —, skips accounts
--                                        another pass holds, accounts
--                                        reconciled recently and accounts in
--                                        failure backoff, opens the run row
--                                        and, in APPLY mode only, leases the
--                                        batch. A DRY_RUN leases nothing and
--                                        changes no account state;
--   subscription_reconciliation_settle   records ONE account's outcome on the
--                                        run and, in APPLY mode, on its state
--                                        row (lease released, failures and
--                                        backoff maintained);
--   subscription_reconciliation_finish   closes the run and releases every
--                                        lease it still holds, so a pass that
--                                        stopped early (a rate limit, an
--                                        unauthorized key) blocks nothing.
--
-- Neither table is reachable by the API roles or by the server role: RLS on,
-- zero policies, zero table grants. Nothing here touches a customer, an
-- appointment, a communication, a sync RPC, a policy, a switch or an
-- existing mirror row. NO schedule is created: the sweep stays unscheduled
-- until an operator creates the pg_cron job by hand (supabase/README.md).
--
-- Additive and non-destructive: two NEW server-owned tables, NEW functions,
-- no existing object replaced. Safe to re-run (`if not exists`,
-- `create or replace`).

-- ---------------------------------------------------------------------------
-- 1. The per-account state: lease, last attempt, last success, backoff
-- ---------------------------------------------------------------------------
-- last_outcome
--   APPLIED         at least one mirrored row was rewritten from the answer
--   CONFIRMED       the answer agreed with the mirror: rows re-verified only
--   STALE           every described row had been confirmed later: nothing written
--   NO_SUBSCRIBER   RevenueCat held no customer for this account (the read
--                   created an EMPTY one — the v1 API creates on read) and
--                   the mirror holds no source in force: nothing written
--   NO_SOURCES      the customer exists but grants nothing, and the mirror
--                   holds no source in force: nothing written
--   INVESTIGATE     the answer and the mirror disagree in a way no rule
--                   applies by itself (a mirrored source in force the answer
--                   does not list, a customer or sources absent beside such a
--                   source, a subscriber shared with another account): what
--                   the answer DOES describe was applied, the rest was left
--                   exactly as it was, and an operator must look
--   FAILED          a temporary failure (RevenueCat unreachable, rate limited,
--                   malformed answer, database error): nothing written;
--                   retried after a bounded backoff
create table if not exists public.subscription_reconciliation_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Held by the pass that claimed the account; free once NULL or past.
  lease_until timestamptz,
  lease_run_id uuid,
  last_attempted_at timestamptz,
  -- The last time RevenueCat answered for this account (whatever the outcome but FAILED).
  last_succeeded_at timestamptz,
  last_outcome text check (last_outcome is null or last_outcome in
    ('APPLIED', 'CONFIRMED', 'STALE', 'NO_SUBSCRIBER', 'NO_SOURCES', 'INVESTIGATE', 'FAILED')),
  -- A sanitized vocabulary, never a payload, never a key.
  last_detail text check (last_detail is null or char_length(last_detail) <= 400),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  -- Set after a FAILED outcome: the account is not selected before it.
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_reconciliation_state is
  'BeautIzzy Plus 6.5C: per-account bookkeeping of the RevenueCat reconciliation sweep / backfill (lease, last attempt, last outcome, failure backoff). Server-only; written by the subscription_reconciliation_* functions (service_role).';

create index if not exists subscription_reconciliation_state_sweep_idx
  on public.subscription_reconciliation_state (last_attempted_at);

-- ---------------------------------------------------------------------------
-- 2. The runs: one row per pass, with its counts and its bounded report
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('SWEEP', 'BACKFILL')),
  mode text not null check (mode in ('DRY_RUN', 'APPLY')),
  -- The scope as given: {"users": [...]}, {"source": "mirrored"} or {"source": "businesses"}.
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  status text not null default 'RUNNING'
    check (status in ('RUNNING', 'COMPLETED', 'STOPPED', 'FAILED', 'ABANDONED')),
  selected integer not null default 0 check (selected >= 0),
  -- {"APPLIED": n, "CONFIRMED": n, …}
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  -- RevenueCat requests made by this pass (attempts, retries included).
  requests integer not null default 0 check (requests >= 0),
  -- [{"user_id": …, "outcome": …, "detail": …}, …] — bounded to the batch.
  report jsonb not null default '[]'::jsonb check (jsonb_typeof(report) = 'array'),
  -- The last user id of the batch when more remain (ordered scopes); NULL otherwise.
  cursor_user_id uuid,
  last_error text check (last_error is null or char_length(last_error) <= 400),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.subscription_reconciliation_runs is
  'BeautIzzy Plus 6.5C: one row per RevenueCat reconciliation pass (sweep or backfill, dry-run or apply): scope, counts per outcome, requests, bounded report, continuation cursor. Server-only; written by the subscription_reconciliation_* functions (service_role).';

create index if not exists subscription_reconciliation_runs_started_idx
  on public.subscription_reconciliation_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- 3. Access model: nobody reads or writes the two tables directly
-- ---------------------------------------------------------------------------
alter table public.subscription_reconciliation_state enable row level security;
alter table public.subscription_reconciliation_runs enable row level security;
revoke all on table public.subscription_reconciliation_state from public, anon, authenticated, service_role;
revoke all on table public.subscription_reconciliation_runs from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Claim a bounded batch
-- ---------------------------------------------------------------------------
-- p_kind     SWEEP | BACKFILL      a SWEEP orders the least recently attempted
--                                  accounts first (rotation); a BACKFILL orders
--                                  by user id and continues from `p_after`
-- p_mode     DRY_RUN | APPLY       a DRY_RUN leases nothing and writes no state
-- p_scope    {"users": [uuid, …]}  an explicit list (unknown ids are reported,
--                                  never invented; backoff is ignored: the
--                                  operator asked for THESE accounts now)
--            {"source": "mirrored"}   every user with at least one mirrored row
--            {"source": "businesses"} every Business owner
-- p_limit    1..50 (clamped)       the batch size — the bound on API requests
-- p_after    uuid | null           continuation cursor of an ordered scope
-- p_min_age_seconds                skip accounts RevenueCat answered for less
--                                  than this long ago (bounded API usage)
-- p_lease_seconds                  60..3600 (clamped); the lease of APPLY mode
--
-- Result, as jsonb:
--
--   { "run_id": uuid,
--     "users": [ { "user_id", "business_id", "app_user_ids": [text…],
--                  "mirror_rows": n, "plus_access": bool }, … ],
--     "unknown_users": [text…],
--     "skipped": { "leased": n, "recent": n, "backoff": n },
--     "eligible": n, "next_cursor": uuid|null }
create or replace function public.subscription_reconciliation_claim(
  p_kind text,
  p_mode text,
  p_scope jsonb,
  p_limit integer default 20,
  p_after uuid default null,
  p_min_age_seconds integer default 0,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_lease integer;
  v_min_age interval;
  v_explicit boolean := false;
  v_candidates uuid[] := '{}'::uuid[];
  v_unknown text[] := '{}'::text[];
  v_text text;
  v_selected uuid[];
  v_eligible integer;
  v_skipped_leased integer;
  v_skipped_recent integer;
  v_skipped_backoff integer;
  v_run_id uuid;
  v_users jsonb;
  v_cursor uuid;
begin
  if p_kind is null or p_kind not in ('SWEEP', 'BACKFILL') then
    raise exception 'subscription reconciliation: kind must be SWEEP or BACKFILL' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('DRY_RUN', 'APPLY') then
    raise exception 'subscription reconciliation: mode must be DRY_RUN or APPLY' using errcode = '22023';
  end if;
  if p_scope is null or jsonb_typeof(p_scope) <> 'object' then
    raise exception 'subscription reconciliation: scope must be a json object' using errcode = '22023';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_lease := least(greatest(coalesce(p_lease_seconds, 300), 60), 3600);
  v_min_age := make_interval(secs => greatest(coalesce(p_min_age_seconds, 0), 0));

  -- A pass that never finished (a crashed function) is closed as ABANDONED
  -- after one hour; its leases expired by time long before.
  update public.subscription_reconciliation_runs
     set status = 'ABANDONED', finished_at = now(), updated_at = now(),
         last_error = 'abandoned: still RUNNING after one hour'
   where status = 'RUNNING' and started_at < now() - interval '1 hour';

  if p_scope ? 'users' then
    if jsonb_typeof(p_scope->'users') <> 'array' then
      raise exception 'subscription reconciliation: scope.users must be an array' using errcode = '22023';
    end if;
    v_explicit := true;
    for v_text in select value from jsonb_array_elements_text(p_scope->'users') loop
      if v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and exists (select 1 from auth.users u where u.id = v_text::uuid) then
        v_candidates := array_append(v_candidates, v_text::uuid);
      else
        v_unknown := array_append(v_unknown, left(v_text, 200));
      end if;
    end loop;
  elsif p_scope->>'source' = 'mirrored' then
    select coalesce(array_agg(distinct e.user_id), '{}'::uuid[]) into v_candidates
      from public.subscription_entitlements e;
  elsif p_scope->>'source' = 'businesses' then
    select coalesce(array_agg(distinct b.owner_user_id), '{}'::uuid[]) into v_candidates
      from public.businesses b;
  else
    raise exception 'subscription reconciliation: scope must name users, or source mirrored | businesses' using errcode = '22023';
  end if;
  if p_kind = 'SWEEP' and v_explicit then
    raise exception 'subscription reconciliation: a SWEEP takes a source scope, not a user list' using errcode = '22023';
  end if;

  with candidate as (
    select distinct c.user_id
      from unnest(v_candidates) as c(user_id)
     where p_after is null or c.user_id > p_after
  ), joined as (
    select c.user_id,
           coalesce(s.lease_until > now(), false) as leased,
           coalesce(s.last_succeeded_at > now() - v_min_age, false) as recent,
           (not v_explicit) and coalesce(s.next_attempt_at > now(), false) as backoff,
           s.last_attempted_at
      from candidate c
      left join public.subscription_reconciliation_state s on s.user_id = c.user_id
  )
  select count(*) filter (where leased),
         count(*) filter (where not leased and recent),
         count(*) filter (where not leased and not recent and backoff),
         count(*) filter (where not leased and not recent and not backoff)
    into v_skipped_leased, v_skipped_recent, v_skipped_backoff, v_eligible
    from joined;

  with candidate as (
    select distinct c.user_id
      from unnest(v_candidates) as c(user_id)
     where p_after is null or c.user_id > p_after
  ), joined as (
    select c.user_id,
           coalesce(s.lease_until > now(), false) as leased,
           coalesce(s.last_succeeded_at > now() - v_min_age, false) as recent,
           (not v_explicit) and coalesce(s.next_attempt_at > now(), false) as backoff,
           s.last_attempted_at
      from candidate c
      left join public.subscription_reconciliation_state s on s.user_id = c.user_id
  ), ordered as (
    select j.user_id
      from joined j
     where not j.leased and not j.recent and not j.backoff
     order by case when p_kind = 'SWEEP' then coalesce(j.last_attempted_at, '-infinity'::timestamptz) end,
              j.user_id
     limit v_limit
  )
  select coalesce(array_agg(o.user_id order by o.user_id), '{}'::uuid[]) into v_selected from ordered o;

  insert into public.subscription_reconciliation_runs (kind, mode, scope, selected)
  values (p_kind, p_mode, p_scope, coalesce(array_length(v_selected, 1), 0))
  returning id into v_run_id;

  if p_mode = 'APPLY' and coalesce(array_length(v_selected, 1), 0) > 0 then
    insert into public.subscription_reconciliation_state (user_id, lease_until, lease_run_id, last_attempted_at, updated_at)
    select u, now() + make_interval(secs => v_lease), v_run_id, now(), now()
      from unnest(v_selected) as u
    on conflict (user_id) do update set
      lease_until = excluded.lease_until,
      lease_run_id = excluded.lease_run_id,
      last_attempted_at = excluded.last_attempted_at,
      updated_at = now();
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', u.user_id,
           'business_id', (select b.id from public.businesses b where b.owner_user_id = u.user_id),
           'app_user_ids', (
             select coalesce(jsonb_agg(distinct ids.id), '[]'::jsonb)
               from (
                 select u.user_id::text as id
                 union
                 select e.app_user_id from public.subscription_entitlements e where e.user_id = u.user_id
                 union
                 select e.original_app_user_id from public.subscription_entitlements e
                  where e.user_id = u.user_id and e.original_app_user_id is not null
               ) as ids),
           'mirror_rows', (select count(*) from public.subscription_entitlements e where e.user_id = u.user_id),
           'plus_access', public.subscription_has_plus_access(u.user_id, now())
         ) order by u.user_id), '[]'::jsonb)
    into v_users
    from unnest(v_selected) as u(user_id);

  -- v_selected is ordered by user id: its last element is the cursor.
  if p_kind <> 'SWEEP' and v_eligible > v_limit then
    v_cursor := v_selected[array_length(v_selected, 1)];
  end if;
  update public.subscription_reconciliation_runs
     set cursor_user_id = v_cursor, updated_at = now()
   where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'users', v_users,
    'unknown_users', to_jsonb(v_unknown),
    'skipped', jsonb_build_object('leased', v_skipped_leased, 'recent', v_skipped_recent, 'backoff', v_skipped_backoff),
    'eligible', v_eligible,
    'next_cursor', v_cursor);
end;
$$;

comment on function public.subscription_reconciliation_claim(text, text, jsonb, integer, uuid, integer, integer) is
  'BeautIzzy Plus 6.5C: opens a reconciliation run and selects a bounded batch of accounts from the named scope (explicit users, every mirrored user, every Business owner), skipping leased, recently reconciled and backed-off accounts; APPLY leases the batch, DRY_RUN leases nothing. service_role only.';

revoke all on function public.subscription_reconciliation_claim(text, text, jsonb, integer, uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.subscription_reconciliation_claim(text, text, jsonb, integer, uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Settle one account of a run
-- ---------------------------------------------------------------------------
-- Records the outcome on the run (counts, requests, bounded report) and, in
-- APPLY mode, on the account's state: the lease is released, a success
-- resets the failure count, a FAILED outcome doubles the backoff (15 minutes
-- × 2^(failures − 1), at most 24 hours). `p_detail` is a sanitized vocabulary.
create or replace function public.subscription_reconciliation_settle(
  p_run_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_detail text default null,
  p_requests integer default 0
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run public.subscription_reconciliation_runs%rowtype;
  v_detail text := left(p_detail, 400);
  v_failures integer;
begin
  if p_outcome is null or p_outcome not in ('APPLIED', 'CONFIRMED', 'STALE', 'NO_SUBSCRIBER', 'NO_SOURCES', 'INVESTIGATE', 'FAILED') then
    raise exception 'subscription reconciliation: unknown outcome' using errcode = '22023';
  end if;
  if p_user_id is null then
    raise exception 'subscription reconciliation: user id is required' using errcode = '22023';
  end if;
  select * into v_run from public.subscription_reconciliation_runs where id = p_run_id for update;
  if not found or v_run.status <> 'RUNNING' then
    raise exception 'subscription reconciliation: run is not running' using errcode = '22023';
  end if;

  update public.subscription_reconciliation_runs
     set counts = counts || jsonb_build_object(p_outcome, coalesce((counts->>p_outcome)::integer, 0) + 1),
         requests = requests + greatest(coalesce(p_requests, 0), 0),
         report = case when jsonb_array_length(report) < 200
                       then report || jsonb_build_array(jsonb_build_object('user_id', p_user_id, 'outcome', p_outcome, 'detail', v_detail))
                       else report end,
         updated_at = now()
   where id = p_run_id;

  if v_run.mode = 'APPLY' then
    select coalesce(s.consecutive_failures, 0) into v_failures
      from public.subscription_reconciliation_state s where s.user_id = p_user_id;
    v_failures := case when p_outcome = 'FAILED' then coalesce(v_failures, 0) + 1 else 0 end;
    insert into public.subscription_reconciliation_state
      (user_id, lease_until, lease_run_id, last_attempted_at, last_succeeded_at, last_outcome, last_detail,
       consecutive_failures, next_attempt_at, updated_at)
    values
      (p_user_id, null, null, now(),
       case when p_outcome <> 'FAILED' then now() end,
       p_outcome, v_detail, v_failures,
       case when p_outcome = 'FAILED'
            then now() + least(interval '15 minutes' * power(2, least(v_failures - 1, 7))::integer, interval '24 hours')
            end,
       now())
    on conflict (user_id) do update set
      lease_until = null,
      lease_run_id = null,
      last_attempted_at = now(),
      last_succeeded_at = case when p_outcome <> 'FAILED' then now() else public.subscription_reconciliation_state.last_succeeded_at end,
      last_outcome = excluded.last_outcome,
      last_detail = excluded.last_detail,
      consecutive_failures = excluded.consecutive_failures,
      next_attempt_at = excluded.next_attempt_at,
      updated_at = now();
  end if;

  return jsonb_build_object('status', 'SETTLED');
end;
$$;

comment on function public.subscription_reconciliation_settle(uuid, uuid, text, text, integer) is
  'BeautIzzy Plus 6.5C: records one account''s reconciliation outcome on its run (counts, requests, bounded report) and, in APPLY mode, on its state row (lease released, failure backoff maintained). service_role only.';

revoke all on function public.subscription_reconciliation_settle(uuid, uuid, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.subscription_reconciliation_settle(uuid, uuid, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Finish a run — and release every lease it still holds
-- ---------------------------------------------------------------------------
-- p_status   COMPLETED | STOPPED | FAILED   (STOPPED: the pass ended early on
--            purpose — a rate limit, an unauthorized key — with the remaining
--            accounts untouched and unleased)
-- Returns the closed run: { "run_id", "status", "selected", "counts",
-- "requests", "cursor_user_id", "last_error" }.
create or replace function public.subscription_reconciliation_finish(
  p_run_id uuid,
  p_status text,
  p_error text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run public.subscription_reconciliation_runs%rowtype;
begin
  if p_status is null or p_status not in ('COMPLETED', 'STOPPED', 'FAILED') then
    raise exception 'subscription reconciliation: status must be COMPLETED, STOPPED or FAILED' using errcode = '22023';
  end if;
  select * into v_run from public.subscription_reconciliation_runs where id = p_run_id for update;
  if not found or v_run.status <> 'RUNNING' then
    raise exception 'subscription reconciliation: run is not running' using errcode = '22023';
  end if;

  update public.subscription_reconciliation_state
     set lease_until = null, lease_run_id = null, updated_at = now()
   where lease_run_id = p_run_id;

  update public.subscription_reconciliation_runs
     set status = p_status, finished_at = now(), last_error = left(p_error, 400), updated_at = now()
   where id = p_run_id
   returning * into v_run;

  return jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'selected', v_run.selected,
    'counts', v_run.counts,
    'requests', v_run.requests,
    'cursor_user_id', v_run.cursor_user_id,
    'last_error', v_run.last_error);
end;
$$;

comment on function public.subscription_reconciliation_finish(uuid, text, text) is
  'BeautIzzy Plus 6.5C: closes a reconciliation run (COMPLETED, STOPPED or FAILED) and releases every lease it still holds. service_role only.';

revoke all on function public.subscription_reconciliation_finish(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.subscription_reconciliation_finish(uuid, text, text) to service_role;
