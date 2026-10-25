-- BeautIzzy — BeautIzzy Plus Phase 6.5A: the server-side entitlement mirror
--
-- docs/architecture/SUBSCRIPTIONS.md. The server-side copy of what RevenueCat
-- knows about each professional's BeautIzzy Plus entitlement, fed by the
-- `revenuecat-webhook` Edge Function (RevenueCat → BeautIzzy) and, when the
-- RevenueCat secret API key is configured, by the reconciliation of the
-- subscriber state after each event. The mobile app keeps verifying through
-- the RevenueCat SDK; this mirror is the FUTURE server-side source of truth for
-- business-mutation enforcement and communication suppression — none of which
-- this migration enables. `SUBSCRIPTION_ENFORCEMENT` stays `disabled` in the
-- app; no sync RPC, no reminder function and no existing row changes here.
--
-- Two tables, deliberately kept apart:
--
--   subscription_entitlements   the CURRENT state of every SOURCE granting the
--                               entitlement: one row per (user, environment,
--                               entitlement, PRODUCT). A paid App Store
--                               subscription and a promotional grant are two
--                               rows; two promotional grants of different
--                               durations are two rows. Each row is rewritten
--                               by newer evidence about ITS product only
--                               (ordered by the RevenueCat event timestamp,
--                               guarded against concurrent writes). Effective
--                               Plus access is DERIVED from all rows
--                               (`subscription_has_plus_access`), never read
--                               from one row.
--   subscription_events         the append-only HISTORY of every RevenueCat
--                               event received, unique on the RevenueCat event
--                               id (idempotence), with the outcome the mirror
--                               gave it (APPLIED, STALE, IGNORED, UNMATCHED,
--                               UNSUPPORTED). Never rewritten by the webhook.
--
-- Why the product is the unit. RevenueCat emits every event about ONE product
-- and expires, cancels or renews that product only, while another product may
-- still grant the same entitlement; its REST API likewise lists the subscriber
-- state per product (`subscriber.subscriptions[product]`). Several promotional
-- grants of the SAME product (same duration) are one RevenueCat subscription
-- whose end is the latest grant's: the row keeps the later end, and an
-- expiration of an earlier grant is STALE. Nothing finer than the product can
-- be reconciled against RevenueCat, so nothing finer is stored.
--
-- Identity. The RevenueCat App User ID IS the Supabase Auth user id
-- (src/infrastructure/revenuecat/subscription-source.ts: identified-only,
-- never anonymous). A subscriber is matched by the FIRST of
-- `original_app_user_id` + `aliases` + `app_user_id` that is a uuid of an
-- existing auth.users row. One authenticated user owns exactly one Business
-- (`businesses.owner_user_id` is UNIQUE — 20260912120000_create_businesses.sql),
-- so `business_id` is DERIVED from the user and never sent by RevenueCat: it is
-- resolved at every write, and bound after the fact when the Business is
-- created later (trigger on `businesses`). A subscriber that matches no user is
-- recorded (UNMATCHED) and changes no row: nothing is ever invented.
--
-- Environments. `PRODUCTION` and `SANDBOX` (RevenueCat's own vocabulary; the
-- RevenueCat Test Store and Apple Sandbox both report SANDBOX) are SEPARATE
-- rows. A SANDBOX event can never rewrite a PRODUCTION row, and production
-- access is derived from PRODUCTION rows whose store is a production store
-- (`subscription_has_plus_access`): a Test Store or Sandbox purchase grants
-- nothing in production even if its environment were mislabelled. A
-- complimentary (PROMOTIONAL) grant is a production event with store
-- PROMOTIONAL — never confused with a Sandbox purchase.
--
-- Access model. `anon`: nothing. `authenticated`: SELECT of the user's OWN rows
-- only (both environments; the app decides what it shows), no INSERT / UPDATE /
-- DELETE — a client can never grant itself anything. The history is
-- server-only (RLS on, zero policies, no API-role grant). Writes happen ONLY
-- through the `subscription_*` functions, EXECUTE granted to `service_role`
-- only, which the Edge Function calls with the privileged server client. They
-- are SECURITY DEFINER (search_path pinned): the server role holds NO table
-- privilege at all — not on the two new tables, nor on auth.users and
-- businesses the matching reads (the project confers none implicitly —
-- 20260929120000_grant_worker_table_privileges.sql) — so the functions are the
-- only door, for the app and for the server alike.
--
-- Additive and non-destructive: two NEW tables, their triggers, policies,
-- grants and the NEW functions; ONE after-insert trigger added on the existing
-- `businesses` table (it only binds the Business to the owner's pre-existing
-- rows and never fails the insert). No existing row, column, policy, grant,
-- function or sync RPC is touched. Safe to re-run (`if not exists`,
-- `drop … if exists` on this migration's own objects only, `create or replace`).

-- ---------------------------------------------------------------------------
-- 1. The current state of each granting source
-- ---------------------------------------------------------------------------
-- status
--   ACTIVE             a paid subscription in force, renewing
--   TRIAL              the free trial in force, converting at its end
--   CANCELLED_ACTIVE   auto-renewal is off; in force until `entitled_until`
--   BILLING_RETRY      the store failed to charge and keeps the access while it
--                      retries (`grace_period_expires_at`); still in force
--   COMPLIMENTARY      a promotional grant (pilot access); `entitled_until`
--                      NULL means no predetermined end
--   EXPIRED            confirmed ended: expired, revoked, refunded, transferred
--
-- `entitled_until` is THE instant THIS source stops granting as RevenueCat
-- knows it (the store expiration, or the end of the store's billing grace
-- when later), NULL only for a complimentary grant without an end. A source
-- "grants at t" when status <> 'EXPIRED' and (entitled_until is null or
-- entitled_until > t). Ends are exclusive. Nothing here models the app's
-- 72-hour OFFLINE grace: that grace belongs to a device whose last trusted
-- state was in force and whose renewal cannot be verified — never to a
-- confirmed expiration or revocation.
create table if not exists public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Derived from businesses.owner_user_id; NULL until the user has a Business.
  business_id uuid references public.businesses (id) on delete set null,
  environment text not null check (environment in ('PRODUCTION', 'SANDBOX')),
  -- Only the `plus` entitlement grants BeautIzzy Plus (customer-info.ts).
  entitlement_id text not null default 'plus' check (entitlement_id = 'plus'),
  -- The granting product: an App Store product, a RevenueCat promotional
  -- product (`rc_promo_plus_<duration>`), a Test Store product. The unit of
  -- every RevenueCat event and of its REST API.
  product_id text not null check (char_length(product_id) between 1 and 200),

  status text not null
    check (status in ('ACTIVE', 'TRIAL', 'CANCELLED_ACTIVE', 'BILLING_RETRY', 'COMPLIMENTARY', 'EXPIRED')),
  -- From an EXACT App Store product identifier; UNKNOWN otherwise (a Test
  -- Store product, a promotional product). Access never depends on it.
  plan text not null default 'UNKNOWN' check (plan in ('MONTHLY', 'ANNUAL', 'UNKNOWN')),
  -- PRODUCT_CHANGE announces the product of the NEXT period; the current one stays.
  pending_product_id text check (pending_product_id is null or char_length(pending_product_id) between 1 and 200),
  -- RevenueCat vocabulary as received (APP_STORE, PLAY_STORE, PROMOTIONAL, TEST_STORE, …): plain text, never CHECKed.
  store text check (store is null or char_length(store) between 1 and 40),
  period_type text check (period_type is null or char_length(period_type) between 1 and 40),

  -- The RevenueCat App User ID that matched this user, and the subscriber's first one.
  app_user_id text not null check (char_length(app_user_id) between 1 and 200),
  original_app_user_id text check (original_app_user_id is null or char_length(original_app_user_id) between 1 and 200),

  purchased_at timestamptz,
  expires_at timestamptz,
  grace_period_expires_at timestamptz,
  entitled_until timestamptz,
  will_renew boolean not null default false,
  unsubscribe_detected_at timestamptz,
  billing_issue_detected_at timestamptz,

  original_transaction_id text check (original_transaction_id is null or char_length(original_transaction_id) between 1 and 200),
  latest_transaction_id text check (latest_transaction_id is null or char_length(latest_transaction_id) between 1 and 200),

  -- The latest APPLIED webhook event about THIS product (NULL for a row written
  -- by the reconciliation only). Ordering guard of the webhook: an event older
  -- than `latest_event_at` is STALE and never applied.
  latest_event_id text check (latest_event_id is null or char_length(latest_event_id) between 1 and 200),
  latest_event_type text check (latest_event_type is null or char_length(latest_event_type) between 1 and 80),
  latest_event_at timestamptz,

  source text not null check (source in ('WEBHOOK', 'RECONCILIATION')),
  -- The instant the state was last confirmed: the event timestamp, or the
  -- RevenueCat API `request_date` of a reconciliation.
  verified_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscription_entitlements_source_unique unique (user_id, environment, entitlement_id, product_id),
  -- Only a complimentary grant may have no end.
  constraint subscription_entitlements_entitled_until_check
    check (entitled_until is not null or status = 'COMPLIMENTARY'),
  -- A row from the webhook names the event it comes from.
  constraint subscription_entitlements_webhook_event_check
    check (source <> 'WEBHOOK' or (latest_event_id is not null and latest_event_at is not null))
);

