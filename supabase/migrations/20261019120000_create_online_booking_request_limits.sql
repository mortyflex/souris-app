-- BeautIzzy — Online booking, Sprint 3C-B: request limits of the public booking flow
--
-- The website's booking endpoints (web/src/app/api/booking/…) answer anyone
-- on the Internet. They must refuse floods BEFORE they reach the booking
-- engine, and every server instance — serverless functions included — must
-- count the same requests. An in-memory counter cannot: each instance would
-- keep its own. This migration gives them ONE shared, durable counter, in the
-- database every instance already reaches:
--
--   table    online_booking_request_counters          fixed-window counters, opaque keys
--   website  online_booking_take_request_quota(jsonb) service_role ONLY
--
-- The website owns the policy — which scopes, which limits, which windows
-- (web/src/features/booking/request-protection.ts) — and derives every key
-- as HMAC-SHA256(server-only secret, scope + identifier). This table never
-- holds an IP address, an email, a slug or any readable identifier: only 64
-- hexadecimal digits that cannot be reversed without the website's secret.
--
-- One call takes one request's quota:
--
--   * EVERY counter given is incremented — a refused request counts too, so
--     a client that is refused cannot probe its way back in;
--   * counters are taken in key order, so two concurrent calls never wait for
--     each other in opposite orders (no deadlock);
--   * concurrent calls on the same key serialize on its row: N simultaneous
--     calls against a limit L are allowed exactly min(N, L) times;
--   * the answer is TRUE only when every counter is still within its limit.
--
-- Fixed windows aligned on the epoch: a burst straddling a boundary can reach
-- twice a limit over one window length. Accepted: the limits bound abuse, they
-- are not a billing meter. Expired windows are deleted opportunistically, at
-- most 100 rows per call, never waiting for a locked row.
--
-- Privileges (the Sprint 2 / 3A / 3B / 3C-A model): the table has RLS
-- enabled, NO policy and no grant; the function is revoked from public, anon,
-- authenticated AND service_role, then granted to service_role only — the
-- website server, with the secret key.
--
-- Additive: one new table, one new function. No existing object, row, policy
-- or grant is touched; the booking engine is unchanged. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The counters
-- ---------------------------------------------------------------------------
create table if not exists public.online_booking_request_counters (
  -- HMAC-SHA256 hex computed by the website: never a readable identifier.
  counter_key text not null check (counter_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  hits integer not null check (hits >= 1),
  primary key (counter_key, window_started_at),
  constraint online_booking_request_counters_window check (expires_at > window_started_at)
);

create index if not exists online_booking_request_counters_expires_at_idx
  on public.online_booking_request_counters (expires_at);

comment on table public.online_booking_request_counters is
  'Online booking: fixed-window request counters of the public booking endpoints, keyed by an HMAC the website computes (no IP, email or slug is ever stored). Server-only. No table access for any API role.';

alter table public.online_booking_request_counters enable row level security;
revoke all on table public.online_booking_request_counters from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Taking a request's quota — the website's ONE call
-- ---------------------------------------------------------------------------
-- p_counters: a JSON array of 1 to 8 objects
--   { "key": "<64 hex>", "limit": 1 … 100000, "window_seconds": 1 … 86400 }
-- Anything else raises 22023 and counts nothing.
create or replace function public.online_booking_take_request_quota(p_counters jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_counter record;
  v_limit integer;
  v_window integer;
  v_window_start timestamptz;
  v_hits integer;
  v_allowed boolean := true;
begin
  -- Nested tests, not OR: SQL does not promise to evaluate an OR left to right.
  if p_counters is null or jsonb_typeof(p_counters) <> 'array' then
    raise exception 'online booking: 1 to 8 counters are required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_counters) not between 1 and 8 then
    raise exception 'online booking: 1 to 8 counters are required' using errcode = '22023';
  end if;

  -- Validate everything before counting anything. CASE, unlike OR, is
  -- evaluated in order: a cast only ever sees digits.
  if exists (
    select 1
      from jsonb_array_elements(p_counters) c
     where case
             when jsonb_typeof(c.value) <> 'object' then true
             when coalesce(c.value ->> 'key', '') !~ '^[0-9a-f]{64}$' then true
             when coalesce(c.value ->> 'limit', '') !~ '^[1-9][0-9]{0,5}$' then true
             when coalesce(c.value ->> 'window_seconds', '') !~ '^[1-9][0-9]{0,4}$' then true
             else (c.value ->> 'limit')::integer > 100000
                  or (c.value ->> 'window_seconds')::integer > 86400
           end) then
    raise exception 'online booking: malformed request counter' using errcode = '22023';
  end if;

  for v_counter in
    select c.value ->> 'key' as counter_key,
           (c.value ->> 'limit')::integer as hit_limit,
           (c.value ->> 'window_seconds')::integer as window_seconds
      from jsonb_array_elements(p_counters) c
     order by c.value ->> 'key', (c.value ->> 'window_seconds')::integer
  loop
    v_limit := v_counter.hit_limit;
    v_window := v_counter.window_seconds;
    v_window_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);

    insert into public.online_booking_request_counters as c
      (counter_key, window_started_at, expires_at, hits)
    values
      (v_counter.counter_key, v_window_start, v_window_start + make_interval(secs => v_window), 1)
    on conflict (counter_key, window_started_at)
      do update set hits = least(c.hits, 2147483646) + 1
    returning c.hits into v_hits;

    if v_hits > v_limit then
      v_allowed := false;
    end if;
  end loop;

  -- Housekeeping: a bounded batch of long-expired windows, never waiting.
  delete from public.online_booking_request_counters d
   where d.ctid in (
     select e.ctid
       from public.online_booking_request_counters e
      where e.expires_at < v_now - interval '1 hour'
      order by e.expires_at
      limit 100
        for update skip locked);

  return v_allowed;
end;
$$;

comment on function public.online_booking_take_request_quota(jsonb) is
  'Online booking: increments every given request counter (a refused request counts too, keys taken in order) and answers whether all of them are still within their limit. Keys are HMACs computed by the website. service_role only.';

revoke all on function public.online_booking_take_request_quota(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.online_booking_take_request_quota(jsonb) to service_role;
