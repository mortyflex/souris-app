-- BeautIzzy — BeautIzzy Plus Phase 6.5C, step 4: the server-side foundation of
-- business-mutation entitlement enforcement, and the structured refusal of
-- the sync push RPC
--
-- docs/architecture/CLOUD_SYNC.md §26, docs/architecture/SUBSCRIPTIONS.md.
-- Business WRITES become a BeautIzzy Plus capability on the server: when — and
-- only when — the SERVER-SIDE switch below is enabled, `sync_push_aggregate`
-- refuses a write of a Business whose owner holds no VERIFIED PRODUCTION Plus
-- entitlement in the mirror of Phase 6.5A, with ONE structured answer:
--
--   { "status": "ENTITLEMENT_REQUIRED" }
--
-- and nothing else happens: no row is read or locked, nothing is written, no
-- version, tombstone or history moves. It is never an error: an ownership
-- failure stays 42501, a malformed argument stays 22023, and a refusal is a
-- per-Business, recoverable restriction the device already knows how to keep
-- pending (Phase 6.5C step 3: the entry stays, the push pass goes on hold,
-- the pull goes on). Nothing here reads, trusts or reuses the mobile app's
-- enforcement build constant (src/features/access/enforcement.ts): a client
-- switch is never a security control.
--
-- THE SWITCH IS DISABLED BY DEFAULT and stays disabled until an operator
-- flips it BY HAND (`business_mutation_set_entitlement_enforcement(true)`).
-- It is its own row of `server_feature_flags`, independent of the
-- communications switch of Phase 6.5B: either may be on without the other.
-- While it is disabled, the push RPC behaves EXACTLY as before this
-- migration — for every Business, including the accounts without any
-- `subscription_entitlements` row. Applying this migration alone changes no
-- row, refuses nothing, and modifies no outbox, queue or mirror record.
--
-- The access rule is NOT re-implemented here. ONE rule decides:
-- `subscription_has_plus_access(owner, at)` — PRODUCTION rows of production
-- stores only, status <> EXPIRED, end null or ahead. It already yields
-- exactly the product rules of this phase:
--
--   ACTIVE / TRIAL in force                     allowed
--   CANCELLED_ACTIVE before its expiration      allowed
--   BILLING_RETRY until the store's grace end   allowed until that confirmed deadline, not after
--   COMPLIMENTARY with a valid grant            allowed (a lifetime grant: no end)
--   EXPIRED                                     refused
--   no row / Sandbox / Test Store only          refused: unknown or unverified
--                                               access is never paid access
--   72-hour offline grace                       NONE on the server: a device rule only
--
-- The rule of this phase, `business_mutation_is_entitled(business, at)`, is
-- the ONE server-side predicate of a business write: the signed-in caller
-- owns the Business (never anyone else's, and a Business that does not exist
-- answers exactly like one the caller does not own), AND either enforcement
-- is disabled or the owner holds Plus. It is SECURITY DEFINER out of
-- necessity, not convenience: `subscription_has_plus_access` and the flag
-- reader are executable by nobody but the owner of the schema, so a
-- SECURITY INVOKER wrapper running as `authenticated` could not ask them.
-- It reads `businesses` to compare the owner with `auth.uid()` and nothing
-- else, returns a boolean and nothing else, and is the predicate the next
-- step will reuse in the row-level policies — without a second rule.
--
-- BOUNDARY OF THIS STEP. Enforcement lands at the sync RPC only. The direct
-- PostgREST table writes the owner-only policies still permit, the Storage
-- uploads of business media and the communication preference RPCs are NOT
-- gated by this migration: they are the explicit remaining work of step 5.
-- Server-side business-mutation protection is NOT complete until then.
--
-- Privileges, explicit and minimal: every new function is REVOKED from
-- public, anon, authenticated AND service_role first; exactly ONE grant is
-- made back — the rule to `authenticated`, because the push RPC is SECURITY
-- INVOKER and runs as the signed-in owner (and the policies of step 5 will
-- run as her too). The flag reader and the operator switch are granted to
-- nobody. The push RPC keeps its original privileges (EXECUTE: authenticated
-- only), re-stated below.
--
-- Additive and non-destructive: ONE new flag row (disabled, `on conflict do
-- nothing` — a re-run can never flip it), NEW functions, and ONE function
-- replaced IN PLACE with the same signature, the same grants and the same
-- body plus the check. No existing row, column, policy, table grant, trigger,
-- the pull RPC, the count RPC or any communication object is touched.

-- ---------------------------------------------------------------------------
-- 1. The server-side switch — one disabled row, operator-only
-- ---------------------------------------------------------------------------
insert into public.server_feature_flags (flag, enabled, note)
values (
  'BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT',
  false,
  'BeautIzzy Plus 6.5C: when enabled, sync_push_aggregate refuses the business writes of an owner without a verified production Plus entitlement (ENTITLEMENT_REQUIRED). Flip with business_mutation_set_entitlement_enforcement(boolean).')
on conflict (flag) do nothing;

create or replace function public.business_mutation_entitlement_enforcement_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.server_feature_flags f
      where f.flag = 'BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT'),
    false);
$$;

comment on function public.business_mutation_entitlement_enforcement_enabled() is
  'BeautIzzy Plus 6.5C: whether business-mutation entitlement enforcement is ON. A missing row reads as disabled (the pre-6.5C behavior). Independent of the communications switch.';