comment on table public.subscription_entitlements is
  'BeautIzzy Plus: the current server-side mirror of every source granting a user''s RevenueCat entitlement — one row per (user, environment, entitlement, product). Owner read-only; written by the subscription_* functions (service_role) only. Effective access: subscription_has_plus_access.';
comment on column public.subscription_entitlements.entitled_until is
  'The instant THIS source stops granting as RevenueCat knows it (store expiration or later billing grace). NULL only for a complimentary grant without an end. Exclusive.';
comment on column public.subscription_entitlements.environment is
  'RevenueCat environment: PRODUCTION or SANDBOX (Test Store and Apple Sandbox). Separate rows; a SANDBOX row never grants production access.';

create index if not exists subscription_entitlements_business_idx
  on public.subscription_entitlements (business_id)
  where business_id is not null;

-- ---------------------------------------------------------------------------
-- 2. The append-only history
-- ---------------------------------------------------------------------------
-- outcome
--   APPLIED       the row(s) of the matched user(s) were rewritten
--   STALE         older than the row's latest event, or superseded by a later
--                 known expiration: recorded, not applied
--   IGNORED       recognised but not applicable (dashboard TEST, another app,
--                 a product not mapped to `plus`, a store purchase without an
--                 expiration, no environment, no product)
--   UNMATCHED     no App User ID is an existing Supabase user: recorded for a
--                 later manual reconciliation, no row touched
--   UNSUPPORTED   an event type this phase does not interpret: recorded only
--
-- `payload` is the RevenueCat `event` object as received MINUS
-- `subscriber_attributes` (business-private data the mirror never stores).
-- Never a credential, never a header.
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null check (char_length(event_id) between 1 and 200),
  event_type text not null check (char_length(event_type) between 1 and 80),
  app_id text check (app_id is null or char_length(app_id) between 1 and 200),
  environment text check (environment is null or environment in ('PRODUCTION', 'SANDBOX')),
  store text check (store is null or char_length(store) between 1 and 40),
  app_user_id text check (app_user_id is null or char_length(app_user_id) between 1 and 200),
  original_app_user_id text check (original_app_user_id is null or char_length(original_app_user_id) between 1 and 200),
  aliases text[] not null default '{}'::text[],
  -- The matched user and Business, when any. SET NULL: history outlives accounts.
  user_id uuid references auth.users (id) on delete set null,
  business_id uuid references public.businesses (id) on delete set null,
  product_id text check (product_id is null or char_length(product_id) between 1 and 200),
  entitlement_ids text[],
  event_at timestamptz not null,
  purchased_at timestamptz,
  expires_at timestamptz,
  transaction_id text check (transaction_id is null or char_length(transaction_id) between 1 and 200),
  original_transaction_id text check (original_transaction_id is null or char_length(original_transaction_id) between 1 and 200),
  outcome text not null check (outcome in ('APPLIED', 'STALE', 'IGNORED', 'UNMATCHED', 'UNSUPPORTED')),
  outcome_detail text check (outcome_detail is null or char_length(outcome_detail) between 1 and 400),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),

  constraint subscription_events_event_id_unique unique (event_id)
);

comment on table public.subscription_events is
  'BeautIzzy Plus: append-only history of every RevenueCat webhook event received, unique on the RevenueCat event id. Server-only; written by subscription_apply_revenuecat_event (service_role).';

create index if not exists subscription_events_user_idx
  on public.subscription_events (user_id, event_at desc)
  where user_id is not null;
create index if not exists subscription_events_unmatched_idx
  on public.subscription_events (received_at)
  where outcome = 'UNMATCHED';

-- ---------------------------------------------------------------------------
-- 3. Server-owned writes: pinned identity, server timestamps, append-only history
-- ---------------------------------------------------------------------------
create or replace function public.subscription_entitlements_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- The identity of the row never moves.
  new.id := old.id;
  new.user_id := old.user_id;
  new.environment := old.environment;
  new.entitlement_id := old.entitlement_id;
  new.product_id := old.product_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.subscription_entitlements_before_write() is
  'BeautIzzy Plus: server timestamps and pinned identity of subscription_entitlements.';

revoke all on function public.subscription_entitlements_before_write() from public, anon, authenticated;

drop trigger if exists subscription_entitlements_before_write on public.subscription_entitlements;
create trigger subscription_entitlements_before_write
  before insert or update on public.subscription_entitlements
  for each row execute function public.subscription_entitlements_before_write();