revoke all on function public.business_mutation_entitlement_enforcement_enabled() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. THE business-mutation entitlement rule
-- ---------------------------------------------------------------------------
-- TRUE when the SIGNED-IN caller may write the Business at `p_at`: she owns
-- it, AND (enforcement is disabled, OR she holds verified production Plus
-- access per THE 6.5A rule). FALSE — the same FALSE, revealing nothing — for
-- a Business she does not own, a Business that does not exist, a NULL id and
-- a caller without a session. Under enforcement, a Business whose owner has
-- no mirrored row, a Sandbox-only or Test Store-only subscriber: FALSE —
-- unverified is never paid. STABLE: one answer per statement.
create or replace function public.business_mutation_is_entitled(
  p_business_id uuid,
  p_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_business_id is null then false
    when not exists (
      select 1
        from public.businesses b
       where b.id = p_business_id
         and b.owner_user_id = (select auth.uid())
    ) then false
    when not public.business_mutation_entitlement_enforcement_enabled() then true
    else coalesce(
      (select public.subscription_has_plus_access(b.owner_user_id, coalesce(p_at, now()))
         from public.businesses b
        where b.id = p_business_id),
      false)
  end;
$$;

comment on function public.business_mutation_is_entitled(uuid, timestamptz) is
  'BeautIzzy Plus 6.5C: THE business-mutation entitlement rule — the signed-in caller owns the Business AND (enforcement disabled, or verified production Plus access per subscription_has_plus_access). FALSE for any Business the caller does not own or that does not exist. Never re-implements the access rule.';

revoke all on function public.business_mutation_is_entitled(uuid, timestamptz) from public, anon, authenticated, service_role;
-- The ONE grant a caller needs: sync_push_aggregate is SECURITY INVOKER (it
-- runs as the signed-in owner) and asks this rule; so will the row-level
-- policies of the next step.
grant execute on function public.business_mutation_is_entitled(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push — the structured refusal
-- ---------------------------------------------------------------------------
-- Replaced IN PLACE (identical signature; EXECUTE grants, revokes and the
-- comment re-stated). The body is the one of 20261003120000 with exactly one
-- addition: after the ownership check and the argument validation — so an
-- ownership failure is still 42501 and a malformed call still 22023, entitled
-- or not — and BEFORE the row is read or locked, the rule above decides; a
-- refusal returns ONE structured answer and touches nothing. Every other
-- path (APPLIED, CONFLICT, ABSENT, FINANCIAL_CONFLICT, the savepoint, the
-- deferred position uniqueness, the financial invariant) is byte-for-byte the
-- same.
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

  -- BeautIzzy Plus (6.5C, step 4): after ownership and argument validation,
  -- before any row is read or locked. Under the server-side switch only, a
  -- Business whose owner holds no verified production Plus entitlement has
  -- its write refused with ONE structured answer and nothing else happens:
  -- no lock, no read, no write, no version or tombstone bookkeeping. Never an
  -- error: ownership failures stay 42501 above, and the device keeps the
  -- entry pending (docs/architecture/CLOUD_SYNC.md §26).
  if not public.business_mutation_is_entitled(p_business_id) then
    return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');
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

comment on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) is
  'Cloud Sync push: writes ONE aggregate (row + complete child set) atomically, only when the caller acknowledged the current sync_version. Never overwrites an unseen revision. Since BeautIzzy Plus 6.5C: under the server-side switch, answers ENTITLEMENT_REQUIRED — nothing written — for an owner without verified production Plus access.';

revoke all on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) from public, anon;
grant execute on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The operator switch — flip, in ONE statement
-- ---------------------------------------------------------------------------
-- Result, as jsonb: { "enabled": <boolean>, "businesses_without_plus": n } —
-- the count is informational (how many Businesses would have their writes
-- refused right now, per THE access rule), computed whether enabling or
-- disabling. Nothing converges: a refused write is kept by the device and
-- sent again once Plus is back (Phase 6.5C step 3); the server holds no
-- queue to suspend. No EXECUTE grant at all: the table owner (the SQL
-- Editor's `postgres`) is the only caller. The mobile app, the worker and
-- the webhook can never flip the switch.
create or replace function public.business_mutation_set_entitlement_enforcement(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_without_plus integer;
begin
  if p_enabled is null then
    raise exception 'business mutation: enabled must be true or false' using errcode = '22023';
  end if;

  insert into public.server_feature_flags (flag, enabled, enabled_at, updated_at)
  values ('BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT', p_enabled,
          case when p_enabled then now() end, now())
  on conflict (flag) do update set
    enabled = excluded.enabled,
    enabled_at = case when excluded.enabled then now() end,
    updated_at = now();

  select count(*)::integer into v_without_plus
    from public.businesses b
   where not public.subscription_has_plus_access(b.owner_user_id, now());

  return jsonb_build_object('enabled', p_enabled, 'businesses_without_plus', v_without_plus);
end;
$$;

comment on function public.business_mutation_set_entitlement_enforcement(boolean) is
  'BeautIzzy Plus 6.5C: the OPERATOR switch — flips BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT and reports how many Businesses lack verified production Plus access. No EXECUTE grant: table owner only.';

revoke all on function public.business_mutation_set_entitlement_enforcement(boolean) from public, anon, authenticated, service_role;