create or replace function public.subscription_events_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.received_at := now();
    return new;
  end if;
  -- History is never rewritten. The ONE legal update is the referential SET
  -- NULL of a deleted user or Business (the FKs above): every other column
  -- must be byte-identical, and the two references may only become NULL.
  if (to_jsonb(new) - 'user_id' - 'business_id') = (to_jsonb(old) - 'user_id' - 'business_id')
     and (new.user_id is null or new.user_id = old.user_id)
     and (new.business_id is null or new.business_id = old.business_id) then
    return new;
  end if;
  raise exception 'subscriptions: subscription_events is append-only' using errcode = '22023';
end;
$$;

comment on function public.subscription_events_before_write() is
  'BeautIzzy Plus: server receipt time of subscription_events; refuses every UPDATE but the referential SET NULL of a deleted user or Business (append-only).';

revoke all on function public.subscription_events_before_write() from public, anon, authenticated;

drop trigger if exists subscription_events_before_write on public.subscription_events;
create trigger subscription_events_before_write
  before insert or update on public.subscription_events
  for each row execute function public.subscription_events_before_write();

-- ---------------------------------------------------------------------------
-- 4. RLS + grants
-- ---------------------------------------------------------------------------
alter table public.subscription_entitlements enable row level security;
alter table public.subscription_events enable row level security;

revoke all on table public.subscription_entitlements from public, anon, authenticated;
revoke all on table public.subscription_events from public, anon, authenticated;

-- The owner reads her own rows; nothing else, nothing more.
drop policy if exists "subscription_entitlements: owner can select" on public.subscription_entitlements;
create policy "subscription_entitlements: owner can select"
  on public.subscription_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.subscription_entitlements to authenticated;

-- The server holds NO direct table privilege either: the platform may leave
-- a TRUNCATE / REFERENCES / TRIGGER residue on new tables
-- (20260930120000_revoke_worker_extra_privileges.sql), revoked here. Every
-- server write goes through the SECURITY DEFINER subscription_* functions
-- below (EXECUTE: service_role only), which also read auth.users and
-- businesses — tables the server role holds no privilege on.
revoke all on table public.subscription_entitlements from service_role;
revoke all on table public.subscription_events from service_role;

-- ---------------------------------------------------------------------------
-- 5. A Business created after the entitlement binds itself
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER on purpose: the insert runs as the signed-in owner, who
-- holds no privilege on the mirror. The body touches ONLY the owner's rows
-- whose business_id is still NULL, and never fails the insert.
create or replace function public.subscription_bind_business_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscription_entitlements
     set business_id = new.id
   where user_id = new.owner_user_id
     and business_id is null;
  return new;
end;
$$;

comment on function public.subscription_bind_business_after_insert() is
  'BeautIzzy Plus: binds a newly created Business to the owner''s pre-existing entitlement rows (business_id NULL only).';

revoke all on function public.subscription_bind_business_after_insert() from public, anon, authenticated;

drop trigger if exists businesses_subscription_bind_after_insert on public.businesses;
create trigger businesses_subscription_bind_after_insert
  after insert on public.businesses
  for each row execute function public.subscription_bind_business_after_insert();

-- ---------------------------------------------------------------------------
-- 6. Helpers: instants travel as Unix milliseconds (RevenueCat's own unit)
-- ---------------------------------------------------------------------------
create or replace function public.subscription_instant_ms(p_instant timestamptz)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_instant is null then null
              else (extract(epoch from p_instant) * 1000)::bigint end;
$$;

create or replace function public.subscription_ms_instant(p_ms jsonb)
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_ms is null or jsonb_typeof(p_ms) <> 'number' then null
              else to_timestamp((p_ms::text)::numeric / 1000.0) end;
$$;

revoke all on function public.subscription_instant_ms(timestamptz) from public, anon, authenticated;
revoke all on function public.subscription_ms_instant(jsonb) from public, anon, authenticated;
grant execute on function public.subscription_instant_ms(timestamptz) to service_role;
grant execute on function public.subscription_ms_instant(jsonb) to service_role;

create or replace function public.subscription_snapshot_json(p_row public.subscription_entitlements)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p_row.user_id,
    'business_id', p_row.business_id,
    'environment', p_row.environment,
    'entitlement_id', p_row.entitlement_id,
    'product_id', p_row.product_id,
    'status', p_row.status,
    'plan', p_row.plan,
    'pending_product_id', p_row.pending_product_id,
    'store', p_row.store,
    'period_type', p_row.period_type,
    'app_user_id', p_row.app_user_id,
    'original_app_user_id', p_row.original_app_user_id,
    'purchased_at_ms', public.subscription_instant_ms(p_row.purchased_at),
    'expires_at_ms', public.subscription_instant_ms(p_row.expires_at),
    'grace_period_expires_at_ms', public.subscription_instant_ms(p_row.grace_period_expires_at),
    'entitled_until_ms', public.subscription_instant_ms(p_row.entitled_until),
    'will_renew', p_row.will_renew,
    'unsubscribe_detected_at_ms', public.subscription_instant_ms(p_row.unsubscribe_detected_at),
    'billing_issue_detected_at_ms', public.subscription_instant_ms(p_row.billing_issue_detected_at),
    'original_transaction_id', p_row.original_transaction_id,
    'latest_transaction_id', p_row.latest_transaction_id,
    'latest_event_id', p_row.latest_event_id,
    'latest_event_type', p_row.latest_event_type,
    'latest_event_at_ms', public.subscription_instant_ms(p_row.latest_event_at),
    'source', p_row.source,
    'verified_at_ms', public.subscription_instant_ms(p_row.verified_at)
  );
$$;

revoke all on function public.subscription_snapshot_json(public.subscription_entitlements) from public, anon, authenticated;
grant execute on function public.subscription_snapshot_json(public.subscription_entitlements) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Read the mirror of a subscriber: match the user, derive the Business, the rows
-- ---------------------------------------------------------------------------
-- Result, as jsonb:
--
--   { "user_id": uuid|null, "business_id": uuid|null, "matched_app_user_id": text|null,
--     "snapshots": [ …subscription_snapshot_json… ] }      every row of the environment
--
-- The FIRST candidate that is a uuid of an existing auth.users row matches.
-- The caller passes original_app_user_id, the aliases, then app_user_id.
create or replace function public.subscription_read_mirror(
  p_app_user_ids text[],
  p_environment text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_user_id uuid;
  v_matched text;
  v_business_id uuid;
  v_snapshots jsonb;
begin
  if p_environment is null or p_environment not in ('PRODUCTION', 'SANDBOX') then
    raise exception 'subscriptions: environment must be PRODUCTION or SANDBOX' using errcode = '22023';
  end if;

  foreach v_candidate in array coalesce(p_app_user_ids, '{}'::text[]) loop
    if v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select u.id into v_user_id from auth.users u where u.id = v_candidate::uuid;
      if found then
        v_matched := v_candidate;
        exit;
      end if;
    end if;
  end loop;

  if v_user_id is null then
    return jsonb_build_object('user_id', null, 'business_id', null, 'matched_app_user_id', null, 'snapshots', '[]'::jsonb);
  end if;

  select b.id into v_business_id from public.businesses b where b.owner_user_id = v_user_id;

  select coalesce(jsonb_agg(public.subscription_snapshot_json(e) order by e.product_id), '[]'::jsonb)
    into v_snapshots
    from public.subscription_entitlements e
   where e.user_id = v_user_id and e.environment = p_environment and e.entitlement_id = 'plus';

  return jsonb_build_object(
    'user_id', v_user_id,
    'business_id', v_business_id,
    'matched_app_user_id', v_matched,
    'snapshots', v_snapshots);
end;
$$;

comment on function public.subscription_read_mirror(text[], text) is
  'BeautIzzy Plus: matches RevenueCat App User IDs to a Supabase user, derives the Business, returns every granting-source row of one environment. service_role only.';

revoke all on function public.subscription_read_mirror(text[], text) from public, anon, authenticated;
grant execute on function public.subscription_read_mirror(text[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Upsert one row (shared by the webhook and the reconciliation)
-- ---------------------------------------------------------------------------
-- `p_snapshot` carries the row columns with `_ms` instants. business_id is
-- always re-derived here, never taken from the caller.
create or replace function public.subscription_write_snapshot(
  p_user_id uuid,
  p_environment text,
  p_product_id text,
  p_snapshot jsonb
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'subscriptions: user id is required' using errcode = '22023';
  end if;
  if p_product_id is null or char_length(btrim(p_product_id)) = 0 then
    raise exception 'subscriptions: product id is required' using errcode = '22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'subscriptions: snapshot must be a json object' using errcode = '22023';
  end if;

  select b.id into v_business_id from public.businesses b where b.owner_user_id = p_user_id;

  insert into public.subscription_entitlements as e
    (user_id, business_id, environment, entitlement_id, product_id, status, plan, pending_product_id,
     store, period_type, app_user_id, original_app_user_id,
     purchased_at, expires_at, grace_period_expires_at, entitled_until, will_renew,
     unsubscribe_detected_at, billing_issue_detected_at,
     original_transaction_id, latest_transaction_id,
     latest_event_id, latest_event_type, latest_event_at, source, verified_at)
  values
    (p_user_id, v_business_id, p_environment, 'plus', p_product_id,
     p_snapshot->>'status', coalesce(p_snapshot->>'plan', 'UNKNOWN'),
     p_snapshot->>'pending_product_id',
     p_snapshot->>'store', p_snapshot->>'period_type',
     p_snapshot->>'app_user_id', p_snapshot->>'original_app_user_id',
     public.subscription_ms_instant(p_snapshot->'purchased_at_ms'),
     public.subscription_ms_instant(p_snapshot->'expires_at_ms'),
     public.subscription_ms_instant(p_snapshot->'grace_period_expires_at_ms'),
     public.subscription_ms_instant(p_snapshot->'entitled_until_ms'),
     coalesce((p_snapshot->>'will_renew')::boolean, false),
     public.subscription_ms_instant(p_snapshot->'unsubscribe_detected_at_ms'),
     public.subscription_ms_instant(p_snapshot->'billing_issue_detected_at_ms'),
     p_snapshot->>'original_transaction_id', p_snapshot->>'latest_transaction_id',
     p_snapshot->>'latest_event_id', p_snapshot->>'latest_event_type',
     public.subscription_ms_instant(p_snapshot->'latest_event_at_ms'),
     p_snapshot->>'source',
     public.subscription_ms_instant(p_snapshot->'verified_at_ms'))
  on conflict (user_id, environment, entitlement_id, product_id) do update set
    business_id = excluded.business_id,
    status = excluded.status,
    plan = excluded.plan,
    pending_product_id = excluded.pending_product_id,
    store = excluded.store,
    period_type = excluded.period_type,
    app_user_id = excluded.app_user_id,
    original_app_user_id = excluded.original_app_user_id,
    purchased_at = excluded.purchased_at,
    expires_at = excluded.expires_at,
    grace_period_expires_at = excluded.grace_period_expires_at,
    entitled_until = excluded.entitled_until,
    will_renew = excluded.will_renew,
    unsubscribe_detected_at = excluded.unsubscribe_detected_at,
    billing_issue_detected_at = excluded.billing_issue_detected_at,
    original_transaction_id = excluded.original_transaction_id,
    latest_transaction_id = excluded.latest_transaction_id,
    latest_event_id = excluded.latest_event_id,
    latest_event_type = excluded.latest_event_type,
    latest_event_at = excluded.latest_event_at,
    source = excluded.source,
    verified_at = excluded.verified_at
  returning e.id into v_id;

  return v_id;
end;
$$;

comment on function public.subscription_write_snapshot(uuid, text, text, jsonb) is
  'BeautIzzy Plus: upserts one granting-source row (business re-derived from the owner). Internal to the subscription_* functions; service_role only.';

revoke all on function public.subscription_write_snapshot(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.subscription_write_snapshot(uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Apply one RevenueCat webhook event — idempotent, guarded, atomic
-- ---------------------------------------------------------------------------
-- `p_event` is the normalized event record (columns of subscription_events,
-- instants as `_ms`, plus `outcome`, `outcome_detail`, `payload`).
-- `p_writes` is a jsonb ARRAY of the row writes the event produced (empty for
-- STALE / IGNORED / UNMATCHED / UNSUPPORTED):
--
--   [{ "user_id": uuid, "environment": text, "product_id": text,
--      "expected_latest_event_id": text|null, "snapshot": { …columns with _ms instants… } }, …]
--
-- Result, as jsonb:
--
--   { "status": "DUPLICATE" }                      the event id was already recorded: NOTHING changes
--   { "status": <outcome>, "applied": n }          the history row was inserted; n rows written
--
-- Idempotence: the UNIQUE event id; a retried delivery (same id) is a no-op.
-- Concurrency: each write names the row's `latest_event_id` it was computed
-- against; a different value means another delivery landed in between — the
-- whole call raises 40001 and the webhook answers 500, so RevenueCat retries
-- and the retry recomputes against the new rows. Atomic: history and rows are
-- written in ONE transaction; a failure leaves no history row behind, so the
-- retry is processed in full.
create or replace function public.subscription_apply_revenuecat_event(
  p_event jsonb,
  p_writes jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id text;
  v_inserted uuid;
  v_write jsonb;
  v_user_id uuid;
  v_environment text;
  v_product_id text;
  v_expected text;
  v_current text;
  v_applied integer := 0;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'subscriptions: event must be a json object' using errcode = '22023';
  end if;
  if p_writes is null or jsonb_typeof(p_writes) <> 'array' then
    raise exception 'subscriptions: writes must be a json array' using errcode = '22023';
  end if;
  v_event_id := p_event->>'event_id';
  if v_event_id is null or char_length(btrim(v_event_id)) = 0 then
    raise exception 'subscriptions: event id is required' using errcode = '22023';
  end if;

  insert into public.subscription_events
    (event_id, event_type, app_id, environment, store, app_user_id, original_app_user_id, aliases,
     user_id, business_id, product_id, entitlement_ids, event_at, purchased_at, expires_at,
     transaction_id, original_transaction_id, outcome, outcome_detail, payload)
  values
    (v_event_id,
     p_event->>'event_type',
     p_event->>'app_id',
     p_event->>'environment',
     p_event->>'store',
     p_event->>'app_user_id',
     p_event->>'original_app_user_id',
     coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_event->'aliases', '[]'::jsonb))), '{}'::text[]),
     (p_event->>'user_id')::uuid,
     (select b.id from public.businesses b where b.owner_user_id = (p_event->>'user_id')::uuid),
     p_event->>'product_id',
     case when jsonb_typeof(p_event->'entitlement_ids') = 'array'
          then (select array_agg(value) from jsonb_array_elements_text(p_event->'entitlement_ids'))
          else null end,
     public.subscription_ms_instant(p_event->'event_at_ms'),
     public.subscription_ms_instant(p_event->'purchased_at_ms'),
     public.subscription_ms_instant(p_event->'expires_at_ms'),
     p_event->>'transaction_id',
     p_event->>'original_transaction_id',
     p_event->>'outcome',
     p_event->>'outcome_detail',
     coalesce(p_event->'payload', '{}'::jsonb))
  on conflict (event_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('status', 'DUPLICATE');
  end if;

  for v_write in select * from jsonb_array_elements(p_writes) loop
    v_user_id := (v_write->>'user_id')::uuid;
    v_environment := v_write->>'environment';
    v_product_id := v_write->>'product_id';
    v_expected := v_write->>'expected_latest_event_id';

    select e.latest_event_id into v_current
      from public.subscription_entitlements e
     where e.user_id = v_user_id and e.environment = v_environment
       and e.entitlement_id = 'plus' and e.product_id = v_product_id
       for update;
    if found then
      if v_current is distinct from v_expected then
        raise exception 'subscriptions: snapshot changed since it was read' using errcode = '40001';
      end if;
    elsif v_expected is not null then
      raise exception 'subscriptions: snapshot changed since it was read' using errcode = '40001';
    end if;

    perform public.subscription_write_snapshot(v_user_id, v_environment, v_product_id, v_write->'snapshot');
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('status', p_event->>'outcome', 'applied', v_applied);
end;
$$;

comment on function public.subscription_apply_revenuecat_event(jsonb, jsonb) is
  'BeautIzzy Plus: records one RevenueCat webhook event (idempotent on its id) and applies its row writes atomically, each guarded by the row''s latest event id. service_role only.';

revoke all on function public.subscription_apply_revenuecat_event(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.subscription_apply_revenuecat_event(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Apply a reconciliation of one granting source (RevenueCat REST API)
-- ---------------------------------------------------------------------------
-- The API answer is authoritative for its `request_date` and for the PRODUCT
-- it describes: it replaces that row unless the row was already confirmed
-- LATER (a newer event, a newer reconciliation). Rows the answer does not
-- describe are never touched here: an absence is not evidence. The webhook
-- ordering continues to work: the latest applied event is kept on the row
-- when the caller does not name one.
--
-- Result, as jsonb: { "status": "APPLIED" | "STALE" }
create or replace function public.subscription_apply_reconciliation(
  p_user_id uuid,
  p_environment text,
  p_product_id text,
  p_snapshot jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.subscription_entitlements%rowtype;
  v_verified_at timestamptz;
  v_snapshot jsonb;
begin
  if p_environment is null or p_environment not in ('PRODUCTION', 'SANDBOX') then
    raise exception 'subscriptions: environment must be PRODUCTION or SANDBOX' using errcode = '22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'subscriptions: snapshot must be a json object' using errcode = '22023';
  end if;
  v_verified_at := public.subscription_ms_instant(p_snapshot->'verified_at_ms');
  if v_verified_at is null then
    raise exception 'subscriptions: verified_at_ms is required' using errcode = '22023';
  end if;

  select * into v_row
    from public.subscription_entitlements
   where user_id = p_user_id and environment = p_environment
     and entitlement_id = 'plus' and product_id = p_product_id
     for update;

  if found and v_row.verified_at > v_verified_at then
    return jsonb_build_object('status', 'STALE');
  end if;

  v_snapshot := p_snapshot || jsonb_build_object('source', 'RECONCILIATION');
  if found and (v_snapshot->>'latest_event_id') is null then
    v_snapshot := v_snapshot || jsonb_build_object(
      'latest_event_id', v_row.latest_event_id,
      'latest_event_type', v_row.latest_event_type,
      'latest_event_at_ms', public.subscription_instant_ms(v_row.latest_event_at));
  end if;

  perform public.subscription_write_snapshot(p_user_id, p_environment, p_product_id, v_snapshot);
  return jsonb_build_object('status', 'APPLIED');
end;
$$;

comment on function public.subscription_apply_reconciliation(uuid, text, text, jsonb) is
  'BeautIzzy Plus: replaces one granting-source row with the RevenueCat subscriber state fetched from the REST API, unless the row was confirmed later. service_role only.';

revoke all on function public.subscription_apply_reconciliation(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.subscription_apply_reconciliation(uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Effective Plus access — THE server-side rule (preparation for Phase 6.5B)
-- ---------------------------------------------------------------------------
-- TRUE when ANY production source grants the entitlement at `p_at`:
--
--   environment = 'PRODUCTION'                       never a Sandbox row
--   store in the production stores                   never a Test Store product, whatever
--                                                     environment it was labelled with
--   status <> 'EXPIRED'                              confirmed ends and revocations hold
--   entitled_until is null or entitled_until > p_at  a complimentary grant without end
--                                                     grants indefinitely; ends are exclusive
--
-- No offline grace: the 72-hour grace is a DEVICE rule for a last trusted
-- state in force whose renewal cannot be verified (src/domain/access), never a
-- server extension of a confirmed expiration. Not connected to anything yet:
-- no sync RPC, no reminder function calls it in Phase 6.5A. SECURITY DEFINER
-- so a future server-side caller needs no table privilege; EXECUTE is granted
-- to service_role ONLY — no client-callable path exists.
create or replace function public.subscription_has_plus_access(
  p_user_id uuid,
  p_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.subscription_entitlements e
     where e.user_id = p_user_id
       and e.entitlement_id = 'plus'
       and e.environment = 'PRODUCTION'
       and e.store in ('APP_STORE', 'MAC_APP_STORE', 'PLAY_STORE', 'PROMOTIONAL')
       and e.status <> 'EXPIRED'
       and (e.entitled_until is null or e.entitled_until > coalesce(p_at, now()))
  );
$$;

comment on function public.subscription_has_plus_access(uuid, timestamptz) is
  'BeautIzzy Plus: whether ANY production source (App Store, Play Store, promotional — never Sandbox or Test Store) grants the plus entitlement at the given instant. No offline grace. service_role only; not wired to enforcement yet.';

revoke all on function public.subscription_has_plus_access(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.subscription_has_plus_access(uuid, timestamptz) to service_role;
